-- Migrasi 027: MEMBER TOKO (KBS) — placeholder.
--   * kbs_members = data membership KBS (kode + nama toko). Tabel BELUM berisi data;
--     impor nanti HANYA lewat RPC import_kbs_members (superadmin). Tidak ada akses tulis langsung.
--   * Setiap CABANG bisa menyalakan opsi "Gunakan member toko" di Pengaturan.
--     Yang mengatur: kasir cabang itu sendiri, atau superadmin (cabang mana pun).
--   * Bila menyala, transaksi TANPA diskon otomatis memakai kode+nama toko tersebut
--     sebagai member_label (tampil di struk sebagai {pelanggan}).
--   * Transaksi berdiskon TIDAK memakai member toko: tetap wajib member TAKOM yang terdaftar.
-- Aman diulang.

-- ---------- 1) tabel data KBS (placeholder) ----------
create table if not exists kbs_members (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kbs_members_code_upper_idx on kbs_members (upper(code));

alter table kbs_members enable row level security;
-- Tidak ada policy & tidak ada grant: data hanya dibaca lewat RPC pencarian di bawah.
revoke all on kbs_members from anon, authenticated;

-- ---------- 2) impor data KBS (HANYA superadmin) ----------
create or replace function import_kbs_members(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n int; v_ins int := 0; v_upd int := 0; v_bad int := 0;
  v_bad_sample text[] := '{}';
  r record; v_code text; v_name text; v_active boolean;
begin
  if not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
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

-- ---------- 3) pencarian kode toko untuk Pengaturan ----------
create or replace function kbs_member_search(p_query text)
returns table(code text, name text)
language plpgsql security definer set search_path = public as $$
declare v_raw text; v_like text;
begin
  if not (_is_kasir(auth.uid()) or _is_superadmin(auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_raw := btrim(coalesce(p_query, ''));
  v_like := replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select k.code, k.name from kbs_members k
     where k.is_active
       and (v_raw = '' or upper(k.code) = upper(v_raw)
            or k.code ilike v_like || '%' or k.name ilike '%' || v_like || '%')
     order by (upper(k.code) = upper(v_raw)) desc, k.code
     limit 20;
end $$;

-- ---------- 4) baca / simpan pengaturan member toko per cabang ----------
create or replace function store_member_get(p_branch uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_branch uuid := p_branch; v jsonb;
begin
  if not (_is_kasir(auth.uid()) or _is_superadmin(auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_branch is null then select branch_id into v_branch from profiles where id = auth.uid(); end if;
  if v_branch is null then return jsonb_build_object('enabled', false); end if;
  if not can_see_branch(v_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v from app_settings where key = 'store_member.' || v_branch::text;
  return coalesce(v, jsonb_build_object('enabled', false, 'code', null, 'name', null));
end $$;

create or replace function store_member_save(p_branch uuid, p_enabled boolean, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid := p_branch; v_own uuid; v_code text; v_name text; v_value jsonb;
begin
  select branch_id into v_own from profiles where id = auth.uid();
  if v_branch is null then v_branch := v_own; end if;
  if v_branch is null then raise exception 'cabang tidak valid'; end if;

  if _is_superadmin(auth.uid()) then
    if not exists (select 1 from branches where id = v_branch and is_active) then raise exception 'cabang tidak valid'; end if;
  elsif _is_kasir(auth.uid()) then
    if v_branch is distinct from v_own then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if coalesce(p_enabled, false) then
    select k.code, k.name into v_code, v_name
      from kbs_members k where k.code = v_code and k.is_active;
    if not found then raise exception 'kode member toko tidak ditemukan/nonaktif'; end if;
  else
    v_code := nullif(v_code, '');
    v_name := null;
  end if;

  v_value := jsonb_build_object('enabled', coalesce(p_enabled, false), 'code', v_code, 'name', v_name,
                                'branch_id', v_branch);
  insert into app_settings(key, value, updated_by, updated_at)
  values ('store_member.' || v_branch::text, v_value, auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'settings.store_member', 'app_settings', 'store_member.' || v_branch::text,
          jsonb_build_object('branch', v_branch, 'enabled', coalesce(p_enabled, false),
                             'code', v_code, 'name', v_name));
  return v_value;
end $$;

-- ---------- 5) create_sale: transaksi tanpa diskon memakai member toko ----------
create or replace function create_sale(
  p_items         jsonb,      -- [{product_id, qty, discount_pct}]
  p_member        text,       -- nomor member (opsional bila tanpa diskon; WAJIB bila ada diskon)
  p_method        payment_method,
  p_cash_received numeric default null,
  p_branch        uuid default null,
  p_request_id    uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_sale uuid := gen_random_uuid(); v_inv text;
  v_sub numeric := 0; v_disc numeric := 0; v_total numeric; v_change numeric;
  v_member uuid; v_member_name text; v_member_label text;
  v_store jsonb; v_sm_code text; v_sm_name text;
  r record; v_code text; v_name text; v_price numeric;
  v_gross numeric; v_ld numeric;
  o_id uuid; o_inv text; o_sub numeric; o_disc numeric; o_total numeric; o_change numeric; o_member text;
begin
  if not has_perm('pos','c') then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    select id, invoice_no, subtotal, discount_amount, total, coalesce(change_amount, 0), member_label
      into o_id, o_inv, o_sub, o_disc, o_total, o_change, o_member
      from sales where request_id = p_request_id and cashier_id = auth.uid();
    if found then
      return jsonb_build_object('sale_id', o_id, 'invoice_no', o_inv, 'subtotal', o_sub,
                                'discount', o_disc, 'total', o_total, 'change', o_change,
                                'member', o_member);
    end if;
    if exists (select 1 from sales where request_id = p_request_id) then
      raise exception 'kunci permintaan sudah dipakai transaksi lain';
    end if;
  end if;

  select branch_id into v_branch from profiles where id = auth.uid() and is_active;
  if p_branch is not null and p_branch is distinct from v_branch then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
    if not exists (select 1 from branches where id = p_branch and is_active) then raise exception 'cabang tidak valid'; end if;
    v_branch := p_branch;
  end if;
  if v_branch is null then raise exception 'user tidak punya cabang'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'item tidak valid';
  end if;

  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'discount_pct')::int, 0) <> 0)
     and coalesce(btrim(p_member), '') = '' then
    raise exception 'member wajib diisi bila memakai diskon';
  end if;

  -- member harus benar-benar terdaftar & aktif (bukan sekadar teks bebas)
  if coalesce(btrim(p_member), '') <> '' then
    select id, name into v_member, v_member_name
      from members where member_no = upper(btrim(p_member)) and is_active;
    if not found then raise exception 'member % tidak terdaftar atau nonaktif', btrim(p_member); end if;
    v_member_label := upper(btrim(p_member)) || ' - ' || v_member_name;
  end if;

  v_inv := 'INV-' || to_char(now() at time zone 'Asia/Jakarta','YYMMDD')
           || '-' || lpad(nextval('invoice_seq')::text, 6, '0');

  insert into sales(id, invoice_no, branch_id, cashier_id, payment_method, member_id, member_label, request_id)
  values (v_sale, v_inv, v_branch, auth.uid(), p_method, v_member, v_member_label, p_request_id);

  for r in
    select (x->>'product_id')::uuid as pid, (x->>'qty')::int as qty,
           coalesce((x->>'discount_pct')::int, 0) as dpct
    from jsonb_array_elements(p_items) x
    order by 1, 3
  loop
    if r.qty <= 0 or r.qty > 9999 then raise exception 'qty tidak valid'; end if;
    if r.dpct not in (0,5,10,15,20,25) then raise exception 'diskon tidak valid'; end if;

    select code, name, price into v_code, v_name, v_price from products where id = r.pid and is_active;
    if not found then raise exception 'produk tidak ditemukan/nonaktif'; end if;

    update stock set qty = qty - r.qty
     where branch_id = v_branch and product_id = r.pid and qty >= r.qty;
    if not found then raise exception 'stok tidak cukup: %', v_code; end if;

    v_gross := v_price * r.qty;
    v_ld    := round(v_gross * r.dpct / 100.0);

    insert into sale_items(sale_id, product_id, code, name, unit_price, qty, discount_pct, discount_amount, line_total)
    values (v_sale, r.pid, v_code, v_name, v_price, r.qty, r.dpct, v_ld, v_gross - v_ld);

    insert into stock_movements(branch_id, product_id, qty_change, reason, ref_id, created_by)
    values (v_branch, r.pid, -r.qty, 'sale', v_sale, auth.uid());

    v_sub  := v_sub + v_gross;
    v_disc := v_disc + v_ld;
  end loop;

  v_total := v_sub - v_disc;

  -- TANPA diskon & kasir tidak mengisi member: pakai member toko (KBS) bila cabang menyalakannya.
  if v_member_label is null and v_disc = 0 then
    select value into v_store from app_settings where key = 'store_member.' || v_branch::text;
    if v_store is not null and coalesce((v_store->>'enabled')::boolean, false) then
      select k.code, k.name into v_sm_code, v_sm_name
        from kbs_members k where k.code = v_store->>'code' and k.is_active;
      if found then
        v_member_label := v_sm_code || ' - ' || v_sm_name;
        update sales set member_label = v_member_label where id = v_sale;
      end if;
    end if;
  end if;

  if p_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then raise exception 'uang diterima kurang'; end if;
    v_change := p_cash_received - v_total;
  end if;

  update sales set subtotal = v_sub, discount_amount = v_disc, total = v_total,
         cash_received = case when p_method = 'cash' then p_cash_received end,
         change_amount = v_change
   where id = v_sale;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'sale.create', 'sales', v_sale::text,
          jsonb_build_object('invoice', v_inv, 'total', v_total, 'method', p_method, 'branch', v_branch,
                             'request_id', p_request_id, 'member', v_member_label));

  return jsonb_build_object('sale_id', v_sale, 'invoice_no', v_inv, 'subtotal', v_sub,
                            'discount', v_disc, 'total', v_total, 'change', coalesce(v_change, 0),
                            'member', v_member_label);
end $$;

-- ---------- 6) hak eksekusi ----------
revoke all on function import_kbs_members(jsonb) from public, anon;
revoke all on function kbs_member_search(text) from public, anon;
revoke all on function store_member_get(uuid) from public, anon;
revoke all on function store_member_save(uuid, boolean, text) from public, anon;
revoke all on function create_sale(jsonb, text, payment_method, numeric, uuid, uuid) from public, anon;
grant execute on function import_kbs_members(jsonb), kbs_member_search(text),
                    store_member_get(uuid), store_member_save(uuid, boolean, text),
                    create_sale(jsonb, text, payment_method, numeric, uuid, uuid)
  to authenticated;
