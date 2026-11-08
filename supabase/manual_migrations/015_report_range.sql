-- Migrasi 015: laporan RENTANG TANGGAL (harian / mingguan / bebas) untuk Rekap Penjualan, ekspor, dan Keuangan.
-- Logika dipindah ke fungsi *_range(p_from, p_to, ...) (tanggal inklusif, menurut WIB, maks. 366 hari). Fungsi bulanan lama
-- (sales_recap, sales_export, finance_summary) menjadi PEMBUNGKUS TIPIS yang memanggil fungsi range agar tidak ada dua salinan logika.
-- Hak & cakupan cabang tidak berubah. Aman diulang.

create or replace function sales_recap_range(p_from date, p_to date, p_branch uuid default null, p_page int default 1, p_page_size int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid;
  v_total int; v_rows jsonb; v_sum jsonb; v_meth jsonb;
begin
  if not has_perm('sales_recap','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from < date '2000-01-01' or p_to > date '2100-12-31' or p_page < 1 or p_page_size not between 1 and 100 then raise exception 'parameter tidak valid'; end if;
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

  -- batas bulan dihitung sebagai waktu lokal WIB lalu diubah ke timestamptz (aman untuk bulan berpanjang beda)
  v_from := p_from::timestamp at time zone 'Asia/Jakarta';  -- tanggal awal 00:00 WIB (inklusif)
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';   -- sampai akhir tanggal akhir (eksklusif hari berikutnya)

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

create or replace function sales_export_range(p_from date, p_to date, p_branch uuid default null, p_limit int default 20000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid; v_n int; v_sales jsonb; v_items jsonb;
begin
  if not has_perm('sales_recap','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from < date '2000-01-01' or p_to > date '2100-12-31' or p_limit not between 1 and 20000 then raise exception 'parameter tidak valid'; end if;
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
  v_from := p_from::timestamp at time zone 'Asia/Jakarta';  -- tanggal awal 00:00 WIB (inklusif)
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';   -- sampai akhir tanggal akhir (eksklusif hari berikutnya)

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
  values (auth.uid(), 'sales.export', 'sales', coalesce(p_branch::text, 'all'), jsonb_build_object('from', p_from, 'to', p_to, 'rows', v_n));
  return jsonb_build_object('sales', v_sales, 'items', v_items);
end $$;

create or replace function finance_summary_range(p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid;
  v_tot jsonb; v_meth jsonb; v_br jsonb; v_day jsonb; v_margin jsonb := null;
begin
  if not has_perm('finance','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from < date '2000-01-01' or p_to > date '2100-12-31' then raise exception 'parameter tidak valid'; end if;
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
  v_from := p_from::timestamp at time zone 'Asia/Jakarta';  -- tanggal awal 00:00 WIB (inklusif)
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';   -- sampai akhir tanggal akhir (eksklusif hari berikutnya)

  select jsonb_build_object(
      'count',      count(*) filter (where status = 'completed'),
      'gross',      coalesce(sum(subtotal) filter (where status = 'completed'), 0),
      'discount',   coalesce(sum(discount_amount) filter (where status = 'completed'), 0),
      'net',        coalesce(sum(total) filter (where status = 'completed'), 0),
      'void_count', count(*) filter (where status = 'void'),
      'void_total', coalesce(sum(total) filter (where status = 'void'), 0))
    into v_tot from sales s
   where s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch);

  select coalesce(jsonb_agg(jsonb_build_object('method', m.payment_method, 'count', m.c, 'net', m.t) order by m.t desc), '[]'::jsonb) into v_meth from (
    select payment_method, count(*) c, sum(total) t from sales s
     where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)
     group by payment_method) m;

  select coalesce(jsonb_agg(jsonb_build_object('branch', b.name, 'count', x.c, 'net', x.t, 'discount', x.d) order by x.t desc), '[]'::jsonb) into v_br from (
    select branch_id, count(*) c, sum(total) t, sum(discount_amount) d from sales s
     where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)
     group by branch_id) x join branches b on b.id = x.branch_id;

  select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'count', d.c, 'net', d.t, 'discount', d.dd) order by d.day), '[]'::jsonb) into v_day from (
    select to_char(s.created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day, count(*) c, sum(total) t, sum(discount_amount) dd from sales s
     where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)
     group by 1) d;

  if has_perm('cost_prices','r') then
    -- modal = harga beli terakhir (lastCost) bila masuk akal, jika tidak Price1; "masuk akal" = lebih kecil dari harga jual saat transaksi.
    -- Data Excel lama: Price1 sering SAMA dengan harga jual -> baris seperti itu tidak dihitung (dilaporkan sebagai "tanpa data modal").
    select jsonb_build_object(
        'revenue_all',     coalesce(sum(line_total), 0),
        'revenue_covered', coalesce(sum(line_total) filter (where c is not null), 0),
        'cost',            coalesce(sum(qty * c) filter (where c is not null), 0),
        'lines',           count(*),
        'lines_no_cost',   count(*) filter (where c is null))
      into v_margin from (
        select i.line_total, i.qty,
               case when lc is not null and lc < i.unit_price then lc when p1 is not null and p1 < i.unit_price then p1 end as c
          from sale_items i
          join sales s on s.id = i.sale_id
          left join product_costs pc on pc.product_id = i.product_id
          cross join lateral (select _cost_val(pc.attributes, 'lastCost') as lc, _cost_val(pc.attributes, 'Price1') as p1) k
         where s.status = 'completed' and s.created_at >= v_from and s.created_at < v_to and (p_branch is null or s.branch_id = p_branch)) z;
  end if;

  return jsonb_build_object('totals', v_tot, 'by_method', v_meth, 'by_branch', v_br, 'by_day', v_day, 'margin', v_margin);
end $$;

-- ---- pembungkus bulanan (kompatibel dengan versi sebelumnya) ----
create or replace function sales_recap(p_year int, p_month int, p_branch uuid default null, p_page int default 1, p_page_size int default 20)
returns jsonb language plpgsql stable set search_path = public as $$
declare v date;
begin
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 then raise exception 'parameter tidak valid'; end if;
  v := make_date(p_year, p_month, 1);
  return sales_recap_range(v, (v + interval '1 month' - interval '1 day')::date, p_branch, p_page, p_page_size);
end $$;

create or replace function sales_export(p_year int, p_month int, p_branch uuid default null, p_limit int default 20000)
returns jsonb language plpgsql set search_path = public as $$
declare v date;
begin
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 then raise exception 'parameter tidak valid'; end if;
  v := make_date(p_year, p_month, 1);
  return sales_export_range(v, (v + interval '1 month' - interval '1 day')::date, p_branch, p_limit);
end $$;

create or replace function finance_summary(p_year int, p_month int, p_branch uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare v date;
begin
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 then raise exception 'parameter tidak valid'; end if;
  v := make_date(p_year, p_month, 1);
  return finance_summary_range(v, (v + interval '1 month' - interval '1 day')::date, p_branch);
end $$;

revoke all on function sales_recap_range(date, date, uuid, int, int), sales_export_range(date, date, uuid, int), finance_summary_range(date, date, uuid) from public, anon;
grant execute on function sales_recap_range(date, date, uuid, int, int), sales_export_range(date, date, uuid, int), finance_summary_range(date, date, uuid) to authenticated;
revoke all on function sales_recap(int, int, uuid, int, int), sales_export(int, int, uuid, int), finance_summary(int, int, uuid) from public, anon;
grant execute on function sales_recap(int, int, uuid, int, int), sales_export(int, int, uuid, int), finance_summary(int, int, uuid) to authenticated;
