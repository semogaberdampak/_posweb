-- Migrasi 004: stok per cabang. Jalankan SEKALI di SQL Editor (role: postgres) setelah 003. Aman diulang.

-- 1) Buang kolom stok Excel dari card (stok sekarang hidup di tabel stock; konsinyasi tidak dipakai)
update products p
set attributes = coalesce((select jsonb_agg(t.a order by t.n)
                           from jsonb_array_elements(p.attributes) with ordinality as t(a, n)
                           where t.a->>'k' not in ('stokOnHand','stokGudLain','stokKonsinyasi')), '[]'::jsonb)
where exists (select 1 from jsonb_array_elements(p.attributes) a
              where a->>'k' in ('stokOnHand','stokGudLain','stokKonsinyasi'));

-- 2) Stok SEMUA toko (per cabang) untuk satu produk. Hanya mengembalikan nama cabang + jumlah,
--    jadi kasir cabang bisa melihat stok toko lain tanpa membuka data lain.
create or replace function stock_by_branch(p_product uuid)
returns table(branch_id uuid, branch_code text, branch_name text, is_pusat boolean, qty integer)
language sql stable security definer set search_path = public as $$
  select b.id, b.code, b.name, b.is_pusat, coalesce(s.qty, 0)
  from branches b
  left join stock s on s.branch_id = b.id and s.product_id = p_product
  where b.is_active
    and (has_perm('pos','r') or has_perm('stock','r') or has_perm('products','r'))
  order by b.is_pusat desc, b.name;
$$;
revoke all on function stock_by_branch(uuid) from public, anon;
grant execute on function stock_by_branch(uuid) to authenticated;

-- 3) Barang masuk / koreksi: kini juga wajib punya akses ke cabang tujuan
create or replace function adjust_stock(p_branch uuid, p_product uuid, p_delta int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('stock','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason not in ('receive','adjust','opname','initial') then raise exception 'reason tidak valid'; end if;
  if p_reason = 'receive' and p_delta <= 0 then raise exception 'barang masuk harus lebih dari 0'; end if;
  if p_delta = 0 then return; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'produk tidak ditemukan'; end if;

  insert into stock(branch_id, product_id, qty) values (p_branch, p_product, p_delta)
  on conflict (branch_id, product_id) do update set qty = stock.qty + excluded.qty;

  insert into stock_movements(branch_id, product_id, qty_change, reason, created_by)
  values (p_branch, p_product, p_delta, p_reason, auth.uid());
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.adjust', 'stock', p_product::text,
          jsonb_build_object('branch', p_branch, 'delta', p_delta, 'reason', p_reason));
end $$;

-- 4) Stok aktual (hasil hitung fisik / rekonsiliasi): set ke jumlah sebenarnya, selisih dicatat
create or replace function set_stock(p_branch uuid, p_product uuid, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old int; v_delta int;
begin
  if not has_perm('stock','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_qty < 0 or p_qty > 9999999 then raise exception 'jumlah tidak valid'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'produk tidak ditemukan'; end if;

  select qty into v_old from stock where branch_id = p_branch and product_id = p_product for update;
  v_old := coalesce(v_old, 0);
  v_delta := p_qty - v_old;
  if v_delta = 0 then return; end if;

  insert into stock(branch_id, product_id, qty) values (p_branch, p_product, p_qty)
  on conflict (branch_id, product_id) do update set qty = excluded.qty;

  insert into stock_movements(branch_id, product_id, qty_change, reason, note, created_by)
  values (p_branch, p_product, v_delta, 'opname', left(p_note, 200), auth.uid());
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.set', 'stock', p_product::text,
          jsonb_build_object('branch', p_branch, 'from', v_old, 'to', p_qty));
end $$;
revoke all on function set_stock(uuid, uuid, int, text) from public, anon;
grant execute on function set_stock(uuid, uuid, int, text) to authenticated;
