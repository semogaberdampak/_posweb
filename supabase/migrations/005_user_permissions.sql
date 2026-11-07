-- Migrasi 005: hak akses GRANULAR. Role = paket hak (template); tiap user bisa punya PENGECUALIAN per fitur.
-- Semua perubahan hak hanya lewat fungsi di bawah (ada penjaga anti-eskalasi & audit). Aman diulang.

-- 1) Pengecualian per user. NULL = ikut role, true/false = menimpa role.
create table if not exists user_permissions (
  user_id     uuid not null references profiles(id) on delete cascade,
  feature_key text not null references features(key) on delete cascade,
  can_create boolean, can_read boolean, can_update boolean, can_delete boolean,
  primary key (user_id, feature_key)
);
alter table user_permissions enable row level security;
drop policy if exists up_r on user_permissions;
create policy up_r on user_permissions for select to authenticated using (user_id = auth.uid() or has_perm('users','r'));
revoke all on user_permissions from anon, authenticated;
grant select on user_permissions to authenticated;

-- 2) has_perm: pengecualian user menang atas role. Dipakai oleh SEMUA RLS & RPC yang sudah ada.
create or replace function has_perm(p_feature text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(
      (select case p_action when 'c' then up.can_create when 'r' then up.can_read
                            when 'u' then up.can_update when 'd' then up.can_delete end
         from user_permissions up where up.user_id = p.id and up.feature_key = p_feature),
      (select case p_action when 'c' then rp.can_create when 'r' then rp.can_read
                            when 'u' then rp.can_update when 'd' then rp.can_delete end
         from role_permissions rp where rp.role_id = p.role_id and rp.feature_key = p_feature)
    )
    from profiles p where p.id = auth.uid() and p.is_active
  ), false);
$$;

-- 3) Tutup penulisan langsung ke roles/role_permissions/profiles (harus lewat RPC di bawah)
drop policy if exists roles_w    on roles;
drop policy if exists rp_w       on role_permissions;
drop policy if exists profiles_w on profiles;
drop policy if exists profiles_i on profiles;
revoke insert, update, delete on roles, role_permissions, profiles from authenticated;

create or replace function _is_superadmin(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p join roles r on r.id = p.role_id
                 where p.id = p_user and p.is_active and r.name = 'superadmin');
$$;
revoke all on function _is_superadmin(uuid) from public, anon, authenticated;

-- 4) Daftar user (butuh email dari auth.users)
create or replace function list_users()
returns table(id uuid, email text, full_name text, branch_id uuid, role_id uuid, is_active boolean)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.full_name, p.branch_id, p.role_id, p.is_active
  from profiles p join auth.users u on u.id = p.id
  where has_perm('users','r') order by p.full_name;
$$;
revoke all on function list_users() from public, anon;
grant execute on function list_users() to authenticated;

-- 5) Hak per ROLE
create or replace function set_role_permission(p_role uuid, p_feature text, p_c boolean, p_r boolean, p_u boolean, p_d boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; c boolean := coalesce(p_c,false); r boolean := coalesce(p_r,false);
        u boolean := coalesce(p_u,false); d boolean := coalesce(p_d,false);
begin
  if not has_perm('roles','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  select name into v_name from roles where id = p_role;
  if v_name is null then raise exception 'role tidak ditemukan'; end if;
  if v_name = 'superadmin' then raise exception 'hak superadmin tidak bisa diubah'; end if;
  if p_role = (select role_id from profiles where id = auth.uid()) then raise exception 'tidak boleh mengubah hak role Anda sendiri'; end if;
  if not exists (select 1 from features where key = p_feature) then raise exception 'fitur tidak ditemukan'; end if;
  if c or u or d then r := true; end if;          -- tidak bisa menulis tanpa bisa melihat
  insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
  values (p_role, p_feature, c, r, u, d)
  on conflict (role_id, feature_key) do update
    set can_create = excluded.can_create, can_read = excluded.can_read,
        can_update = excluded.can_update, can_delete = excluded.can_delete;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'role.perm', 'roles', p_role::text, jsonb_build_object('feature', p_feature, 'c', c, 'r', r, 'u', u, 'd', d));
end $$;

-- 6) Pengecualian per USER (NULL = ikut role; semua NULL = hapus pengecualian)
create or replace function set_user_permission(p_user uuid, p_feature text, p_c boolean, p_r boolean, p_u boolean, p_d boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c boolean := p_c; r boolean := p_r; u boolean := p_u; d boolean := p_d;
begin
  if not has_perm('users','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'tidak boleh mengubah hak Anda sendiri'; end if;
  if _is_superadmin(p_user) then raise exception 'hak superadmin tidak bisa diubah'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'user tidak ditemukan'; end if;
  if not exists (select 1 from features where key = p_feature) then raise exception 'fitur tidak ditemukan'; end if;
  if r is false then c := false; u := false; d := false; end if;
  if c is true or u is true or d is true then r := true; end if;
  if c is null and r is null and u is null and d is null then
    delete from user_permissions where user_id = p_user and feature_key = p_feature;
  else
    insert into user_permissions(user_id, feature_key, can_create, can_read, can_update, can_delete)
    values (p_user, p_feature, c, r, u, d)
    on conflict (user_id, feature_key) do update
      set can_create = excluded.can_create, can_read = excluded.can_read,
          can_update = excluded.can_update, can_delete = excluded.can_delete;
  end if;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'user.perm', 'profiles', p_user::text, jsonb_build_object('feature', p_feature, 'c', c, 'r', r, 'u', u, 'd', d));
end $$;

-- 7) Ganti role / cabang user
create or replace function set_user_role(p_user uuid, p_role uuid, p_branch uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not has_perm('users','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'tidak boleh mengubah role Anda sendiri'; end if;
  if _is_superadmin(p_user) then raise exception 'superadmin tidak bisa diubah dari aplikasi'; end if;
  select name into v_role from roles where id = p_role;
  if v_role is null then raise exception 'role tidak ditemukan'; end if;
  if v_role = 'superadmin' and not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from branches where id = p_branch and is_active) then raise exception 'cabang tidak valid'; end if;
  update profiles set role_id = p_role, branch_id = p_branch where id = p_user;
  if not found then raise exception 'user tidak ditemukan'; end if;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'user.role', 'profiles', p_user::text, jsonb_build_object('role', v_role, 'branch', p_branch));
end $$;

create or replace function set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('users','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'tidak boleh menonaktifkan akun Anda sendiri'; end if;
  if _is_superadmin(p_user) then raise exception 'superadmin tidak bisa diubah dari aplikasi'; end if;
  update profiles set is_active = p_active where id = p_user;
  if not found then raise exception 'user tidak ditemukan'; end if;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'user.active', 'profiles', p_user::text, jsonb_build_object('active', p_active));
end $$;

-- 8) Buat role baru (hak awal kosong; atur lewat matriks)
create or replace function create_role(p_name text, p_desc text, p_all_branches boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := lower(btrim(p_name));
begin
  if not has_perm('roles','c') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_name !~ '^[a-z0-9_ ]{2,30}$' then raise exception 'nama role: 2-30 huruf kecil/angka/spasi/_'; end if;
  if exists (select 1 from roles where name = v_name) then raise exception 'nama role sudah dipakai'; end if;
  if coalesce(p_all_branches,false) and not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into roles(name, description, all_branches, is_system) values (v_name, left(p_desc,200), coalesce(p_all_branches,false), false) returning id into v_id;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'role.create', 'roles', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end $$;

revoke all on function set_role_permission(uuid,text,boolean,boolean,boolean,boolean),
                       set_user_permission(uuid,text,boolean,boolean,boolean,boolean),
                       set_user_role(uuid,uuid,uuid), set_user_active(uuid,boolean),
                       create_role(text,text,boolean) from public, anon;
grant execute on function set_role_permission(uuid,text,boolean,boolean,boolean,boolean),
                          set_user_permission(uuid,text,boolean,boolean,boolean,boolean),
                          set_user_role(uuid,uuid,uuid), set_user_active(uuid,boolean),
                          create_role(text,text,boolean) to authenticated;
