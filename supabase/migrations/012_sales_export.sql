-- Migrasi 012: data lengkap satu bulan untuk diunduh ke Excel (semua transaksi + rincian barang).
-- Hak & cakupan cabang sama dengan sales_recap. Setiap unduhan dicatat di audit_log.
create or replace function sales_export(p_year int, p_month int, p_branch uuid default null, p_limit int default 20000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid; v_n int; v_sales jsonb; v_items jsonb;
begin
  if not has_perm('sales_recap','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 or p_limit not between 1 and 20000 then raise exception 'parameter tidak valid'; end if;
  select all_branches into v_all from my_scope();
  select branch_id into v_my from profiles where id = auth.uid();
  if p_branch is not null then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not coalesce(v_all, false) then
    p_branch := v_my;
    if p_branch is null then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  v_from := make_date(p_year, p_month, 1)::timestamp at time zone 'Asia/Jakarta';
  v_to   := (make_date(p_year, p_month, 1) + interval '1 month')::timestamp at time zone 'Asia/Jakarta';

  select count(*) into v_n from sales s where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch);
  if v_n > p_limit then raise exception 'terlalu banyak transaksi (% > %); pilih satu cabang', v_n, p_limit; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.id), '[]'::jsonb) into v_sales from (
    select s.id, s.invoice_no, s.created_at, b.name as branch_name, coalesce(p.full_name, '-') as cashier_name, s.payment_method,
           s.subtotal, s.discount_amount, s.total, s.cash_received, s.change_amount, s.member_label, s.status, s.void_reason
      from sales s join branches b on b.id = s.branch_id left join profiles p on p.id = s.cashier_id
     where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)) x;

  select coalesce(jsonb_agg(to_jsonb(y) order by y.created_at, y.sale_id, y.item_id), '[]'::jsonb) into v_items from (
    select i.sale_id, i.id as item_id, s.created_at, s.invoice_no, i.code, i.name, i.unit_price, i.qty, i.discount_pct, i.discount_amount, i.line_total
      from sale_items i join sales s on s.id = i.sale_id
     where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)) y;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'sales.export', 'sales', coalesce(p_branch::text, 'all'), jsonb_build_object('year', p_year, 'month', p_month, 'rows', v_n));
  return jsonb_build_object('sales', v_sales, 'items', v_items);
end $$;
revoke all on function sales_export(int, int, uuid, int) from public, anon;
grant execute on function sales_export(int, int, uuid, int) to authenticated;
