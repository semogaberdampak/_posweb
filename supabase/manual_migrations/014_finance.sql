-- Migrasi 014: Keuangan — ringkasan bulanan (penjualan, diskon, per metode bayar, per cabang, per hari) + estimasi laba kotor.
-- Hak: finance (baca) + akses cabang. Laba hanya dihitung/ditampilkan bila user juga punya hak cost_prices (harga beli rahasia).
-- Bulan menurut WIB. Hanya mengembalikan angka agregat (tidak pernah harga beli per produk).

-- nilai angka dari atribut harga beli [{"k":"Price1","v":20000}, ...]; 0/teks rusak = tidak ada
create or replace function _cost_val(p_attr jsonb, p_key text) returns numeric
language sql immutable set search_path = public as $$
  select (select case when e->>'v' ~ '^[0-9]+(\.[0-9]+)?$' and (e->>'v')::numeric > 0 then (e->>'v')::numeric end
            from jsonb_array_elements(case when jsonb_typeof(p_attr) = 'array' then p_attr else '[]'::jsonb end) e
           where e->>'k' = p_key limit 1)
$$;
revoke all on function _cost_val(jsonb, text) from public, anon, authenticated;

create or replace function finance_summary(p_year int, p_month int, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz; v_to timestamptz; v_all boolean; v_my uuid;
  v_tot jsonb; v_meth jsonb; v_br jsonb; v_day jsonb; v_margin jsonb := null;
begin
  if not has_perm('finance','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_year not between 2000 and 2100 or p_month not between 1 and 12 then raise exception 'parameter tidak valid'; end if;
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
revoke all on function finance_summary(int, int, uuid) from public, anon;
grant execute on function finance_summary(int, int, uuid) to authenticated;
