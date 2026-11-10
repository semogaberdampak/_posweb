-- Migrasi 018: TUTUP TRANSAKSI HARIAN (tutup kasir).
-- Satu penutupan per (cabang, tanggal). Angka penutupan DIHITUNG ULANG dari tabel sales di server
-- (klien tidak mengirim total), disimpan sebagai SNAPSHOT supaya laporan hari itu tidak berubah
-- walau ada transaksi/void susulan (keadaan itu dilaporkan sebagai "changed_after_close").
-- Hak: fitur baru `daily_close` (c = boleh menutup, r = boleh melihat). Tulis hanya lewat RPC.
-- Aman diulang.

create table if not exists daily_closings (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branches(id),
  close_date      date not null,
  closed_by       uuid not null references auth.users(id),
  closed_at       timestamptz not null default now(),
  total_count     integer not null default 0,          -- transaksi selesai
  gross           numeric(14,0) not null default 0,    -- subtotal sebelum diskon
  discount        numeric(14,0) not null default 0,
  net             numeric(14,0) not null default 0,    -- total penjualan
  void_count      integer not null default 0,
  void_total      numeric(14,0) not null default 0,
  by_method       jsonb not null default '{}'::jsonb,  -- [{method,count,net}]
  cash_expected   numeric(14,0) not null default 0,    -- uang tunai yang seharusnya ada di laci
  cash_counted    numeric(14,0) check (cash_counted is null or cash_counted >= 0),
  cash_difference numeric(14,0) generated always as (
    case when cash_counted is null then null else cash_counted - cash_expected end) stored,
  note            text check (note is null or length(note) <= 500)
);
create unique index if not exists daily_closings_branch_date on daily_closings (branch_id, close_date);
create index if not exists daily_closings_date on daily_closings (close_date desc);

alter table daily_closings enable row level security;

-- baca: butuh hak lihat (atau hak menutup) DAN akses cabang. Tidak ada policy tulis.
drop policy if exists daily_closings_r on daily_closings;
create policy daily_closings_r on daily_closings for select to authenticated
  using ((has_perm('daily_close','r') or has_perm('daily_close','c')) and can_see_branch(branch_id));

revoke all on table daily_closings from public, anon, authenticated;
grant select on daily_closings to authenticated;

-- fitur baru + hak bawaan (hanya bila belum ada; perubahan superadmin tidak ditimpa)
insert into features(key, label) values ('daily_close','Tutup transaksi harian')
on conflict (key) do nothing;

insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'daily_close', p.c, p.r, false, false
  from (values ('superadmin', true, true), ('kasir', true, true), ('kabag', false, true), ('keuangan', false, true)) p(role, c, r)
  join roles r on r.name = p.role
on conflict (role_id, feature_key) do nothing;

-- ---------- ringkasan satu hari (dipakai halaman sebelum & sesudah menutup) ----------
create or replace function daily_close_summary(p_branch uuid default null, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_branch uuid; v_date date; v_from timestamptz; v_to timestamptz;
  v_count int; v_gross numeric; v_disc numeric; v_net numeric; v_void_count int; v_void_total numeric;
  v_cash numeric; v_meth jsonb; v_close jsonb; v_changed boolean := false;
begin
  if not (has_perm('daily_close','r') or has_perm('daily_close','c')) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  if v_date < date '2000-01-01' or v_date > date '2100-12-31' then raise exception 'tanggal tidak valid'; end if;

  -- penutupan selalu untuk SATU cabang: p_branch null = cabang milik user
  if p_branch is not null then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
    v_branch := p_branch;
  else
    select branch_id into v_branch from profiles where id = auth.uid();
    if v_branch is null then raise exception 'user tidak punya cabang'; end if;
  end if;

  v_from := v_date::timestamp at time zone 'Asia/Jakarta';        -- 00:00 WIB (inklusif)
  v_to   := (v_date + 1)::timestamp at time zone 'Asia/Jakarta';  -- 00:00 WIB hari berikut (eksklusif)

  select count(*) filter (where status = 'completed'),
         coalesce(sum(subtotal) filter (where status = 'completed'), 0),
         coalesce(sum(discount_amount) filter (where status = 'completed'), 0),
         coalesce(sum(total) filter (where status = 'completed'), 0),
         count(*) filter (where status = 'void'),
         coalesce(sum(total) filter (where status = 'void'), 0)
    into v_count, v_gross, v_disc, v_net, v_void_count, v_void_total
    from sales where branch_id = v_branch and created_at >= v_from and created_at < v_to;

  select coalesce(sum(total), 0) into v_cash from sales
   where branch_id = v_branch and created_at >= v_from and created_at < v_to
     and status = 'completed' and payment_method = 'cash';

  select coalesce(jsonb_agg(jsonb_build_object('method', m.payment_method, 'count', m.c, 'net', m.t) order by m.t desc), '[]'::jsonb)
    into v_meth
    from (select payment_method, count(*) c, sum(total) t from sales
           where branch_id = v_branch and created_at >= v_from and created_at < v_to and status = 'completed'
           group by payment_method) m;

  select jsonb_build_object(
           'closed_at', c.closed_at, 'closed_by_name', coalesce(p.full_name, '-'),
           'total_count', c.total_count, 'gross', c.gross, 'discount', c.discount, 'net', c.net,
           'void_count', c.void_count, 'void_total', c.void_total, 'by_method', c.by_method,
           'cash_expected', c.cash_expected, 'cash_counted', c.cash_counted,
           'cash_difference', c.cash_difference, 'note', c.note)
    into v_close
    from daily_closings c left join profiles p on p.id = c.closed_by
   where c.branch_id = v_branch and c.close_date = v_date;

  if v_close is not null then
    v_changed := (v_close->>'total_count')::int <> v_count or (v_close->>'net')::numeric <> v_net;
  end if;

  return jsonb_build_object(
    'branch_id', v_branch,
    'branch_name', (select name from branches where id = v_branch),
    'date', v_date,
    'totals', jsonb_build_object('count', v_count, 'gross', v_gross, 'discount', v_disc, 'net', v_net,
                                 'void_count', v_void_count, 'void_total', v_void_total),
    'by_method', v_meth,
    'cash_expected', v_cash,
    'closing', v_close,
    'changed_after_close', v_changed);
end $$;

-- ---------- tutup hari (sekali per cabang per tanggal) ----------
create or replace function close_day(p_branch uuid default null, p_date date default null,
                                     p_cash_counted numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_date date; v_from timestamptz; v_to timestamptz;
  v_count int; v_gross numeric; v_disc numeric; v_net numeric; v_void_count int; v_void_total numeric;
  v_cash numeric; v_meth jsonb; v_id uuid;
begin
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

revoke all on function daily_close_summary(uuid, date), close_day(uuid, date, numeric, text) from public, anon;
grant execute on function daily_close_summary(uuid, date), close_day(uuid, date, numeric, text) to authenticated;
