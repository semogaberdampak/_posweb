-- Migrasi 011: Rekap Penjualan (filter bulan & tahun, halaman) + detail transaksi untuk cetak ulang.
-- Hak: sales_recap (baca) + akses cabang. Bulan dihitung menurut waktu WIB (Asia/Jakarta).
create or replace function sales_recap(p_year int, p_month int, p_branch uuid default null, p_page int default 1, p_page_size int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid;
  v_total int; v_rows jsonb; v_sum jsonb; v_meth jsonb;
begin
  if not has_perm('sales_recap','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 or p_page < 1 or p_page_size not between 1 and 100 then
    raise exception 'parameter tidak valid';
  end if;
  select all_branches into v_all from my_scope();
  select branch_id into v_my from profiles where id = auth.uid();
  if p_branch is not null then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not coalesce(v_all, false) then
    p_branch := v_my;
    if p_branch is null then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  -- batas bulan dihitung sebagai waktu lokal WIB lalu diubah ke timestamptz (aman untuk bulan berpanjang beda)
  v_from := make_date(p_year, p_month, 1)::timestamp at time zone 'Asia/Jakarta';
  v_to   := (make_date(p_year, p_month, 1) + interval '1 month')::timestamp at time zone 'Asia/Jakarta';

  select count(*) into v_total from sales s
   where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb) into v_rows from (
    select s.id, s.invoice_no, s.created_at, b.name as branch_name, coalesce(p.full_name, '-') as cashier_name,
           s.payment_method, s.subtotal, s.discount_amount, s.total, s.status, s.member_label,
           (select count(*)::int from sale_items i where i.sale_id = s.id) as items_count
      from sales s join branches b on b.id = s.branch_id left join profiles p on p.id = s.cashier_id
     where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)
     order by s.created_at desc, s.id desc
     offset (p_page - 1) * p_page_size limit p_page_size) x;

  select jsonb_build_object(
           'count',      count(*) filter (where status = 'completed'),
           'total',      coalesce(sum(total) filter (where status = 'completed'), 0),
           'discount',   coalesce(sum(discount_amount) filter (where status = 'completed'), 0),
           'void_count', count(*) filter (where status = 'void'),
           'void_total', coalesce(sum(total) filter (where status = 'void'), 0))
    into v_sum from sales s
   where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch);

  select coalesce(jsonb_object_agg(m.payment_method, m.t), '{}'::jsonb) into v_meth from (
    select payment_method, sum(total) as t from sales s
     where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch) and s.status = 'completed'
     group by payment_method) m;

  return jsonb_build_object('total_rows', v_total, 'page', p_page, 'page_size', p_page_size,
                            'summary', v_sum, 'by_method', v_meth, 'rows', v_rows);
end $$;

create or replace function sale_detail(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s sales;
begin
  if not has_perm('sales_recap','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from sales where id = p_sale;
  if not found or not can_see_branch(s.branch_id) then raise exception 'transaksi tidak ditemukan'; end if;
  return jsonb_build_object(
    'id', s.id, 'invoice_no', s.invoice_no, 'created_at', s.created_at, 'status', s.status, 'void_reason', s.void_reason,
    'branch_name', (select name from branches where id = s.branch_id),
    'cashier_name', coalesce((select full_name from profiles where id = s.cashier_id), '-'),
    'payment_method', s.payment_method, 'subtotal', s.subtotal, 'discount_amount', s.discount_amount, 'total', s.total,
    'cash_received', s.cash_received, 'change_amount', s.change_amount, 'member_label', s.member_label,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'name', i.name, 'unit_price', i.unit_price, 'qty', i.qty,
              'discount_pct', i.discount_pct, 'discount_amount', i.discount_amount, 'line_total', i.line_total) order by i.id), '[]'::jsonb)
              from sale_items i where i.sale_id = s.id));
end $$;

revoke all on function sales_recap(int, int, uuid, int, int), sale_detail(uuid) from public, anon;
grant execute on function sales_recap(int, int, uuid, int, int), sale_detail(uuid) to authenticated;
