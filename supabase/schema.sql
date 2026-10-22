-- =====================================================================
-- POS TERINTEGRASI - Supabase schema v1
-- Harga: global (1 harga untuk semua cabang). Stok: per cabang.
-- Prinsip: semua aturan dijaga di DATABASE (RLS + RPC), bukan di UI.
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang di DB kosong.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------- ENUM ----------
create type payment_method as enum ('cash','qris','debit','credit_card');
create type sale_status    as enum ('completed','void');

-- ---------- CABANG ----------
create table branches (
  id        uuid primary key default gen_random_uuid(),
  code      text unique not null,
  name      text not null,
  is_pusat  boolean not null default false,
  is_active boolean not null default true
);

-- ---------- ROLE & PERMISSION ----------
create table roles (
  id           uuid primary key default gen_random_uuid(),
  name         text unique not null,
  description  text,
  all_branches boolean not null default false,  -- true = boleh lihat semua cabang
  is_system    boolean not null default false   -- role bawaan tidak bisa dihapus
);

create table features (            -- daftar fitur; fitur baru = tambah baris
  key   text primary key,
  label text not null
);

create table role_permissions (
  role_id     uuid not null references roles(id) on delete cascade,
  feature_key text not null references features(key) on delete cascade,
  can_create  boolean not null default false,
  can_read    boolean not null default false,
  can_update  boolean not null default false,
  can_delete  boolean not null default false,
  primary key (role_id, feature_key)
);

create table profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  branch_id uuid references branches(id),
  role_id   uuid references roles(id),
  is_active boolean not null default true
);

-- ---------- HELPER OTORISASI ----------
create or replace function has_perm(p_feature text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_action
             when 'c' then rp.can_create when 'r' then rp.can_read
             when 'u' then rp.can_update when 'd' then rp.can_delete end
    from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    where p.id = auth.uid() and p.is_active and rp.feature_key = p_feature
  ), false);
$$;

create or replace function can_see_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (p.branch_id = p_branch) or r.all_branches
    from profiles p join roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active
  ), false);
$$;

-- ---------- PRODUK (harga global) ----------
create table products (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null check (length(code) between 1 and 40),
  name       text not null check (length(name) between 1 and 200),
  price      numeric(12,0) not null check (price >= 0),
  is_active  boolean not null default true,   -- soft delete, tidak ada DELETE
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index products_name_trgm on products using gin (name gin_trgm_ops);
create index products_code_trgm on products using gin (code gin_trgm_ops);

create table product_price_history (
  id         bigint generated always as identity primary key,
  product_id uuid not null references products(id),
  old_price  numeric(12,0),
  new_price  numeric(12,0) not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- history ditulis AFTER (produk sudah ada), stempel user/waktu ditulis BEFORE
create or replace function trg_price_history_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into product_price_history(product_id, old_price, new_price, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.price end, new.price, auth.uid());
  end if;
  return null;
end $$;
create or replace function trg_products_stamp() returns trigger
language plpgsql as $$
begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end $$;
create trigger products_stamp before insert or update on products
  for each row execute function trg_products_stamp();
create trigger products_price_hist after insert or update on products
  for each row execute function trg_price_history_after();

-- ---------- STOK PER CABANG ----------
create table stock (
  branch_id  uuid not null references branches(id),
  product_id uuid not null references products(id),
  qty        integer not null default 0 check (qty >= 0),   -- tidak boleh minus
  primary key (branch_id, product_id)
);

create table stock_movements (      -- ledger stok, append-only
  id         bigint generated always as identity primary key,
  branch_id  uuid not null references branches(id),
  product_id uuid not null references products(id),
  qty_change integer not null,
  reason     text not null check (reason in ('sale','void','receive','adjust','opname','initial')),
  ref_id     uuid,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index stock_mov_branch_time on stock_movements (branch_id, created_at desc);

-- ---------- MEMBER ----------
create table members (
  id        uuid primary key default gen_random_uuid(),
  member_no text unique not null,
  name      text not null,
  is_active boolean not null default true
);

-- ---------- PENJUALAN ----------
create sequence invoice_seq;

create table sales (
  id              uuid primary key default gen_random_uuid(),
  invoice_no      text unique not null,
  branch_id       uuid not null references branches(id),
  cashier_id      uuid not null references auth.users(id),
  subtotal        numeric(14,0) not null default 0 check (subtotal >= 0),
  discount_pct    smallint not null default 0 check (discount_pct in (0,5,10,15,20,25)),
  discount_amount numeric(14,0) not null default 0,
  total           numeric(14,0) not null default 0 check (total >= 0),
  payment_method  payment_method not null,
  cash_received   numeric(14,0),
  change_amount   numeric(14,0),
  member_id       uuid references members(id),
  member_label    text,                       -- teks bebas yang diketik kasir
  status          sale_status not null default 'completed',
  void_reason     text,
  voided_by       uuid references auth.users(id),
  voided_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index sales_branch_time on sales (branch_id, created_at desc);
create index sales_time        on sales (created_at desc);

create table sale_items (       -- snapshot harga saat transaksi
  id         bigint generated always as identity primary key,
  sale_id    uuid not null references sales(id) on delete restrict,
  product_id uuid not null references products(id),
  code       text not null,
  name       text not null,
  unit_price numeric(12,0) not null,
  qty        integer not null check (qty > 0),
  line_total numeric(14,0) not null
);
create index sale_items_sale on sale_items (sale_id);

create table audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- RPC TRANSAKSI (security definer; harga/diskon/cabang dihitung di server)
-- =====================================================================
create or replace function create_sale(
  p_items         jsonb,
  p_discount_pct  int,
  p_member        text,
  p_method        payment_method,
  p_cash_received numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_sale uuid := gen_random_uuid(); v_inv text;
  v_sub numeric := 0; v_disc numeric; v_total numeric; v_change numeric;
  v_member uuid; r record; v_code text; v_name text; v_price numeric;
begin
  if not has_perm('pos','c') then raise exception 'forbidden' using errcode = '42501'; end if;

  select branch_id into v_branch from profiles where id = auth.uid() and is_active;
  if v_branch is null then raise exception 'user tidak punya cabang'; end if;

  if p_discount_pct not in (0,5,10,15,20,25) then raise exception 'diskon tidak valid'; end if;
  if p_discount_pct > 0 and coalesce(btrim(p_member),'') = '' then
    raise exception 'member wajib diisi bila memakai diskon';
  end if;
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'item tidak valid';
  end if;

  v_inv := 'INV-' || to_char(now() at time zone 'Asia/Jakarta','YYMMDD')
           || '-' || lpad(nextval('invoice_seq')::text, 6, '0');

  select id into v_member from members
   where member_no = btrim(p_member) and is_active;

  insert into sales(id, invoice_no, branch_id, cashier_id, payment_method,
                    discount_pct, member_id, member_label)
  values (v_sale, v_inv, v_branch, auth.uid(), p_method,
          p_discount_pct, v_member, nullif(btrim(p_member),''));

  -- urut by product_id agar tidak deadlock; item duplikat digabung
  for r in
    select (x->>'product_id')::uuid as pid, sum((x->>'qty')::int) as qty
    from jsonb_array_elements(p_items) x
    group by 1 order by 1
  loop
    if r.qty <= 0 or r.qty > 9999 then raise exception 'qty tidak valid'; end if;

    select code, name, price into v_code, v_name, v_price
      from products where id = r.pid and is_active;
    if not found then raise exception 'produk tidak ditemukan/nonaktif'; end if;

    update stock set qty = qty - r.qty
     where branch_id = v_branch and product_id = r.pid and qty >= r.qty;
    if not found then raise exception 'stok tidak cukup: %', v_code; end if;

    insert into sale_items(sale_id, product_id, code, name, unit_price, qty, line_total)
    values (v_sale, r.pid, v_code, v_name, v_price, r.qty, v_price * r.qty);

    insert into stock_movements(branch_id, product_id, qty_change, reason, ref_id, created_by)
    values (v_branch, r.pid, -r.qty, 'sale', v_sale, auth.uid());

    v_sub := v_sub + v_price * r.qty;
  end loop;

  v_disc  := round(v_sub * p_discount_pct / 100.0);
  v_total := v_sub - v_disc;

  if p_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then
      raise exception 'uang diterima kurang';
    end if;
    v_change := p_cash_received - v_total;
  end if;

  update sales set subtotal = v_sub, discount_amount = v_disc, total = v_total,
         cash_received = case when p_method = 'cash' then p_cash_received end,
         change_amount = v_change
   where id = v_sale;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'sale.create', 'sales', v_sale::text,
          jsonb_build_object('invoice', v_inv, 'total', v_total, 'method', p_method));

  return jsonb_build_object('sale_id', v_sale, 'invoice_no', v_inv,
                            'subtotal', v_sub, 'discount', v_disc,
                            'total', v_total, 'change', coalesce(v_change, 0));
end $$;

create or replace function void_sale(p_sale uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s sales; r record;
begin
  if not has_perm('sales_void','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'alasan wajib'; end if;

  select * into s from sales where id = p_sale for update;
  if not found or s.status <> 'completed' then raise exception 'transaksi tidak bisa di-void'; end if;
  if not can_see_branch(s.branch_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  for r in select product_id, qty from sale_items where sale_id = p_sale order by product_id loop
    update stock set qty = qty + r.qty where branch_id = s.branch_id and product_id = r.product_id;
    insert into stock_movements(branch_id, product_id, qty_change, reason, ref_id, created_by)
    values (s.branch_id, r.product_id, r.qty, 'void', p_sale, auth.uid());
  end loop;

  update sales set status = 'void', void_reason = p_reason,
         voided_by = auth.uid(), voided_at = now() where id = p_sale;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'sale.void', 'sales', p_sale::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function adjust_stock(p_branch uuid, p_product uuid, p_delta int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('stock','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason not in ('receive','adjust','opname','initial') then raise exception 'reason tidak valid'; end if;
  if p_delta = 0 then return; end if;

  insert into stock(branch_id, product_id, qty) values (p_branch, p_product, p_delta)
  on conflict (branch_id, product_id) do update set qty = stock.qty + excluded.qty;

  insert into stock_movements(branch_id, product_id, qty_change, reason, created_by)
  values (p_branch, p_product, p_delta, p_reason, auth.uid());
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.adjust', 'stock', p_product::text,
          jsonb_build_object('branch', p_branch, 'delta', p_delta, 'reason', p_reason));
end $$;

-- =====================================================================
-- RLS: aktifkan di SEMUA tabel. Tulis ke sales/stock hanya via RPC.
-- =====================================================================
alter table branches              enable row level security;
alter table roles                 enable row level security;
alter table features              enable row level security;
alter table role_permissions      enable row level security;
alter table profiles              enable row level security;
alter table products              enable row level security;
alter table product_price_history enable row level security;
alter table stock                 enable row level security;
alter table stock_movements       enable row level security;
alter table members               enable row level security;
alter table sales                 enable row level security;
alter table sale_items            enable row level security;
alter table audit_log             enable row level security;

-- baca referensi dasar: semua user login yang aktif
create policy branches_r on branches for select to authenticated using (has_perm('pos','r') or has_perm('users','r') or has_perm('stock','r') or has_perm('sales_recap','r'));
create policy branches_w on branches for all    to authenticated using (has_perm('users','u')) with check (has_perm('users','u'));

create policy roles_r on roles for select to authenticated using (has_perm('roles','r'));
create policy roles_w on roles for all    to authenticated using (has_perm('roles','u')) with check (has_perm('roles','u'));
create policy features_r on features for select to authenticated using (has_perm('roles','r'));
create policy rp_r on role_permissions for select to authenticated using (has_perm('roles','r'));
create policy rp_self on role_permissions for select to authenticated
  using (role_id = (select role_id from profiles where id = auth.uid()));  -- UI perlu hak akses miliknya
create policy rp_w on role_permissions for all    to authenticated using (has_perm('roles','u')) with check (has_perm('roles','u'));

create policy profiles_self on profiles for select to authenticated using (id = auth.uid() or has_perm('users','r'));
create policy profiles_w    on profiles for update to authenticated using (has_perm('users','u')) with check (has_perm('users','u'));
create policy profiles_i    on profiles for insert to authenticated with check (has_perm('users','c'));

create policy products_r on products for select to authenticated using (has_perm('products','r') or has_perm('pos','r'));
create policy products_i on products for insert to authenticated with check (has_perm('products','c'));
create policy products_u on products for update to authenticated using (has_perm('products','u')) with check (has_perm('products','u'));
-- sengaja TIDAK ada policy DELETE (nonaktifkan lewat is_active)

create policy pph_r on product_price_history for select to authenticated using (has_perm('products','r'));

create policy stock_r on stock for select to authenticated
  using ((has_perm('stock','r') or has_perm('pos','r')) and can_see_branch(branch_id));
create policy stockmov_r on stock_movements for select to authenticated
  using (has_perm('stock','r') and can_see_branch(branch_id));

create policy members_r on members for select to authenticated using (has_perm('pos','r'));
create policy members_i on members for insert to authenticated with check (has_perm('members','c'));
create policy members_u on members for update to authenticated using (has_perm('members','u')) with check (has_perm('members','u'));

create policy sales_r on sales for select to authenticated
  using (has_perm('sales_recap','r') and can_see_branch(branch_id));
create policy sale_items_r on sale_items for select to authenticated
  using (has_perm('sales_recap','r') and exists
        (select 1 from sales s where s.id = sale_id and can_see_branch(s.branch_id)));

create policy audit_r on audit_log for select to authenticated using (has_perm('audit','r'));

-- cabut akses langsung; hanya RPC yang boleh menulis transaksi/stok
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
grant select on branches, roles, features, role_permissions, profiles, products,
                product_price_history, stock, stock_movements, members, sales,
                sale_items, audit_log to authenticated;
grant insert, update on products, members, profiles to authenticated;
grant insert, update on branches, roles, role_permissions to authenticated;
grant execute on function has_perm(text,text), can_see_branch(uuid),
                          create_sale(jsonb,int,text,payment_method,numeric),
                          void_sale(uuid,text), adjust_stock(uuid,uuid,int,text)
      to authenticated;

-- =====================================================================
-- SEED: fitur & role bawaan (CRUD per fitur dikelola superadmin di UI)
-- =====================================================================
insert into features(key,label) values
 ('pos','Kasir / Input penjualan'), ('sales_recap','Rekap penjualan'),
 ('sales_void','Void transaksi'),   ('products','Produk & harga'),
 ('stock','Stok & penerimaan'),     ('purchasing','Purchase order'),
 ('members','Member'),              ('finance','Laporan keuangan'),
 ('users','Manajemen user'),        ('roles','Role & hak akses'),
 ('audit','Audit log'),             ('settings','Pengaturan');

insert into roles(name, description, all_branches, is_system) values
 ('superadmin','Kelola user & hak akses', true,  true),
 ('kasir',     'Input & rekap harian cabang sendiri', false, true),
 ('kabag',     'Rekap hasil inputan kasir', true,  true),
 ('pengadaan', 'Produk, harga, stok, PO', true,  true),
 ('keuangan',  'Rekap penjualan & metode bayar', true, true);

-- superadmin: semua hak
insert into role_permissions
select r.id, f.key, true, true, true, true from roles r, features f where r.name = 'superadmin';

-- helper seed: (role, fitur, c, r, u, d)
with p(role, feat, c, r, u, d) as (values
 ('kasir','pos',true,true,false,false),
 ('kasir','sales_recap',false,true,false,false),
 ('kasir','settings',false,true,true,false),
 ('kabag','sales_recap',false,true,false,false),
 ('kabag','sales_void',false,true,true,false),
 ('kabag','settings',false,true,true,false),
 ('pengadaan','products',true,true,true,false),
 ('pengadaan','stock',true,true,true,false),
 ('pengadaan','purchasing',true,true,true,false),
 ('pengadaan','settings',false,true,true,false),
 ('keuangan','sales_recap',false,true,false,false),
 ('keuangan','finance',false,true,false,false),
 ('keuangan','settings',false,true,true,false))
insert into role_permissions
select r.id, p.feat, p.c, p.r, p.u, p.d from p join roles r on r.name = p.role;

-- Cabang awal (contoh) - ubah sesuai kenyataan
insert into branches(code,name,is_pusat) values ('PUSAT','Kantor Pusat',true);
