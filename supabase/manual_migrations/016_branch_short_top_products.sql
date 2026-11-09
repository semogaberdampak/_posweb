-- Migrasi 016: (1) singkatan cabang (short_name) untuk tampilan ringkas; (2) produk terlaris per periode (untuk sidebar kasir).
alter table branches add column if not exists short_name text check (short_name is null or length(short_name) between 1 and 12);
update branches set short_name = case code
    when 'ANTONIUS' then 'TKSAP'  when 'PAULUS' then 'TKSP'  when 'KRANGGAN' then 'Kranggan'
    when 'KATEDRAL' then 'Katedral' when 'SANTAMARIA' then 'TKSM' when 'ATHANASIUS' then 'TKSAA' when 'PUSAT' then 'PUSAT' end
 where short_name is null and code in ('ANTONIUS','PAULUS','KRANGGAN','KATEDRAL','SANTAMARIA','ATHANASIUS','PUSAT');
-- cabang baru: update branches set short_name = 'XYZ' where code = '...';  (kosong = memakai nama lengkap)

-- stok per cabang kini membawa singkatan (tipe kembalian berubah -> fungsi dibuat ulang)
drop function if exists stock_by_branch(uuid);
create or replace function stock_by_branch(p_product uuid)
returns table(branch_id uuid, branch_code text, branch_name text, branch_short text, is_pusat boolean, qty integer)
language sql stable security definer set search_path = public as $$
  select b.id, b.code, b.name, coalesce(b.short_name, b.name), b.is_pusat, coalesce(s.qty, 0)
  from branches b
  left join stock s on s.branch_id = b.id and s.product_id = p_product
  where b.is_active
    and (has_perm('pos','r') or has_perm('stock','r') or has_perm('products','r'))
  order by b.is_pusat desc, b.name;
$$;
revoke all on function stock_by_branch(uuid) from public, anon;
grant execute on function stock_by_branch(uuid) to authenticated;

-- Produk terlaris: jumlah terjual (transaksi selesai; void tidak dihitung), tanggal inklusif WIB, maks. 366 hari.
-- Hak: pos atau sales_recap (baca). Cakupan cabang sama dengan Rekap Penjualan. Hanya jumlah & nomor-nota, tanpa harga/modal.
create or replace function top_products(p_from date, p_to date, p_branch uuid default null, p_limit int default 10)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid;
begin
  if not (has_perm('pos','r') or has_perm('sales_recap','r')) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from < date '2000-01-01' or p_to > date '2100-12-31' or p_limit not between 1 and 50 then raise exception 'parameter tidak valid'; end if;
  if p_from > p_to then raise exception 'tanggal awal setelah tanggal akhir'; end if;
  if p_to - p_from > 365 then raise exception 'rentang maksimal 366 hari'; end if;
  select all_branches into v_all from my_scope();
  select branch_id into v_my from profiles where id = auth.uid();
  if p_branch is not null then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not coalesce(v_all, false) then
    p_branch := v_my;
    if p_branch is null then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  v_from := p_from::timestamp at time zone 'Asia/Jakarta';
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  return coalesce((select jsonb_agg(to_jsonb(x) order by x.qty desc, x.trx desc, x.code) from (
    select i.product_id,
           (array_agg(i.code order by s.created_at desc))[1] as code,
           (array_agg(i.name order by s.created_at desc))[1] as name,
           sum(i.qty)::int as qty, count(distinct i.sale_id)::int as trx
      from sale_items i join sales s on s.id = i.sale_id
     where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)
     group by i.product_id
     order by sum(i.qty) desc, count(distinct i.sale_id) desc, 2
     limit p_limit) x), '[]'::jsonb);
end $$;
revoke all on function top_products(date, date, uuid, int) from public, anon;
grant execute on function top_products(date, date, uuid, int) to authenticated;
