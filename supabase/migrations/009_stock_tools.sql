-- Migrasi 009: alat stok.
--  * import_stock(): isi stok satu cabang dari file hasil hitung fisik (diunggah dari aplikasi, tanpa kunci rahasia)
--  * transfer_stock(): pindah stok antar cabang (atomik, total global tetap)
--  * stock_movements: alasan baru transfer_in / transfer_out
-- Aman diulang.
alter table stock_movements drop constraint if exists stock_movements_reason_check;
alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('sale','void','receive','adjust','opname','initial','transfer_in','transfer_out'));

-- p_rows: [{"code":"1000011013","qty":5}, ...]
-- p_mode 'fill' = hanya mengisi produk yang BELUM punya stok di cabang itu (aman, default)
--        'set'  = menimpa stok dengan hasil hitung (stok opname); selisih dicatat
create or replace function import_stock(p_branch uuid, p_rows jsonb, p_mode text default 'fill')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_old int; v_qty int; v_pid uuid;
  v_ins int := 0; v_upd int := 0; v_skip int := 0; v_same int := 0; v_unknown text[] := '{}';
begin
  if not has_perm('stock','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from branches where id = p_branch and is_active) then raise exception 'cabang tidak valid'; end if;
  if p_mode not in ('fill','set') then raise exception 'mode tidak valid'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 40000 then
    raise exception 'jumlah baris harus 1-40000';
  end if;
  if (select count(*) - count(distinct btrim(x->>'code')) from jsonb_array_elements(p_rows) x) > 0 then
    raise exception 'ada kode produk ganda di file';
  end if;

  for r in select btrim(x->>'code') as code, (x->>'qty') as q from jsonb_array_elements(p_rows) x loop
    if r.code is null or r.code = '' or r.q is null or r.q !~ '^[0-9]{1,7}$' then
      raise exception 'baris tidak valid: %', coalesce(nullif(r.code,''), '(kode kosong)');
    end if;
    v_qty := r.q::int;
    select id into v_pid from products where code = r.code;
    if v_pid is null then v_unknown := array_append(v_unknown, r.code); continue; end if;

    select qty into v_old from stock where branch_id = p_branch and product_id = v_pid for update;
    if not found then
      if v_qty > 0 then
        insert into stock(branch_id, product_id, qty) values (p_branch, v_pid, v_qty);
        insert into stock_movements(branch_id, product_id, qty_change, reason, note, created_by)
        values (p_branch, v_pid, v_qty, 'initial', 'Impor stok awal', auth.uid());
        v_ins := v_ins + 1;
      else v_skip := v_skip + 1; end if;
    elsif p_mode = 'set' and v_old <> v_qty then
      update stock set qty = v_qty where branch_id = p_branch and product_id = v_pid;
      insert into stock_movements(branch_id, product_id, qty_change, reason, note, created_by)
      values (p_branch, v_pid, v_qty - v_old, 'opname', 'Impor hasil hitung', auth.uid());
      v_upd := v_upd + 1;
    elsif p_mode = 'set' then v_same := v_same + 1;
    else v_skip := v_skip + 1;
    end if;
  end loop;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.import', 'stock', p_branch::text,
          jsonb_build_object('mode', p_mode, 'inserted', v_ins, 'updated', v_upd, 'skipped', v_skip, 'unknown', coalesce(array_length(v_unknown,1),0)));

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped', v_skip, 'same', v_same,
                            'unknown_count', coalesce(array_length(v_unknown,1),0), 'unknown', to_jsonb(v_unknown[1:50]));
end $$;

create or replace function transfer_stock(p_from uuid, p_to uuid, p_product uuid, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref uuid := gen_random_uuid();
begin
  if not has_perm('stock','u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (can_see_branch(p_from) and can_see_branch(p_to)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from = p_to then raise exception 'cabang asal dan tujuan sama'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 9999999 then raise exception 'jumlah tidak valid'; end if;
  if (select count(*) from branches where id in (p_from, p_to) and is_active) <> 2 then raise exception 'cabang tidak valid'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'produk tidak ditemukan'; end if;

  perform 1 from stock where product_id = p_product and branch_id in (p_from, p_to) order by branch_id for update; -- urutan tetap: cegah deadlock
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

revoke all on function import_stock(uuid, jsonb, text), transfer_stock(uuid, uuid, uuid, int, text) from public, anon;
grant execute on function import_stock(uuid, jsonb, text), transfer_stock(uuid, uuid, uuid, int, text) to authenticated;
