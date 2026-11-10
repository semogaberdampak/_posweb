-- Migrasi 019: STATUS TUTUP KASIR PER TANGGAL (dipakai halaman Rekap Penjualan).
-- Menjawab "hari mana yang transaksinya sudah / belum ditutup" untuk satu rentang tanggal.
-- Hanya membaca: tidak mengubah data. Menggabungkan hari yang PUNYA transaksi (dari tabel sales)
-- dengan penutupan yang tercatat (daily_closings). Aman diulang.

create or replace function closing_status(p_from date default null, p_to date default null, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days jsonb; v_total int; v_closed int;
begin
  if not (has_perm('daily_close','r') or has_perm('daily_close','c')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from < date '2000-01-01' or p_to > date '2100-12-31' then
    raise exception 'parameter tidak valid';
  end if;
  if p_from > p_to then raise exception 'tanggal awal setelah tanggal akhir'; end if;
  if p_to - p_from > 365 then raise exception 'rentang maksimal 366 hari'; end if;
  if p_branch is not null and not can_see_branch(p_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- satu baris per (cabang, hari WIB) yang punya transaksi; status tutup dari daily_closings
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', d.hari,
           'branch_id', d.branch_id,
           'branch_name', coalesce(b.name, '-'),
           'count', d.c,
           'net', d.net,
           'void_count', d.vc,
           'closed', c.id is not null,
           'closed_at', c.closed_at,
           'closed_by_name', p.full_name)
         order by d.hari, b.name), '[]'::jsonb)
    into v_days
    from (select s.branch_id,
                 (s.created_at at time zone 'Asia/Jakarta')::date as hari,
                 count(*) filter (where s.status = 'completed') as c,
                 coalesce(sum(s.total) filter (where s.status = 'completed'), 0) as net,
                 count(*) filter (where s.status = 'void') as vc
            from sales s
           where s.created_at >= p_from::timestamp at time zone 'Asia/Jakarta'
             and s.created_at <  (p_to + 1)::timestamp at time zone 'Asia/Jakarta'
             and (case when p_branch is null then can_see_branch(s.branch_id) else s.branch_id = p_branch end)
           group by 1, 2) d
    left join branches b on b.id = d.branch_id
    left join daily_closings c on c.branch_id = d.branch_id and c.close_date = d.hari
    left join profiles p on p.id = c.closed_by;

  select count(*), count(*) filter (where (x->>'closed')::boolean)
    into v_total, v_closed
    from jsonb_array_elements(v_days) x;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'days', v_days,
    'totals', jsonb_build_object('days', v_total, 'closed', v_closed, 'open', v_total - v_closed));
end $$;

revoke all on function closing_status(date, date, uuid) from public, anon;
grant execute on function closing_status(date, date, uuid) to authenticated;
