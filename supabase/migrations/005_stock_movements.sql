-- Migrasi 005: stok mutasi pusat->cabang
-- Jalankan SEKALI di SQL Editor (role: postgres) setelah 004. Aman diulang.

-- 1) Perluas constraint reason tabel stock_movements
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check CHECK (reason IN ('sale','void','receive','adjust','opname','initial','transfer_in','transfer_out'));

-- 2) Daftarkan fitur baru
INSERT INTO features(key,label) VALUES ('stock_move','Mutasi stok') ON CONFLICT (key) DO NOTHING;

-- 3) RPC transfer_stock: PUSAT -> cabang
CREATE OR REPLACE FUNCTION transfer_stock(p_branch uuid, p_product uuid, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_src uuid; v_dst uuid; v_branch uuid;
  v_old int;
begin
  -- cek hak stock.u
  if not has_perm('stock','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- cek akses cabang tujuan
  if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_src from branches where code = 'PUSAT';
  if not found then raise exception 'cabang PUSAT tidak ditemukan'; end if;
  select id into v_dst from branches where id = p_branch;
  if not found then raise exception 'cabang tujuan tidak ditemukan'; end if;
  if p_qty <= 0 then raise exception 'jumlah harus lebih dari 0'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'produk tidak ditemukan'; end if;

  -- pastikan stok di PUSAT cukup
  select qty into v_old from stock where branch_id = v_src and product_id = p_product;
  v_old := coalesce(v_old, 0);
  if v_old < p_qty then raise exception 'stok asal tidak cukup: %', v_old; end if;

  -- kurangi stok PUSAT (transfer out)
  update stock set qty = qty - p_qty where branch_id = v_src and product_id = p_product;
  -- tambah stok cabang tujuan (transfer in)
  insert into stock(branch_id, product_id, qty) values (p_branch, p_product, p_qty)
    on conflict (branch_id, product_id) do update set qty = stock.qty + p_qty;

  insert into stock_movements(branch_id, product_id, qty_change, reason, note, created_by)
  values (v_src, p_product, -p_qty, 'transfer_out', left(coalesce(p_note,''),200), auth.uid());
  insert into stock_movements(branch_id, product_id, qty_change, reason, note, created_by)
  values (p_branch, p_product, p_qty, 'transfer_in', left(coalesce(p_note,''),200), auth.uid());

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.transfer', 'stock', p_product::text,
          jsonb_build_object('src', v_src, 'dst', p_branch, 'qty', p_qty));
end $$;

drop policy if exists mov_r on stock_movements;
drop policy if exists mov_i on stock_movements;
create policy mov_r on stock_movements for select to authenticated using (has_perm('stock','r'));
create policy mov_i on stock_movements for insert to authenticated with check (has_perm('stock','u'));

grant execute on function transfer_stock(uuid,uuid,int,text) to authenticated;
