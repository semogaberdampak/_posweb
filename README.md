# POS Terintegrasi

Stack: Vite + React + TypeScript + Tailwind v4 + TanStack Query + Supabase.

## Mulai
1. Supabase → SQL Editor → jalankan `supabase/schema.sql` (di proyek kosong).
2. Buat user pertama di Authentication → Users, lalu di SQL Editor:
   `insert into profiles(id, full_name, branch_id, role_id) select '<UUID_USER>', 'Nama', (select id from branches where code='PUSAT'), (select id from roles where name='superadmin');`
3. `cp .env.example .env` lalu isi URL + anon key.
4. `npm install` → `npm run dev`

## Struktur (modular per fitur)
`src/features/<fitur>/` berisi halaman, api, dan komponen fitur itu saja:
auth · layout · pos · settings (berikutnya: products, stock, reports, users).
Fitur baru = folder baru + 1 baris di tabel `features` (SQL) + 1 route di `App.tsx`.

## Aturan keamanan
- Hanya anon key di frontend. `service_role` TIDAK PERNAH di repo/frontend.
- Hak akses ditegakkan di database (RLS/RPC); guard di React hanya UX.
- Produksi: pasang header CSP/HSTS di hosting, aktifkan MFA dan matikan sign-up publik di Supabase Auth.

## Impor produk dari Excel (sekali jalan)
1. SQL Editor → jalankan `supabase/migrations/002_products_import.sql`.
2. Salin `.env.import.example` → `.env.import`, isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). File ini TIDAK ikut Git.
3. Uji coba: `npm run import:products -- database.xlsx --dry-run` (cek `import-report/`).
4. Impor: `npm run import:products -- database.xlsx` (produk yang sudah ada dilewati; `--update` untuk menimpa).
Kolom Excel: A kode, B nama, O harga, AK pengarang; kolom lain tersimpan di `attributes` dan tampil sebagai card.

## Urutan migrasi database
`schema.sql` → `migrations/002_products_import.sql` → `003_costs_and_line_discount.sql` → `004_stock_views.sql`
(003: harga beli dipindah ke tabel rahasia `product_costs`, dan diskon per produk).

## Stok awal dari Excel (kolom stokOnHand)
`npm run import:products -- database.xlsx --stock-branch=PUSAT` (kode cabang harus sudah ada di tabel `branches`).
Hanya mengisi stok yang belum ada; stok yang sudah ada tidak diubah. `stokGudLain` dan `stokKonsinyasi` tidak diimpor.

## Untuk agen AI / pengembang lanjutan
Baca `AGENTS.md` (konteks, keputusan, aturan keamanan, status). Uji SQL: `npm run test:sql`.
