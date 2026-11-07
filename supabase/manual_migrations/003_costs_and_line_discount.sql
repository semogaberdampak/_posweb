-- Migrasi 003: (A) harga beli dirahasiakan, (B) diskon per produk di keranjang.
-- Jalankan SEKALI di SQL Editor (role: postgres) setelah 002. Aman diulang.

-- ===== A. HARGA BELI (Price1, OldPrice1, lastCost) HANYA UNTUK ROLE BERHAK =====
insert into features(key, label) values ('cost_prices', 'Harga beli / modal') on conflict (key) do nothing;

create table if not exists product_costs (
  product_id uuid primary key references products(id) on delete cascade,
  attributes jsonb not null default '[]'::jsonb check (jsonb_typeof(attributes) = 'array')
);
alter table product_costs enable row level security;
drop policy if exists costs_r on product_costs;
drop policy if exists costs_i on product_costs;
drop policy if exists costs_u on product_costs;
create policy costs_r on product_costs for select to authenticated using (has_perm('cost_prices','r'));
create policy costs_i on product_costs for insert to authenticated with check (has_perm('cost_prices','c'));
create policy costs_u on product_costs for update to authenticated using (has_perm('cost_prices','u')) with check (has_perm('cost_prices','u'));
grant select, insert, update on product_costs to authenticated;

insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'cost_prices', r.name in ('superadmin','pengadaan'), true, r.name in ('superadmin','pengadaan'), r.name = 'superadmin'
from roles r where r.name in ('superadmin','pengadaan','keuangan')
on conflict (role_id, feature_key) do update
  set can_create = excluded.can_create, can_read = excluded.can_read, can_update = excluded.can_update, can_delete = excluded.can_delete;

-- pindahkan data yang sudah terlanjur diimpor ke tabel rahasia
insert into product_costs(product_id, attributes)
select p.id, jsonb_agg(t.a order by t.n)
from products p, lateral jsonb_array_elements(p.attributes) with ordinality as t(a, n)
where t.a->>'k' in ('Price1','OldPrice1','lastCost')
group by p.id
on conflict (product_id) do nothing;

update products p
set attributes = coalesce((select jsonb_agg(t.a order by t.n)
                           from jsonb_array_elements(p.attributes) with ordinality as t(a, n)
                           where t.a->>'k' not in ('Price1','OldPrice1','lastCost')), '[]'::jsonb)
where exists (select 1 from jsonb_array_elements(p.attributes) a where a->>'k' in ('Price1','OldPrice1','lastCost'));

-- ===== B. DISKON PER PRODUK =====
alter table sale_items add column if not exists discount_pct smallint not null default 0
  check (discount_pct in (0,5,10,15,20,25));
alter table sale_items add column if not exists discount_amount numeric(14,0) not null default 0;

drop function if exists create_sale(jsonb, int, text, payment_method, numeric);

create or replace function create_sale(
  p_items         jsonb,      -- [{product_id, qty, discount_pct}]
  p_member        text,
  p_method        payment_method,
  p_cash_received numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_sale uuid := gen_random_uuid(); v_inv text;
  v_sub numeric := 0; v_disc numeric := 0; v_total numeric; v_change numeric;
  v_member uuid; r record; v_code text; v_name text; v_price numeric;
  v_gross numeric; v_ld numeric;
begin
  if not has_perm('pos','c') then raise exception 'forbidden' using errcode = '42501'; end if;

  select branch_id into v_branch from profiles where id = auth.uid() and is_active;
  if v_branch is null then raise exception 'user tidak punya cabang'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'item tidak valid';
  end if;

  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'discount_pct')::int, 0) <> 0)
     and coalesce(btrim(p_member), '') = '' then
    raise exception 'member wajib diisi bila memakai diskon';
  end if;

  v_inv := 'INV-' || to_char(now() at time zone 'Asia/Jakarta','YYMMDD')
           || '-' || lpad(nextval('invoice_seq')::text, 6, '0');

  select id into v_member from members where member_no = btrim(p_member) and is_active;

  insert into sales(id, invoice_no, branch_id, cashier_id, payment_method, member_id, member_label)
  values (v_sale, v_inv, v_branch, auth.uid(), p_method, v_member, nullif(btrim(p_member), ''));

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
          jsonb_build_object('invoice', v_inv, 'total', v_total, 'method', p_method));

  return jsonb_build_object('sale_id', v_sale, 'invoice_no', v_inv, 'subtotal', v_sub,
                            'discount', v_disc, 'total', v_total, 'change', coalesce(v_change, 0));
end $$;

revoke all on function create_sale(jsonb, text, payment_method, numeric) from public, anon;
grant execute on function create_sale(jsonb, text, payment_method, numeric) to authenticated;
