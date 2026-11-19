-- Migrasi 029: halaman MEMBER KBS (data kode + nama toko KBS).
--   * Fitur baru `member_kbs` (r = buka halaman, c/u/d = tambah/ubah/hapus + impor).
--     Bawaan: hanya superadmin. Role lain bisa diberi lewat halaman Pengguna & Role.
--   * RPC daftar/cari + jumlah, simpan, hapus. Tabel kbs_members tetap tanpa akses langsung
--     (revoke dari anon/authenticated, hanya lewat RPC).
--   * import_kbs_members tetap ada, tetapi izinnya mengikuti hak `member_kbs.c`
--     (superadmin otomatis boleh, karena punya semua hak).
-- Aman diulang.

-- ---------- 1) fitur & hak bawaan ----------
insert into features(key, label) values ('member_kbs', 'Member KBS (toko)')
on conflict (key) do nothing;

insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'member_kbs', true, true, true, true
  from roles r
 where r.name = 'superadmin'
   and not exists (select 1 from role_permissions rp
                    where rp.role_id = r.id and rp.feature_key = 'member_kbs');

-- ---------- 2) daftar + pencarian + jumlah ----------
-- Mengembalikan satu objek JSON: rows (maks. p_limit), matched (hasil pencarian),
-- total/active/inactive (SELURUH tabel, tidak terpengaruh pencarian/filter).
create or replace function kbs_member_list(
  p_query       text    default null,
  p_only_active boolean default false,
  p_limit       int     default 200,
  p_offset      int     default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_raw text; v_like text; v_limit int; v_offset int;
  v_rows jsonb; v_matched int; v_total int; v_active int;
begin
  if not has_perm('member_kbs','r') then raise exception 'forbidden' using errcode = '42501'; end if;

  v_raw    := btrim(coalesce(p_query, ''));
  v_like   := replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_');
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  select count(*) into v_matched
    from kbs_members k
   where (not coalesce(p_only_active, false) or k.is_active)
     and (v_raw = '' or k.code ilike v_like || '%' or k.name ilike '%' || v_like || '%');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'code', x.code, 'name', x.name, 'is_active', x.is_active,
           'created_at', x.created_at, 'updated_at', x.updated_at
         ) order by x.code), '[]'::jsonb)
    into v_rows
    from (
      select k.* from kbs_members k
       where (not coalesce(p_only_active, false) or k.is_active)
         and (v_raw = '' or k.code ilike v_like || '%' or k.name ilike '%' || v_like || '%')
       order by k.code
       limit v_limit offset v_offset
    ) x;

  select count(*), count(*) filter (where is_active) into v_total, v_active from kbs_members;

  return jsonb_build_object(
    'rows', v_rows, 'matched', v_matched,
    'total', v_total, 'active', v_active, 'inactive', v_total - v_active
  );
end $$;

-- ---------- 3) tambah / ubah satu member toko ----------
create or replace function kbs_member_save(
  p_id     uuid,
  p_code   text,
  p_name   text,
  p_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id; v_code text; v_name text;
begin
  v_code := upper(btrim(coalesce(p_code, '')));
  v_name := btrim(coalesce(p_name, ''));

  if v_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
    raise exception 'kode member toko tidak valid (1–40 huruf/angka, boleh titik, strip, garis miring)';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'nama member toko wajib diisi (maks. 120 huruf)';
  end if;

  if v_id is null then
    if not has_perm('member_kbs','c') then raise exception 'forbidden' using errcode = '42501'; end if;
    insert into kbs_members(code, name, is_active) values (v_code, v_name, coalesce(p_active, true))
    returning id into v_id;
  else
    if not has_perm('member_kbs','u') then raise exception 'forbidden' using errcode = '42501'; end if;
    update kbs_members
       set code = v_code, name = v_name, is_active = coalesce(p_active, true), updated_at = now()
     where id = v_id;
    if not found then raise exception 'member toko tidak ditemukan'; end if;
  end if;

  -- Pengaturan cabang menyimpan salinan nama; samakan bila kode ini dipakai cabang.
  update app_settings s
     set value = jsonb_set(s.value, '{name}', to_jsonb(v_name)), updated_at = now()
   where s.key like 'store_member.%' and s.value->>'code' = v_code;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'kbs_member.save', 'kbs_members', v_id::text,
          jsonb_build_object('code', v_code, 'name', v_name, 'active', coalesce(p_active, true)));
  return v_id;
exception
  when unique_violation then
    raise exception 'kode member toko % sudah dipakai', v_code;
end $$;

-- ---------- 4) hapus satu member toko ----------
create or replace function kbs_member_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not has_perm('member_kbs','d') then raise exception 'forbidden' using errcode = '42501'; end if;
  select code into v_code from kbs_members where id = p_id;
  if not found then raise exception 'member toko tidak ditemukan'; end if;

  if exists (select 1 from app_settings s
              where s.key like 'store_member.%' and s.value->>'code' = v_code) then
    raise exception 'member toko % sedang dipakai pengaturan cabang; matikan dulu di Pengaturan cabang itu', v_code;
  end if;

  delete from kbs_members where id = p_id;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'kbs_member.delete', 'kbs_members', p_id::text,
          jsonb_build_object('code', v_code));
end $$;

-- ---------- 5) impor mengikuti hak member_kbs.c (dulu hanya superadmin) ----------
create or replace function import_kbs_members(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n int; v_ins int := 0; v_upd int := 0; v_bad int := 0;
  v_bad_sample text[] := '{}';
  r record; v_code text; v_name text; v_active boolean;
begin
  if not has_perm('member_kbs','c') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'data member toko tidak valid'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 50000 then raise exception 'terlalu banyak baris (maks. 50.000)'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := upper(btrim(coalesce(r.value->>'code', '')));
    v_name := btrim(coalesce(r.value->>'name', ''));
    v_active := coalesce((r.value->>'is_active')::boolean, true);
    if v_code !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' or v_name = '' or length(v_name) > 120 then
      v_bad := v_bad + 1;
      if array_length(v_bad_sample, 1) is null or array_length(v_bad_sample, 1) < 5 then
        v_bad_sample := v_bad_sample || coalesce(v_code, '(kosong)');
      end if;
      continue;
    end if;
    if exists (select 1 from kbs_members where code = v_code) then
      v_upd := v_upd + 1;
    else
      v_ins := v_ins + 1;
    end if;
    insert into kbs_members(code, name, is_active, updated_at)
    values (v_code, v_name, v_active, now())
    on conflict (code) do update
      set name = excluded.name, is_active = excluded.is_active, updated_at = now();
  end loop;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'kbs_member.import', 'kbs_members', null,
          jsonb_build_object('rows', v_n, 'invalid', v_bad, 'inserted', v_ins, 'updated', v_upd));
  return jsonb_build_object('rows', v_n, 'inserted', v_ins, 'updated', v_upd,
                            'invalid', v_bad, 'invalid_sample', v_bad_sample);
end $$;

-- ---------- 6) hak eksekusi ----------
revoke all on function kbs_member_list(text, boolean, int, int) from public, anon;
revoke all on function kbs_member_save(uuid, text, text, boolean) from public, anon;
revoke all on function kbs_member_delete(uuid) from public, anon;
revoke all on function import_kbs_members(jsonb) from public, anon;
grant execute on function kbs_member_list(text, boolean, int, int),
                    kbs_member_save(uuid, text, text, boolean),
                    kbs_member_delete(uuid),
                    import_kbs_members(jsonb)
  to authenticated;
