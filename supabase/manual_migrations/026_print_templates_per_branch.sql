-- Migrasi 026: FORMAT NOTA PER CABANG + fitur `format_nota`.
-- Setiap cabang (toko) boleh punya format struk/nota sendiri (nama toko, alamat, telepon, dst.).
-- Satu baris per (jenis, cabang). branch_id NULL = format BAWAAN/GLOBAL (dipakai cabang yang belum
-- punya format sendiri, mis. saat cetak ulang transaksi cabang lama).
-- Hak: fitur baru `format_nota` (r = boleh membuka halaman, u = boleh menyimpan).
-- Superadmin boleh mengubah format semua cabang + format global; pengguna lain hanya cabangnya
-- sendiri (atau cabang yang boleh dilihatnya, untuk role lintas cabang).
-- Aman diulang.

-- ---------- 1) tabel: tambah cabang, ganti kunci utama ----------
-- (dibuat bila belum ada supaya migrasi ini juga aman di database yang belum menjalankan 010)
create table if not exists print_templates (
  kind       text not null,
  config     jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table print_templates add column if not exists branch_id uuid references branches(id) on delete cascade;

do $$
declare v_con text;
begin
  -- dulu primary key = (kind) sehingga hanya boleh 1 baris per jenis. Sekarang unik per (jenis, cabang).
  select conname into v_con
    from pg_constraint
   where conrelid = 'print_templates'::regclass and contype = 'p';
  if v_con is not null then
    execute format('alter table print_templates drop constraint %I', v_con);
  end if;
end $$;

-- NULL tidak dianggap sama oleh unique index biasa → pakai dua indeks parsial.
create unique index if not exists print_templates_branch_uniq on print_templates(kind, branch_id) where branch_id is not null;
create unique index if not exists print_templates_global_uniq on print_templates(kind) where branch_id is null;

-- baca tetap untuk semua user login (kasir perlu membaca format cabangnya & format global)
drop policy if exists print_templates_r on print_templates;
create policy print_templates_r on print_templates for select to authenticated using (true);
revoke all on print_templates from anon, authenticated;
grant select on print_templates to authenticated;

-- ---------- 2) fitur & hak bawaan ----------
insert into features(key, label) values ('format_nota','Format nota / struk')
on conflict (key) do nothing;

-- superadmin: semua; kasir: boleh lihat & ubah format cabangnya sendiri (tidak boleh hapus).
insert into role_permissions(role_id, feature_key, can_create, can_read, can_update, can_delete)
select r.id, 'format_nota', p.c, p.r, p.u, false
  from (values ('superadmin', true, true, true), ('kasir', true, true, true)) p(role, c, r, u)
  join roles r on r.name = p.role
on conflict (role_id, feature_key) do nothing;

-- ---------- 3) simpan format (per cabang) ----------
-- Versi lama 2 argumen diganti; pemanggil 2 argumen tetap jalan karena p_branch punya nilai bawaan.
drop function if exists save_print_template(text, jsonb);

create or replace function save_print_template(p_kind text, p_config jsonb, p_branch uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid;
  v_own uuid;
begin
  if p_kind not in ('receipt','invoice') then raise exception 'jenis format tidak valid'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'isi format tidak valid'; end if;
  if length(p_config::text) > 40000 then raise exception 'format terlalu besar'; end if;

  if _is_superadmin(auth.uid()) then
    -- superadmin: p_branch null = format global, selain itu format cabang itu
    v_branch := p_branch;
  else
    if not has_perm('format_nota','u') then raise exception 'forbidden' using errcode = '42501'; end if;
    select branch_id into v_own from profiles where id = auth.uid() and is_active;
    if p_branch is not null then
      if not can_see_branch(p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
      v_branch := p_branch;
    else
      -- tanpa pilihan cabang: format cabang user sendiri (TIDAK boleh menimpa format global)
      v_branch := v_own;
    end if;
    if v_branch is null then raise exception 'pilih cabang terlebih dahulu'; end if;
  end if;

  if v_branch is not null and not exists (select 1 from branches where id = v_branch) then
    raise exception 'cabang tidak ditemukan';
  end if;

  update print_templates
     set config = p_config, updated_by = auth.uid(), updated_at = now()
   where kind = p_kind and branch_id is not distinct from v_branch;
  if not found then
    insert into print_templates(kind, config, branch_id, updated_by, updated_at)
    values (p_kind, p_config, v_branch, auth.uid(), now());
  end if;

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'print_template.save', 'print_templates', p_kind,
          jsonb_build_object('branch', v_branch));
end $$;
revoke all on function save_print_template(text, jsonb, uuid) from public, anon;
grant execute on function save_print_template(text, jsonb, uuid) to authenticated;

-- ---------- 4) sale_detail menyertakan cabang (untuk memilih format cabang saat cetak ulang) ----------
create or replace function sale_detail(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s sales;
begin
  if not has_perm('sales_recap','r') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from sales where id = p_sale;
  if not found or not can_see_branch(s.branch_id) then raise exception 'transaksi tidak ditemukan'; end if;
  return jsonb_build_object(
    'id', s.id, 'invoice_no', s.invoice_no, 'created_at', s.created_at, 'status', s.status, 'void_reason', s.void_reason,
    'branch_id', s.branch_id,
    'branch_name', (select name from branches where id = s.branch_id),
    'cashier_name', coalesce((select full_name from profiles where id = s.cashier_id), '-'),
    'payment_method', s.payment_method, 'subtotal', s.subtotal, 'discount_amount', s.discount_amount, 'total', s.total,
    'cash_received', s.cash_received, 'change_amount', s.change_amount, 'member_label', s.member_label,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'name', i.name, 'unit_price', i.unit_price, 'qty', i.qty,
              'discount_pct', i.discount_pct, 'discount_amount', i.discount_amount, 'line_total', i.line_total) order by i.id), '[]'::jsonb)
              from sale_items i where i.sale_id = s.id));
end $$;
revoke all on function sale_detail(uuid) from public, anon;
grant execute on function sale_detail(uuid) to authenticated;
