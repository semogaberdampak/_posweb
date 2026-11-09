-- Migrasi 017: IDEMPOTENSI create_sale.
-- Masalah: koneksi putus / klik ganda / retry membuat transaksi kedua (stok berkurang dua kali, harus void manual).
-- Solusi: klien mengirim kunci unik per percobaan bayar (p_request_id). Bila kunci yang sama dipanggil ulang,
--         transaksi yang sudah tercatat DIKEMBALIKAN apa adanya (invoice & angka sama), bukan dibuat baru.
--         Kunci terikat ke kasir pembuatnya, jadi kasir lain tidak bisa "membajak" hasilnya.
-- Aman diulang.

alter table sales add column if not exists request_id uuid;
create unique index if not exists sales_request_id_key on sales (request_id) where request_id is not null;

-- Hapus versi lama agar pemanggilan 4–5 argumen tidak ambigu terhadap p_request_id yang punya nilai bawaan.
drop function if exists create_sale(jsonb, int, text, payment_method, numeric);    -- versi schema.sql
drop function if exists create_sale(jsonb, text, payment_method, numeric);         -- versi 003
drop function if exists create_sale(jsonb, text, payment_method, numeric, uuid);   -- versi 008

create or replace function create_sale(
  p_items         jsonb,      -- [{product_id, qty, discount_pct}]
  p_member        text,
  p_method        payment_method,
  p_cash_received numeric default null,
  p_branch        uuid default null,   -- hanya untuk role lintas cabang
  p_request_id    uuid default null    -- kunci idempotensi (opsional; disarankan selalu diisi)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_sale uuid := gen_random_uuid(); v_inv text;
  v_sub numeric := 0; v_disc numeric := 0; v_total numeric; v_change numeric;
  v_member uuid; r record; v_code text; v_name text; v_price numeric;
  v_gross numeric; v_ld numeric;
  o_id uuid; o_inv text; o_sub numeric; o_disc numeric; o_total numeric; o_change numeric;
begin
  if not has_perm('pos','c') then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_request_id is not null then
    -- Serialkan percobaan dengan kunci sama (dua request paralel tidak bisa lolos bersamaan).
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    select id, invoice_no, subtotal, discount_amount, total, coalesce(change_amount, 0)
      into o_id, o_inv, o_sub, o_disc, o_total, o_change
      from sales where request_id = p_request_id and cashier_id = auth.uid();
    if found then
      return jsonb_build_object('sale_id', o_id, 'invoice_no', o_inv, 'subtotal', o_sub,
                                'discount', o_disc, 'total', o_total, 'change', o_change);
    end if;
    if exists (select 1 from sales where request_id = p_request_id) then
      raise exception 'kunci permintaan sudah dipakai transaksi lain';
    end if;
  end if;

  select branch_id into v_branch from profiles where id = auth.uid() and is_active;
  if p_branch is not null and p_branch is distinct from v_branch then
    if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
    if not exists (select 1 from branches where id = p_branch and is_active) then raise exception 'cabang tidak valid'; end if;
    v_branch := p_branch;
  end if;
  if v_branch is null then raise exception 'user tidak punya cabang'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'item tidak valid';
  end if;

  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'discount_pct')::int, 0) <> 0)
     and coalesce(btrim(p_member), '') = '' then
    raise exception 'member wajib diisi bila memakai diskon';
  end if;

  v_inv := 'INV-' || to_char(now() at time zone 'Asia/Jakarta','YYMMDD')
           || '-' || lpad(nextval('invoice_seq')::text, 6, '0');

  select id into v_member from members where member_no = btrim(p_member) and is_active;

  insert into sales(id, invoice_no, branch_id, cashier_id, payment_method, member_id, member_label, request_id)
  values (v_sale, v_inv, v_branch, auth.uid(), p_method, v_member, nullif(btrim(p_member), ''), p_request_id);

  for r in
    select (x->>'product_id')::uuid as pid, (x->>'qty')::int as qty,
           coalesce((x->>'discount_pct')::int, 0) as dpct
    from jsonb_array_elements(p_items) x
    order by 1, 3
  loop
    if r.qty <= 0 or r.qty > 9999 then raise exception 'qty tidak valid'; end if;
    if r.dpct not in (0,5,10,15,20,25) then raise exception 'diskon tidak valid'; end if;

    select code, name, price into v_code, v_name, v_price from products where id = r.pid and is_active;
    if not found then raise exception 'produk tidak ditemukan/nonaktif'; end if;

    update stock set qty = qty - r.qty
     where branch_id = v_branch and product_id = r.pid and qty >= r.qty;
    if not found then raise exception 'stok tidak cukup: %', v_code; end if;

    v_gross := v_price * r.qty;
    v_ld    := round(v_gross * r.dpct / 100.0);

    insert into sale_items(sale_id, product_id, code, name, unit_price, qty, discount_pct, discount_amount, line_total)
    values (v_sale, r.pid, v_code, v_name, v_price, r.qty, r.dpct, v_ld, v_gross - v_ld);

    insert into stock_movements(branch_id, product_id, qty_change, reason, ref_id, created_by)
    values (v_branch, r.pid, -r.qty, 'sale', v_sale, auth.uid());

    v_sub  := v_sub + v_gross;
    v_disc := v_disc + v_ld;
  end loop;

  v_total := v_sub - v_disc;

  if p_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then raise exception 'uang diterima kurang'; end if;
    v_change := p_cash_received - v_total;
  end if;

  update sales set subtotal = v_sub, discount_amount = v_disc, total = v_total,
         cash_received = case when p_method = 'cash' then p_cash_received end,
         change_amount = v_change
   where id = v_sale;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'sale.create', 'sales', v_sale::text,
          jsonb_build_object('invoice', v_inv, 'total', v_total, 'method', p_method, 'branch', v_branch,
                             'request_id', p_request_id));

  return jsonb_build_object('sale_id', v_sale, 'invoice_no', v_inv, 'subtotal', v_sub,
                            'discount', v_disc, 'total', v_total, 'change', coalesce(v_change, 0));
end $$;

revoke all on function create_sale(jsonb, text, payment_method, numeric, uuid, uuid) from public, anon;
grant execute on function create_sale(jsonb, text, payment_method, numeric, uuid, uuid) to authenticated;
