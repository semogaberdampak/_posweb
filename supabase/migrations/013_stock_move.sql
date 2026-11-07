-- Migrasi 013: Mutasi stok sebagai fitur hak akses tersendiri ('stock_move') + mutasi banyak produk sekaligus (satu transaksi, semua-atau-tidak-sama-sekali).
-- Juga membersihkan sisa percobaan lama (versi transfer_stock 4-argumen & policy mov_r/mov_i dari migrasi 005_stock_movements lama) bila pernah dijalankan. Aman diulang.
insert into features(key, label) values ('stock_move', 'Mutasi stok') on conflict (key) do nothing;
insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'stock_move', r.name = 'superadmin', true, true, r.name = 'superadmin' from roles r where r.name in ('superadmin', 'pengadaan')
on conflict (role_id, feature_key) do nothing;

-- sisa percobaan lama (aman bila tidak ada)
drop function if exists transfer_stock(uuid, uuid, int, text);   -- versi PUSAT->cabang tanpa kunci baris
drop policy if exists mov_i on stock_movements;                   -- izin INSERT langsung ke buku stok (bisa memalsukan riwayat)
drop policy if exists mov_r on stock_movements;                   -- melebar: tanpa pembatasan cabang (yang benar: stockmov_r)

create or replace function transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref uuid := gen_random_uuid();
begin
  if not has_perm('stock_move','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (can_see_branch(p_from) and can_see_branch(p_to)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from = p_to then raise exception 'cabang asal dan tujuan sama'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 9999999 then raise exception 'jumlah tidak valid'; end if;
  if (select count(*) from branches where id in (p_from, p_to) and is_active) <> 2 then raise exception 'cabang tidak valid'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'produk tidak ditemukan'; end if;

  perform 1 from stock where product_id = p_product and branch_id in (p_from, p_to) order by branch_id for update;
  update stock set qty = qty - p_qty where branch_id = p_from and product_id = p_product and qty >= p_qty;
  if not found then raise exception 'stok asal tidak cukup'; end if;
  insert into stock(branch_id, product_id, qty) values (p_to, p_product, p_qty)
  on conflict (branch_id, product_id) do update set qty = stock.qty + excluded.qty;

  insert into stock_movements(branch_id, product_id, qty_change, reason, ref_id, note, created_by)
  values (p_from, p_product, -p_qty, 'transfer_out', v_ref, left(p_note, 200), auth.uid()),
         (p_to,   p_product,  p_qty, 'transfer_in',  v_ref, left(p_note, 200), auth.uid());
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.transfer', 'stock', p_product::text, jsonb_build_object('from', p_from, 'to', p_to, 'qty', p_qty));
end $$;

-- p_lines: [{"product_id":"<uuid>","qty":5}, ...]  (maks. 200, tanpa produk ganda). Gagal satu = batal semua.
create or replace function transfer_stock_batch(p_from uuid, p_to uuid, p_lines jsonb, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  if not has_perm('stock_move','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200 then raise exception 'daftar produk harus 1-200 baris'; end if;
  if (select count(*) - count(distinct x->>'product_id') from jsonb_array_elements(p_lines) x) > 0 then raise exception 'ada produk ganda di daftar'; end if;
  for r in select x->>'product_id' as pid, x->>'qty' as q from jsonb_array_elements(p_lines) x order by 1 loop  -- urutan tetap: cegah deadlock antar-mutasi
    if r.pid is null or r.pid !~ '^[0-9a-fA-F-]{36}$' or r.q is null or r.q !~ '^[0-9]{1,7}$' then raise exception 'baris tidak valid'; end if;
    perform transfer_stock(p_from, p_to, r.pid::uuid, r.q::int, p_note);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function transfer_stock(uuid, uuid, uuid, int, text), transfer_stock_batch(uuid, uuid, jsonb, text) from public, anon;
grant execute on function transfer_stock(uuid, uuid, uuid, int, text), transfer_stock_batch(uuid, uuid, jsonb, text) to authenticated;
