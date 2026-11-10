-- Migrasi 021: MEMBERSHIP.
-- 1. Fitur `members` dipakai sungguhan: cari member (kasir), kelola data member (agen member), impor CSV.
-- 2. Role baru "Agen Member" (lintas cabang / Global): CRUD penuh HANYA pada fitur members;
--    fitur lain hanya boleh DIBACA (read-only).
-- 3. create_sale: bila memakai diskon, member WAJIB terdaftar dan aktif (dicek di server);
--    nama member disimpan di sales.member_label ("NOMOR - Nama") dan dikembalikan ke klien untuk struk.
-- 4. Semua penulisan data member hanya lewat RPC (policy INSERT/UPDATE langsung dicabut).
-- Aman diulang.

-- ---------- 0. kolom data member (mengikuti berkas CSV pemilik) ----------
-- CSV: Cust ID, Nama, Lembaga, Alamat, Kota, Propinsi, Telp., Sellular, Segment, Segment Detail, Balance.
-- Cust ID = member_no, Nama = name. Balance = saldo lama; hanya disimpan & ditampilkan, tidak dipakai kasir.
alter table members add column if not exists institution text;
alter table members add column if not exists address text;
alter table members add column if not exists city text;
alter table members add column if not exists province text;
alter table members add column if not exists phone text;
alter table members add column if not exists mobile text;
alter table members add column if not exists segment text;
alter table members add column if not exists segment_detail text;
alter table members add column if not exists balance numeric(14,2) not null default 0;

-- ---------- 1. fitur & role ----------
insert into features(key, label) values ('members', 'Membership')
on conflict (key) do update set label = excluded.label;

insert into roles(name, description, all_branches, is_system)
values ('Agen Member', 'Kelola data member (global); fitur lain hanya lihat', true, true)
on conflict (name) do nothing;

-- Agen Member: semua fitur boleh DIBACA; members boleh semuanya.
insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, f.key, false, true, false, false
  from roles r, features f
 where r.name = 'Agen Member' and f.key <> 'members'
on conflict (role_id, feature_key) do update
  set can_create = false, can_read = true, can_update = false, can_delete = false;

insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'members', true, true, true, true from roles r where r.name = 'Agen Member'
on conflict (role_id, feature_key) do update
  set can_create = true, can_read = true, can_update = true, can_delete = true;

-- Role yang sudah ada: kasir mencari member di kasir, kabag hanya melihat daftar.
insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'members', false, true, false, false from roles r where r.name in ('kasir', 'kabag')
on conflict (role_id, feature_key) do nothing;

-- superadmin: pastikan semua hak (bila fitur ini baru ditambahkan sesudah seed).
insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'members', true, true, true, true from roles r where r.name = 'superadmin'
on conflict (role_id, feature_key) do update
  set can_create = true, can_read = true, can_update = true, can_delete = true;

-- ---------- 2. baca: kasir/members boleh; tulis: hanya RPC ----------
drop policy if exists members_r on members;
create policy members_r on members for select to authenticated
  using (has_perm('members', 'r') or has_perm('pos', 'r'));

drop policy if exists members_i on members;
drop policy if exists members_u on members;
revoke insert, update, delete on members from authenticated;

-- nomor member dibandingkan tanpa membedakan huruf besar/kecil (disimpan KAPITAL)
create unique index if not exists members_no_upper_key on members (upper(btrim(member_no)));

-- ---------- 3. cari member (kasir & pengelola) ----------
-- pembantu: bersihkan satu kolom teks dari jsonb kiriman klien
create or replace function _member_text(p jsonb, p_key text, p_max int)
returns text language plpgsql immutable set search_path = public as $$
declare v text;
begin
  v := nullif(btrim(coalesce(p->>p_key, '')), '');
  if v is not null and length(v) > p_max then
    raise exception 'kolom % terlalu panjang (maks. %)', p_key, p_max using errcode = '22001';
  end if;
  return v;
end $$;

-- pembantu: baca saldo (boleh "8.450" / "8450" / "1.234,50" / "1234.50")
create or replace function _member_saldo(p jsonb)
returns numeric language plpgsql immutable set search_path = public as $$
declare v text;
begin
  v := replace(btrim(coalesce(p->>'saldo', '')), ' ', '');
  if v = '' then return 0; end if;
  if v ~ '^-?\d{1,3}(\.\d{3})+$' then v := replace(v, '.', '');
  elsif v ~ '^-?\d{1,3}(\.\d{3})+,\d{1,2}$' then v := replace(replace(v, '.', ''), ',', '.');
  elsif v ~ '^-?\d{1,12},\d{1,2}$' then v := replace(v, ',', '.');
  elsif v !~ '^-?\d{1,12}(\.\d{1,2})?$' then
    raise exception 'saldo "%" tidak valid (pakai angka, mis. 8450)', p->>'saldo' using errcode = '22023';
  end if;
  return v::numeric;
end $$;

drop function if exists find_member(text);
create or replace function find_member(p_query text)
returns table (id uuid, member_no text, name text, is_active boolean,
               institution text, city text, segment text, segment_detail text, balance numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_raw text; v_like text;
begin
  if not (has_perm('members', 'r') or has_perm('pos', 'r')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_raw := btrim(coalesce(p_query, ''));
  if v_raw = '' then return; end if;
  -- % dan _ di input pengguna diperlakukan sebagai huruf biasa
  v_like := replace(replace(replace(v_raw, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select m.id, m.member_no, m.name, m.is_active,
           m.institution, m.city, m.segment, m.segment_detail, m.balance
      from members m
     where upper(m.member_no) = upper(v_raw)
        or m.member_no ilike v_like || '%'
        or m.name ilike '%' || v_like || '%'
     order by (upper(m.member_no) = upper(v_raw)) desc, m.member_no
     limit 20;
end $$;

-- ---------- 4. simpan / hapus member (RPC) ----------
drop function if exists member_save(uuid, text, text, boolean);
create or replace function member_save(p_id uuid, p_no text, p_name text, p_active boolean default true,
                                      p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_no text; v_name text; v_id uuid;
  v_lembaga text; v_alamat text; v_kota text; v_prop text; v_telp text; v_sell text;
  v_seg text; v_segdet text; v_saldo numeric;
begin
  if p_id is null then
    if not has_perm('members', 'c') then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    if not has_perm('members', 'u') then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  v_no := upper(btrim(coalesce(p_no, '')));
  v_name := btrim(coalesce(p_name, ''));
  if v_no !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
    raise exception 'nomor member tidak valid (1–40 huruf/angka, boleh titik, strip, garis miring)';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'nama member wajib diisi (maks. 100 huruf)';
  end if;
  if exists (select 1 from members where upper(btrim(member_no)) = v_no and id is distinct from p_id) then
    raise exception 'nomor member % sudah dipakai', v_no;
  end if;

  v_lembaga := _member_text(p_data, 'lembaga', 100);
  v_alamat  := _member_text(p_data, 'alamat', 300);
  v_kota    := _member_text(p_data, 'kota', 100);
  v_prop    := _member_text(p_data, 'propinsi', 100);
  v_telp    := _member_text(p_data, 'telp', 50);
  v_sell    := _member_text(p_data, 'sellular', 50);
  v_seg     := _member_text(p_data, 'segment', 100);
  v_segdet  := _member_text(p_data, 'segment_detail', 100);
  v_saldo   := _member_saldo(p_data);

  if p_id is null then
    insert into members(member_no, name, is_active, institution, address, city, province,
                        phone, mobile, segment, segment_detail, balance)
    values (v_no, v_name, p_active, v_lembaga, v_alamat, v_kota, v_prop,
            v_telp, v_sell, v_seg, v_segdet, coalesce(v_saldo, 0))
    returning id into v_id;
    insert into audit_log(actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'member.create', 'members', v_id::text,
            jsonb_build_object('member_no', v_no, 'name', v_name, 'active', p_active));
  else
    update members set member_no = v_no, name = v_name, is_active = p_active,
           institution = v_lembaga, address = v_alamat, city = v_kota, province = v_prop,
           phone = v_telp, mobile = v_sell, segment = v_seg, segment_detail = v_segdet,
           balance = coalesce(v_saldo, 0)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'member tidak ditemukan'; end if;
    insert into audit_log(actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'member.update', 'members', v_id::text,
            jsonb_build_object('member_no', v_no, 'name', v_name, 'active', p_active));
  end if;
  return v_id;
end $$;

create or replace function member_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_no text; v_name text;
begin
  if not has_perm('members', 'd') then raise exception 'forbidden' using errcode = '42501'; end if;
  select member_no, name into v_no, v_name from members where id = p_id;
  if not found then raise exception 'member tidak ditemukan'; end if;
  begin
    delete from members where id = p_id;
  exception when foreign_key_violation then
    raise exception 'Member % sudah dipakai transaksi; nonaktifkan saja (jangan hapus)', v_no;
  end;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'member.delete', 'members', p_id::text,
          jsonb_build_object('member_no', v_no, 'name', v_name));
end $$;

-- ---------- 5. impor CSV (dari aplikasi) ----------
create or replace function import_members(p_rows jsonb, p_overwrite boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_no text; v_name text; v_active boolean; v_id uuid; v_ok boolean;
  v_lembaga text; v_alamat text; v_kota text; v_prop text; v_telp text; v_sell text;
  v_seg text; v_segdet text; v_saldo numeric;
  n_ins int := 0; n_upd int := 0; n_skip int := 0; n_bad int := 0; v_bad jsonb := '[]'::jsonb;
begin
  if not has_perm('members', 'c') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_overwrite and not has_perm('members', 'u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'data tidak valid'; end if;
  if jsonb_array_length(p_rows) > 50000 then raise exception 'maksimal 50.000 baris per impor'; end if;

  for r in select x as j from jsonb_array_elements(p_rows) x
  loop
    v_no := upper(btrim(coalesce(r.j->>'member_no', '')));
    v_name := btrim(coalesce(r.j->>'name', ''));
    v_active := coalesce((r.j->>'is_active')::boolean, true);
    v_ok := true;
    begin
      if v_no !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' or v_name = '' or length(v_name) > 100 then
        raise exception 'nomor/nama tidak valid' using errcode = '22023';
      end if;
      v_lembaga := _member_text(r.j, 'lembaga', 100);
      v_alamat  := _member_text(r.j, 'alamat', 300);
      v_kota    := _member_text(r.j, 'kota', 100);
      v_prop    := _member_text(r.j, 'propinsi', 100);
      v_telp    := _member_text(r.j, 'telp', 50);
      v_sell    := _member_text(r.j, 'sellular', 50);
      v_seg     := _member_text(r.j, 'segment', 100);
      v_segdet  := _member_text(r.j, 'segment_detail', 100);
      v_saldo   := _member_saldo(r.j);
    exception when others then
      v_ok := false;
    end;

    if not v_ok then
      n_bad := n_bad + 1;
      if jsonb_array_length(v_bad) < 10 then
        v_bad := v_bad || to_jsonb(coalesce(nullif(v_no, ''), '(kosong)'));
      end if;
      continue;
    end if;

    select id into v_id from members where upper(btrim(member_no)) = v_no;
    if v_id is null then
      insert into members(member_no, name, is_active, institution, address, city, province,
                          phone, mobile, segment, segment_detail, balance)
      values (v_no, v_name, v_active, v_lembaga, v_alamat, v_kota, v_prop,
              v_telp, v_sell, v_seg, v_segdet, coalesce(v_saldo, 0));
      n_ins := n_ins + 1;
    elsif p_overwrite then
      -- hanya kolom yang ADA di file yang ditimpa; kolom yang tidak dikirim dibiarkan
      update members set
        name = v_name,
        is_active = v_active,
        institution    = case when r.j ? 'lembaga'        then v_lembaga else institution end,
        address        = case when r.j ? 'alamat'         then v_alamat  else address end,
        city           = case when r.j ? 'kota'           then v_kota    else city end,
        province       = case when r.j ? 'propinsi'       then v_prop    else province end,
        phone          = case when r.j ? 'telp'           then v_telp    else phone end,
        mobile         = case when r.j ? 'sellular'       then v_sell    else mobile end,
        segment        = case when r.j ? 'segment'        then v_seg     else segment end,
        segment_detail = case when r.j ? 'segment_detail' then v_segdet  else segment_detail end,
        balance        = case when r.j ? 'saldo'          then coalesce(v_saldo, 0) else balance end
       where id = v_id;
      n_upd := n_upd + 1;
    else
      n_skip := n_skip + 1;
    end if;
  end loop;

  insert into audit_log(actor_id, action, entity, detail)
  values (auth.uid(), 'member.import', 'members',
          jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip,
                             'invalid', n_bad, 'overwrite', p_overwrite));

  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip,
                            'invalid', n_bad, 'invalid_sample', v_bad);
end $$;

-- ---------- 6. create_sale: member wajib & harus terdaftar bila memakai diskon ----------
drop function if exists create_sale(jsonb, text, payment_method, numeric, uuid, uuid);

create or replace function create_sale(
  p_items         jsonb,      -- [{product_id, qty, discount_pct}]
  p_member        text,       -- nomor member (opsional bila tanpa diskon; WAJIB bila ada diskon)
  p_method        payment_method,
  p_cash_received numeric default null,
  p_branch        uuid default null,
  p_request_id    uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid; v_sale uuid := gen_random_uuid(); v_inv text;
  v_sub numeric := 0; v_disc numeric := 0; v_total numeric; v_change numeric;
  v_member uuid; v_member_name text; v_member_label text;
  r record; v_code text; v_name text; v_price numeric;
  v_gross numeric; v_ld numeric;
  o_id uuid; o_inv text; o_sub numeric; o_disc numeric; o_total numeric; o_change numeric; o_member text;
begin
  if not has_perm('pos','c') then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    select id, invoice_no, subtotal, discount_amount, total, coalesce(change_amount, 0), member_label
      into o_id, o_inv, o_sub, o_disc, o_total, o_change, o_member
      from sales where request_id = p_request_id and cashier_id = auth.uid();
    if found then
      return jsonb_build_object('sale_id', o_id, 'invoice_no', o_inv, 'subtotal', o_sub,
                                'discount', o_disc, 'total', o_total, 'change', o_change,
                                'member', o_member);
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

  -- member harus benar-benar terdaftar & aktif (bukan sekadar teks bebas)
  if coalesce(btrim(p_member), '') <> '' then
    select id, name into v_member, v_member_name
      from members where member_no = upper(btrim(p_member)) and is_active;
    if not found then raise exception 'member % tidak terdaftar atau nonaktif', btrim(p_member); end if;
    v_member_label := upper(btrim(p_member)) || ' - ' || v_member_name;
  end if;

  v_inv := 'INV-' || to_char(now() at time zone 'Asia/Jakarta','YYMMDD')
           || '-' || lpad(nextval('invoice_seq')::text, 6, '0');

  insert into sales(id, invoice_no, branch_id, cashier_id, payment_method, member_id, member_label, request_id)
  values (v_sale, v_inv, v_branch, auth.uid(), p_method, v_member, v_member_label, p_request_id);

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
                             'request_id', p_request_id, 'member', v_member_label));

  return jsonb_build_object('sale_id', v_sale, 'invoice_no', v_inv, 'subtotal', v_sub,
                            'discount', v_disc, 'total', v_total, 'change', coalesce(v_change, 0),
                            'member', v_member_label);
end $$;

revoke all on function find_member(text) from public, anon;
revoke all on function member_save(uuid, text, text, boolean, jsonb) from public, anon;
revoke all on function member_delete(uuid) from public, anon;
revoke all on function import_members(jsonb, boolean) from public, anon;
revoke all on function _member_text(jsonb, text, int) from public, anon, authenticated;
revoke all on function _member_saldo(jsonb) from public, anon, authenticated;
revoke all on function create_sale(jsonb, text, payment_method, numeric, uuid, uuid) from public, anon;
grant execute on function find_member(text), member_save(uuid, text, text, boolean, jsonb),
                    member_delete(uuid), import_members(jsonb, boolean),
                    create_sale(jsonb, text, payment_method, numeric, uuid, uuid)
  to authenticated;
