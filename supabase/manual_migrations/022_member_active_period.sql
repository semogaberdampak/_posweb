-- Migrasi 022: MASA AKTIF MEMBER.
-- 1. Kolom active_from / active_until pada members (tanggal; null = tanpa batas).
-- 2. member_save menerima masa_mulai / masa_sampai lewat p_data (kolom baru).
-- 3. RPC baru member_set_active_period: ubah/perpanjang masa aktif (butuh hak members.u).
-- 4. find_member mengembalikan active_until agar kasir bisa melihat sisa masa aktif.
-- Aman diulang.

alter table members add column if not exists active_from date;
alter table members add column if not exists active_until date;

-- ---------- find_member: tambah active_until ----------
drop function if exists find_member(text);
create or replace function find_member(p_query text)
returns table (id uuid, member_no text, name text, is_active boolean,
               institution text, city text, segment text, segment_detail text, balance numeric,
               active_from date, active_until date)
language plpgsql stable security definer set search_path = public as $$
declare v_raw text; v_like text;
begin
  if not (has_perm('members', 'r') or has_perm('pos', 'r')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_raw := btrim(coalesce(p_query, ''));
  if v_raw = '' then return; end if;
  v_like := replace(replace(replace(v_raw, '\\', '\\\\'), '%', '\\%'), '_', '\\_');
  return query
    select m.id, m.member_no, m.name, m.is_active,
           m.institution, m.city, m.segment, m.segment_detail, m.balance,
           m.active_from, m.active_until
      from members m
     where upper(m.member_no) = upper(v_raw)
        or m.member_no ilike v_like || '%'
        or m.name ilike '%' || v_like || '%'
     order by (upper(m.member_no) = upper(v_raw)) desc, m.member_no
     limit 20;
end $$;

-- ---------- member_save: baca masa_mulai / masa_sampai dari p_data ----------
create or replace function member_save(p_id uuid, p_no text, p_name text, p_active boolean default true,
                                      p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_no text; v_name text; v_id uuid;
  v_lembaga text; v_alamat text; v_kota text; v_prop text; v_telp text; v_sell text;
  v_seg text; v_segdet text; v_saldo numeric;
  v_from date; v_until date;
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

  -- masa aktif: kosong = tanpa batas; format YYYY-MM-DD
  begin
    v_from := nullif(btrim(coalesce(p_data->>'masa_mulai', '')), '')::date;
  exception when others then
    raise exception 'masa mulai tidak valid (pakai YYYY-MM-DD)';
  end;
  begin
    v_until := nullif(btrim(coalesce(p_data->>'masa_sampai', '')), '')::date;
  exception when others then
    raise exception 'masa sampai tidak valid (pakai YYYY-MM-DD)';
  end;
  if v_from is not null and v_until is not null and v_until < v_from then
    raise exception 'masa sampai tidak boleh sebelum masa mulai';
  end if;

  if p_id is null then
    insert into members(member_no, name, is_active, institution, address, city, province,
                        phone, mobile, segment, segment_detail, balance, active_from, active_until)
    values (v_no, v_name, p_active, v_lembaga, v_alamat, v_kota, v_prop,
            v_telp, v_sell, v_seg, v_segdet, coalesce(v_saldo, 0), v_from, v_until)
    returning id into v_id;
    insert into audit_log(actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'member.create', 'members', v_id::text,
            jsonb_build_object('member_no', v_no, 'name', v_name, 'active', p_active,
                               'active_from', v_from, 'active_until', v_until));
  else
    update members set member_no = v_no, name = v_name, is_active = p_active,
           institution = v_lembaga, address = v_alamat, city = v_kota, province = v_prop,
           phone = v_telp, mobile = v_sell, segment = v_seg, segment_detail = v_segdet,
           balance = coalesce(v_saldo, 0), active_from = v_from, active_until = v_until
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'member tidak ditemukan'; end if;
    insert into audit_log(actor_id, action, entity, entity_id, detail)
    values (auth.uid(), 'member.update', 'members', v_id::text,
            jsonb_build_object('member_no', v_no, 'name', v_name, 'active', p_active,
                               'active_from', v_from, 'active_until', v_until));
  end if;
  return v_id;
end $$;

-- ---------- fungsi baru: ubah / perpanjang masa aktif ----------
create or replace function member_set_active_period(p_id uuid, p_from date default null, p_until date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text;
begin
  if not has_perm('members', 'u') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is not null and p_until is not null and p_until < p_from then
    raise exception 'masa sampai tidak boleh sebelum masa mulai';
  end if;
  update members set active_from = p_from, active_until = p_until where id = p_id
    returning id, member_no into v_id, v_no;
  if v_id is null then raise exception 'member tidak ditemukan'; end if;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'member.extend', 'members', v_id::text,
          jsonb_build_object('member_no', v_no, 'active_from', p_from, 'active_until', p_until));
  return v_id;
end $$;

-- ---------- revoke / grant ----------
revoke all on function find_member(text) from public, anon;
revoke all on function member_save(uuid, text, text, boolean, jsonb) from public, anon;
revoke all on function member_delete(uuid) from public, anon;
revoke all on function import_members(jsonb, boolean) from public, anon;
revoke all on function member_set_active_period(uuid, date, date) from public, anon;
revoke all on function _member_text(jsonb, text, int) from public, anon, authenticated;
revoke all on function _member_saldo(jsonb) from public, anon, authenticated;
revoke all on function create_sale(jsonb, text, payment_method, numeric, uuid, uuid) from public, anon;
grant execute on function find_member(text), member_save(uuid, text, text, boolean, jsonb),
                    member_delete(uuid), import_members(jsonb, boolean),
                    member_set_active_period(uuid, date, date),
                    create_sale(jsonb, text, payment_method, numeric, uuid, uuid)
  to authenticated;