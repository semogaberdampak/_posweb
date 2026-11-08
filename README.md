# POS Terintegrasi

Stack: Vite + React + TypeScript + Tailwind v4 + TanStack Query + Supabase.
Terakhir diperbarui: 8 Nov 2026.

## Mulai
1. Supabase → SQL Editor → jalankan `supabase/schema.sql` (di proyek kosong).
2. Buat user pertama di Authentication → Users, lalu di SQL Editor:
   `insert into profiles(id, full_name, branch_id, role_id) select '<UUID_USER>', 'Nama', (select id from branches where code='PUSAT'), (select id from roles where name='superadmin');`
3. `cp .env.example .env` lalu isi URL + anon key.
4. `npm install` → `npm run dev`

## Struktur (modular per fitur)
`src/features/<fitur>/` berisi halaman, api, dan komponen fitur itu saja:
auth · layout · pos · products · stock · sales · print · users · settings.
Fitur baru = folder baru + 1 baris di tabel `features` (SQL) + 1 route di `App.tsx` + 1 item NAV di `Layout.tsx`.
Kode bersama: `src/shared/` (format, hooks, Modal, pembersih pencarian), `src/lib/supabase.ts` (klien anon),
`src/lib/webusb-printer.ts` (cetak ESC/POS eksperimental), `src/types/webusb.d.ts` (tipe WebUSB minimal).

## Aturan keamanan
- Hanya anon key di frontend. `service_role` TIDAK PERNAH di repo/frontend.
- Hak akses ditegakkan di database (RLS/RPC); guard di React hanya UX.
- Produksi: pasang header CSP/HSTS di hosting, aktifkan MFA dan matikan sign-up publik di Supabase Auth.

## Impor produk dari Excel (sekali jalan)
1. SQL Editor → jalankan `supabase/manual_migrations/002_products_import.sql`.
2. Salin `.env.import.example` → `.env.import`, isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). File ini TIDAK ikut Git.
3. Uji coba: `npm run import:products -- database.xlsx --dry-run` (cek `import-report/`).
4. Impor: `npm run import:products -- database.xlsx` (produk yang sudah ada dilewati; `--update` untuk menimpa).
Kolom Excel: A kode, B nama, O harga, AK pengarang; kolom lain tersimpan di `attributes` dan tampil sebagai card.

## Urutan migrasi database
`schema.sql` → `manual_migrations/002_products_import.sql` → `003_costs_and_line_discount.sql` → `004_stock_views.sql` → `005_user_permissions.sql` → `006_email_domain.sql` → `007_revoke_sessions.sql` → `008_active_branch.sql` → `009_stock_tools.sql` → `010_print_templates.sql` → `011_sales_recap.sql` → `012_sales_export.sql` → `013_stock_move.sql`
(003: harga beli dipindah ke tabel rahasia `product_costs`, dan diskon per produk).

## Stok awal dari Excel (kolom stokOnHand)
`npm run import:products -- database.xlsx --stock-branch=PUSAT` (kode cabang harus sudah ada di tabel `branches`).
Hanya mengisi stok yang belum ada; stok yang sudah ada tidak diubah. `stokGudLain` dan `stokKonsinyasi` tidak diimpor.

## Untuk agen AI / pengembang lanjutan
Baca `AGENTS.md` (konteks, keputusan, aturan keamanan, status). Uji SQL: `npm run test:sql`.

## Stok awal per cabang
Lewat aplikasi: **Stok & Pengadaan → Impor stok (CSV)** (file dua kolom `kode`,`jumlah`; pilih mode "isi stok awal" atau "timpa dengan hasil hitung").
Lewat baris perintah: `npm run import:stock -- stok_cabang.xlsx --branch=KODE --dry-run` lalu tanpa `--dry-run`.
Mutasi antar cabang: halaman **Mutasi Stok** (`/mutasi-stok`) — atomik, butuh hak `stock_move` dan akses ke kedua cabang.

## Pengguna & hak akses
Setelah migrasi 005, pasang Edge Function `supabase/functions/create-user` (lihat AGENTS.md §8). Superadmin mengatur hak di menu Pengguna & Role.

## Cetak struk (thermal) & nota A4
- Pengaturan per KOMPUTER ada di **Pengaturan → Printer struk**: cetak struk otomatis (bawaan nyala) dan "hanya printer thermal" (menyembunyikan tombol nota A4). Tersimpan di browser komputer itu, bukan di akun.
- Cara paling andal (sudah tersedia): jadikan printer thermal sebagai **printer default Windows**, lalu buka aplikasi lewat `scripts\kasir-kiosk.cmd` (Chrome/Edge `--kiosk-printing`) agar `window.print()` langsung mencetak tanpa dialog. Nota A4 dicetak dari komputer lain (browser biasa).
- **WebUSB (eksperimental, 8 Nov 2026):** `src/lib/webusb-printer.ts` mencoba mengirim ESC/POS langsung ke printer USB. Belum ada UI pemilih printer (`requestUSBPrinter` belum dipanggil), jadi tanpa izin perangkat aplikasi memakai dialog cetak browser — tetap **satu kali**, tidak ganda. Isi struk USB belum mengikuti Format Nota dan belum diuji di perangkat pemilik. Jangan diandalkan sebelum disamakan dan diuji.

## Tes
`npm run test:sql` (migrasi 002–008 + RPC inti), `npm run test:e2e` (semua migrasi + alur 7 cabang lengkap), `npm run test:csv` (pembaca CSV stok), `npm run test:print` (tampilan struk/nota A4), `npm run test:printing` (penjaga sekali-cetak), `npm run test:xlsx` (isi & keamanan Excel), `npm run test:backup` (backup/verifikasi/retensi), `npm run test:merge` (pembersihan objek lama compare.zip).
Sebelum commit juga jalankan `npx tsc --noEmit` dan `npm run build`. Pemeriksaan data nyata: `supabase/checks/integritas_stok.sql`.

## Backup
`npm run backup`, `npm run backup:verify`, jadwal: `scripts/schedule-backup.ps1`. Lihat AGENTS.md bagian Backup.

Catatan: dev di alamat yang dicetak `npm run dev` (bawaan http://127.0.0.1:3000/). Di akar domain (Vercel) tanpa pengaturan tambahan; bila di subfolder isi `VITE_BASE=/_posweb/` (lihat .env.example).

Catatan versi: build & semua tes lulus di Node 26.10.0 (8 Nov 2026), tetapi Vite 5 resmi mendukung Node 18/20/22. Patok versi Node saat menyiapkan CI agar hasil build konsisten.
