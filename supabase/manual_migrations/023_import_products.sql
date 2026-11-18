-- Migrasi 023: IMPOR CSV PRODUK (dari aplikasi).
-- Sama sifatnya dengan impor CSV member: file dibaca di browser, lalu baris divalidasi & disimpan
-- lewat satu RPC. Hanya kode/nama/harga/pengarang/status yang disentuh; harga beli (product_costs)
-- dan stok TIDAK ikut diubah.
--   * Baris dengan kode yang sudah ada: DILEWATI, kecuali p_overwrite=true (hanya kolom yang ada di file).
--   * Hak: products.c untuk menambah produk baru, products.u untuk menimpa (p_overwrite).
-- Aman diulang.

create or replace function import_products(p_rows jsonb, p_overwrite boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_code text; v_name text; v_author text; v_price numeric; v_active boolean;
  v_id uuid; v_ok boolean;
  e_name text; e_price numeric; e_author text; e_active boolean;
  n_ins int := 0; n_upd int := 0; n_skip int := 0; n_bad int := 0; v_bad jsonb := '[]'::jsonb;
begin
  if not has_perm('products', 'c') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_overwrite and not has_perm('products', 'u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'data tidak valid'; end if;
  if jsonb_array_length(p_rows) > 50000 then raise exception 'maksimal 50.000 baris per impor'; end if;

  for r in select x as j from jsonb_array_elements(p_rows) x
  loop
    v_name := null; v_author := null; v_price := null; v_active := null; v_ok := true;

    v_code := btrim(coalesce(r.j->>'code', ''));
    begin
      if v_code = '' or length(v_code) > 40 then
        raise exception 'kode produk tidak valid' using errcode = '22023';
      end if;
      if r.j ? 'name' then
        v_name := btrim(coalesce(r.j->>'name', ''));
        if v_name = '' or length(v_name) > 200 then
          raise exception 'nama produk tidak valid' using errcode = '22023';
        end if;
      end if;
      if r.j ? 'author' then
        v_author := nullif(btrim(coalesce(r.j->>'author', '')), '');
        if length(coalesce(v_author, '')) > 200 then
          raise exception 'pengarang terlalu panjang' using errcode = '22001';
        end if;
      end if;
      if r.j ? 'price' then
        v_price := (r.j->>'price')::numeric;
        if v_price < 0 or v_price <> round(v_price) then
          raise exception 'harga tidak valid' using errcode = '22023';
        end if;
      end if;
      if r.j ? 'is_active' then
        v_active := (r.j->>'is_active')::boolean;
      end if;
    exception when others then
      v_ok := false;
    end;

    if not v_ok then
      n_bad := n_bad + 1;
      if jsonb_array_length(v_bad) < 10 then
        v_bad := v_bad || to_jsonb(coalesce(nullif(v_code, ''), '(kosong)'));
      end if;
      continue;
    end if;

    select id, name, price, author, is_active
      into v_id, e_name, e_price, e_author, e_active
      from products where upper(btrim(code)) = upper(v_code)
      limit 1;

    if v_id is null then
      -- produk baru: nama & harga wajib; tanpa kolom status, harga 0 otomatis nonaktif
      if v_name is null or v_price is null then
        n_bad := n_bad + 1;
        if jsonb_array_length(v_bad) < 10 then v_bad := v_bad || to_jsonb(v_code); end if;
        continue;
      end if;
      v_active := coalesce(v_active, v_price > 0);
      if v_active and v_price <= 0 then
        n_bad := n_bad + 1;
        if jsonb_array_length(v_bad) < 10 then v_bad := v_bad || to_jsonb(v_code); end if;
        continue;
      end if;
      insert into products(code, name, price, author, is_active, attributes)
      values (v_code, v_name, v_price, v_author, v_active, '[]'::jsonb);
      n_ins := n_ins + 1;
    elsif p_overwrite then
      -- hanya kolom yang ADA di file yang ditimpa
      e_name   := coalesce(v_name, e_name);
      e_price  := coalesce(v_price, e_price);
      e_author := case when r.j ? 'author' then v_author else e_author end;
      e_active := coalesce(v_active, e_active, true);
      -- produk aktif wajib harga > 0 (constraint database); baris seperti itu dilewati, bukan menggagalkan impor
      if e_name is null or e_name = '' or (e_active and e_price <= 0) then
        n_bad := n_bad + 1;
        if jsonb_array_length(v_bad) < 10 then v_bad := v_bad || to_jsonb(v_code); end if;
        continue;
      end if;
      update products set name = e_name, price = e_price, author = e_author, is_active = e_active
       where id = v_id;
      n_upd := n_upd + 1;
    else
      n_skip := n_skip + 1;
    end if;
  end loop;

  insert into audit_log(actor_id, action, entity, detail)
  values (auth.uid(), 'product.import', 'products',
          jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip,
                             'invalid', n_bad, 'overwrite', p_overwrite));

  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'skipped', n_skip,
                            'invalid', n_bad, 'invalid_sample', v_bad);
end $$;

revoke all on function import_products(jsonb, boolean) from public, anon;
grant execute on function import_products(jsonb, boolean) to authenticated;
