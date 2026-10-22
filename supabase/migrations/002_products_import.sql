-- Migrasi 002: kolom pengarang + atribut tambahan produk (dari Excel) + aturan harga.
-- Jalankan SEKALI di SQL Editor (role: postgres), setelah schema.sql.

alter table products add column if not exists author text check (length(author) <= 200);

-- Semua kolom Excel lain, urut sesuai kolom Excel: [{"k":"prod ISBN","v":"979-..."}, ...]
alter table products add column if not exists attributes jsonb not null default '[]'::jsonb
  check (jsonb_typeof(attributes) = 'array');

create index if not exists products_author_trgm on products using gin (author gin_trgm_ops);

-- Produk AKTIF wajib berharga > 0 (mencegah penjualan Rp 0). Dijaga di database.
alter table products drop constraint if exists products_active_price_chk;
alter table products add constraint products_active_price_chk check (is_active = false or price > 0);
