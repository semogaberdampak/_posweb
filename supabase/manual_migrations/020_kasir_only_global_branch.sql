-- Migrasi 020: (a) TUTUP KASIR HANYA role `kasir`, (b) cabang "Global" untuk role lintas cabang.
-- Aman diulang (idempoten).
--
-- (a) Menutup hari (close_day) hanya boleh oleh user dengan role `kasir`. Hak `daily_close.c`
--     dicabut dari role lain (termasuk superadmin) dan RPC tetap memeriksa NAMA role di server,
--     jadi mengubah matriks hak di aplikasi pun tidak bisa membuka kembali penutupan untuk role lain.
--     Hak `daily_close.r` TETAP ada untuk kabag/keuangan: dipakai RPC `closing_status` (migrasi 019)
--     yang menampilkan status "sudah/belum ditutup" di Rekap Penjualan.
-- (b) profiles.branch_id boleh NULL = "Global" (bekerja lintas cabang memakai pemilih "Cabang aktif").
--     Wajib diisi hanya untuk role yang BUKAN lintas cabang (mis. kasir).

-- ---------- (a) pembatas role kasir ----------
create or replace function public._is_kasir(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
     where p.id = p_user and p.is_active and r.name = 'kasir'
  )
$$;
revoke all on function public._is_kasir(uuid) from public, anon, authenticated;

create or replace function close_day(p_branch uuid default null, p_date date default null,
                                     p_cash_counted numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_date date; v_from timestamptz; v_to timestamptz;
  v_count int; v_gross numeric; v_disc numeric; v_net numeric; v_void_count int; v_void_total numeric;
  v_cash numeric; v_meth jsonb; v_id uuid;
begin
  if not _is_kasir(auth.uid()) then raise exception 'hanya kasir yang boleh menutup kasir' using errcode = '42501'; end if;
  if not has_perm('daily_close','c') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  if v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'tanggal tidak valid'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'tidak bisa menutup tanggal yang belum terjadi'; end if;

  if p_branch is not null then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
    v_branch := p_branch;
  else
    select branch_id into v_branch from profiles where id = auth.uid();
    if v_branch is null then raise exception 'user tidak punya cabang'; end if;
  end if;

  if p_cash_counted is not null and (p_cash_counted < 0 or p_cash_counted <> round(p_cash_counted)) then
    raise exception 'uang tunai dihitung tidak valid';
  end if;
  if p_note is not null and length(btrim(p_note)) > 500 then raise exception 'catatan terlalu panjang'; end if;

  -- kunci per (cabang, tanggal): klik ganda / dua kasir tidak bisa menutup dua kali
  perform pg_advisory_xact_lock(hashtextextended('daily_close:' || v_branch::text || ':' || v_date::text, 0));
  if exists (select 1 from daily_closings where branch_id = v_branch and close_date = v_date) then
    raise exception 'tanggal ini sudah ditutup';
  end if;

  v_from := v_date::timestamp at time zone 'Asia/Jakarta';
  v_to   := (v_date + 1)::timestamp at time zone 'Asia/Jakarta';

  select count(*) filter (where status = 'completed'),
         coalesce(sum(subtotal) filter (where status = 'completed'), 0),
         coalesce(sum(discount_amount) filter (where status = 'completed'), 0),
         coalesce(sum(total) filter (where status = 'completed'), 0),
         count(*) filter (where status = 'void'),
         coalesce(sum(total) filter (where status = 'void'), 0)
    into v_count, v_gross, v_disc, v_net, v_void_count, v_void_total
    from sales where branch_id = v_branch and created_at >= v_from and created_at < v_to;

  if v_count + v_void_count = 0 then raise exception 'belum ada transaksi pada tanggal ini'; end if;

  select coalesce(sum(total), 0) into v_cash from sales
   where branch_id = v_branch and created_at >= v_from and created_at < v_to
     and status = 'completed' and payment_method = 'cash';

  select coalesce(jsonb_agg(jsonb_build_object('method', m.payment_method, 'count', m.c, 'net', m.t) order by m.t desc), '[]'::jsonb)
    into v_meth
    from (select payment_method, count(*) c, sum(total) t from sales
           where branch_id = v_branch and created_at >= v_from and created_at < v_to and status = 'completed'
           group by payment_method) m;

  insert into daily_closings(branch_id, close_date, closed_by, total_count, gross, discount, net,
                             void_count, void_total, by_method, cash_expected, cash_counted, note)
  values (v_branch, v_date, auth.uid(), v_count, v_gross, v_disc, v_net,
          v_void_count, v_void_total, v_meth, v_cash, p_cash_counted, nullif(btrim(coalesce(p_note,'')), ''))
  returning id into v_id;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'daily.close', 'daily_closings', v_id::text,
          jsonb_build_object('branch', v_branch, 'date', v_date, 'net', v_net,
                             'cash_expected', v_cash, 'cash_counted', p_cash_counted));

  return daily_close_summary(v_branch, v_date);
end $$;

revoke all on function close_day(uuid, date, numeric, text) from public, anon;
grant execute on function close_day(uuid, date, numeric, text) to authenticated;

-- hak menutup dicabut dari semua role selain kasir; lihat tetap ada (dipakai closing_status)
update role_permissions rp
   set can_create = false
 where rp.feature_key = 'daily_close' and rp.can_create
   and rp.role_id not in (select id from roles where name = 'kasir');

insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'daily_close', true, true, false, false from roles r where r.name = 'kasir'
on conflict (role_id, feature_key) do update set can_create = true, can_read = true;

-- ---------- (b) cabang "Global" ----------
-- set_user_role: p_branch NULL = Global, hanya boleh untuk role lintas cabang.
create or replace function set_user_role(p_user uuid, p_role uuid, p_branch uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_all boolean;
begin
  if not has_perm('users','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'tidak boleh mengubah role Anda sendiri'; end if;
  if _is_superadmin(p_user) then raise exception 'superadmin tidak bisa diubah dari aplikasi'; end if;
  select name, all_branches into v_role, v_all from roles where id = p_role;
  if v_role is null then raise exception 'role tidak ditemukan'; end if;
  if v_role = 'superadmin' and not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_branch is null then
    if not v_all then raise exception 'role ini wajib punya cabang'; end if;      -- kasir & role satu cabang
  else
    if not exists (select 1 from branches where id = p_branch and is_active) then raise exception 'cabang tidak valid'; end if;
  end if;
  update profiles set role_id = p_role, branch_id = p_branch where id = p_user;
  if not found then raise exception 'user tidak ditemukan'; end if;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'user.role', 'profiles', p_user::text,
          jsonb_build_object('role', v_role, 'branch', coalesce(p_branch::text, 'GLOBAL')));
end $$;

revoke all on function set_user_role(uuid, uuid, uuid) from public, anon;
grant execute on function set_user_role(uuid, uuid, uuid) to authenticated;

-- akun lama: semua role lintas cabang menjadi Global (kasir tetap di cabangnya)
update profiles p
   set branch_id = null
 where p.branch_id is not null
   and exists (select 1 from roles r where r.id = p.role_id and r.all_branches);
