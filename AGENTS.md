# AGENTS.md — Konteks proyek POS Terintegrasi

Dokumen serah-terima untuk agen/AI coding yang melanjutkan proyek ini. Baca SELURUHNYA sebelum mengubah apa pun.
Terakhir diperbarui: 22 Okt 2026.

## 1. Tentang proyek
Aplikasi POS web terintegrasi (multi-cabang + pusat) untuk toko buku/rohani. Database Supabase (Postgres) terpusat.
- Pemilik proyek berbahasa Indonesia dan bukan programmer berpengalaman. **Jelaskan pelan-pelan, sederhana, langkah demi langkah** (klik apa, ketik apa). Balas dalam bahasa Indonesia.
- Dikembangkan di PC desktop (Windows/Linux/macOS). Version control lewat repo GitHub → **jangan pernah commit data sensitif**.
- Ada template tampilan referensi (prototipe React-CDN dengan tema hijau); tampilannya sudah dipindahkan ke proyek ini. Template TIDAK dipakai untuk logika (ia hanya menyimpan data di memori browser dan mengecek hak akses di sisi klien, jadi tidak aman).

## 2. Stack
Vite 5 + React 18 + TypeScript (strict) + Tailwind v4 (dark mode lewat class `dark`, warna `brand-*` hijau) + React Router 6 + TanStack Query 5 + lucide-react + `@supabase/supabase-js`. Tanpa server sendiri: browser bicara langsung ke Supabase; aturan penting dijaga di database (RLS + fungsi RPC `security definer`).
Skrip impor: Node + `exceljs`. Tes SQL: `@electric-sql/pglite`.

## 3. Struktur folder
```
supabase/schema.sql                         tabel, RLS, RPC awal, seed role/fitur
supabase/migrations/002_products_import.sql kolom author, attributes[], constraint harga aktif > 0
supabase/migrations/003_costs_and_line_discount.sql  harga beli rahasia + diskon per baris + create_sale baru
supabase/migrations/004_stock_views.sql     stock_by_branch, set_stock, adjust_stock (cek cabang)
scripts/import-products.mjs                 impor Excel → products (+ product_costs, + stok awal)
tests/sql-smoke.mjs                         tes SQL otomatis (npm run test:sql)
src/main.tsx, App.tsx, index.css            provider, route, gaya (.btn/.btn-primary/.btn-ghost/.input = rounded)
src/lib/supabase.ts                         klien (hanya anon key dari .env)
src/shared/                                 format.ts (rupiah), hooks.ts (useDebounced, useIdle), search.ts (cleanSearch), Modal.tsx
src/features/<fitur>/                       modular: halaman + api.ts + komponen per fitur
  auth/      AuthProvider (sesi, profil, can(feature, 'c'|'r'|'u'|'d'), auto-logout 15 menit), guards, LoginPage (ingat email, ikon mata)
  layout/    Layout (sidebar menurut hak akses, header, toggle tema)
  pos/       PosPage (kasir), api.ts, Receipt.tsx (struk 80mm via window.print), types.ts
  products/  ProductsPage (daftar baris + double-click = detail card), ProductForm, ProductDetail, api.ts
  stock/     StockPage, StockEdit, StockByBranch (chip stok per cabang), api.ts
  settings/  SettingsPage, theme.tsx
```
Fitur baru = folder baru di `features/` + 1 baris di tabel `features` (SQL) + 1 route di `App.tsx` + 1 item NAV di `Layout.tsx`.

## 4. Keputusan bisnis (sudah final, jangan diubah tanpa tanya)
- **Harga produk sama di semua cabang** (satu harga global). Yang berbeda per cabang hanya **stok**.
- **Diskon hanya pilihan tetap 0/5/10/15/20/25%**, TANPA diskon custom dan TANPA approval (promo bulanan = otomatis sah). Diskon **per produk di keranjang**, plus kotak centang "Diskon semua produk". Member/nomor member **wajib** bila ada diskon.
- **Daftar produk berbentuk BARIS** (tabel), bukan card. Kasir: Kode produk | Nama produk | Harga. Halaman Produk menambah kolom Pengarang.
- Double-click baris produk → card per kolom Excel lainnya (urutan sesuai Excel; kolom kosong tidak ditampilkan).
- Alur kasir: pilih produk → klik **Pembayaran (F8)** → pilih diskon (per produk / semua) + member → **Lanjut ke metode bayar** → Tunai (hitung kembalian, tombol uang pas) atau QRIS/Debit/Kartu Kredit (langsung cetak struk).
- Semua tombol/input **rounded**. Mode gelap/terang dengan toggle (header + halaman Pengaturan). Navigasi keyboard: F2 cari, ↑↓ pilih, Enter tambah/buka, F8 maju, Esc mundur, angka 1–4 pilih metode bayar.
- **Stok** (arti kolom Excel menurut pemilik):
  - `stokOnHand` (Excel) = TOTAL akumulasi stok sebuah produk secara global (pusat + semua cabang), BUKAN angka per cabang. Di aplikasi stok disimpan per (cabang, produk) di tabel `stock`; total global = jumlah semua cabang (dihitung, tidak disimpan). Rincian stok sebuah cabang hanya bisa dilihat/diubah user cabang itu dan role lintas cabang.
  - Rencana stok awal (MENUNGGU konfirmasi pemilik): total Excel diimpor ke PUSAT (`--stock-branch=PUSAT`), lalu user pengadaan membaginya ke cabang lewat fitur **Mutasi stok** (kurangi pusat, tambah cabang, atomik; total global tetap). Mutasi stok BELUM dibuat: butuh migrasi 005 (reason `transfer_in`/`transfer_out` pada `stock_movements` + RPC `transfer_stock` dengan cek hak `stock.u`, akses cabang, dan stok asal cukup) + UI di halaman Stok. Tampilkan juga "Total semua cabang" di `StockByBranch`.
  - `stokGudLain` = stok yang tampil di SEMUA toko, dikelompokkan per baris/cabang dengan jumlah aktual masing-masing → diwujudkan lewat RPC `stock_by_branch` (nama cabang + jumlah saja, terlihat semua user yang berhak).
  - `stokKonsinyasi` = DIBUANG (belum dipakai). `stokPE` = semua nol, dibiarkan sebagai card.
  - Stok awal diatur user **pengadaan**.
- **Harga beli** (Excel `Price1`; juga `OldPrice1`, `lastCost`) = rahasia, hanya role dengan hak `cost_prices` (superadmin, pengadaan, keuangan). Disimpan di tabel terpisah `product_costs`. **Harga jual = Excel kolom O (`Price2`).**

## 5. Peran & hak akses (RBAC berbasis permission, bukan nama role)
Tabel: `roles`, `features`, `role_permissions(role_id, feature_key, can_create/read/update/delete)`, `profiles(id, full_name, branch_id, role_id, is_active)`. Role = paket permission; superadmin mengatur CRUD per fitur (halaman belum dibuat). `roles.all_branches=true` → boleh lihat semua cabang.
Role bawaan: `superadmin` (semua, lintas cabang), `kasir` (pos c/r, sales_recap r; hanya cabangnya), `kabag` (sales_recap r, sales_void r/u; lintas cabang), `pengadaan` (products, stock, purchasing c/r/u; cost_prices c/r/u; lintas cabang), `keuangan` (sales_recap r, finance r, cost_prices r; lintas cabang).
Fitur (`features.key`): pos, sales_recap, sales_void, products, stock, purchasing, members, finance, users, roles, audit, settings, cost_prices.
Ide role tambahan yang sudah didiskusikan (belum dibuat): supervisor kasir, gudang, manajer cabang, auditor (read-only), marketing/member.

## 6. Aturan keamanan (WAJIB dipatuhi)
1. Hak akses **ditegakkan di database** (RLS + RPC). Guard di React (`RequirePerm`, `can()`) hanya untuk UX.
2. Browser hanya memakai **anon key**. `service_role` TIDAK BOLEH masuk frontend/repo. File rahasia: `.env`, `.env.import` (sudah di `.gitignore`, begitu juga `*.xlsx`, `*.csv`, `import-report/`). Jangan pernah meminta/menampilkan isinya.
3. Penjualan **hanya lewat RPC `create_sale`**: harga, diskon, cabang, stok dihitung ulang di server; klien cuma kirim `product_id`, `qty`, `discount_pct`. Tidak ada policy INSERT/UPDATE/DELETE langsung pada `sales`, `sale_items`, `stock`, `stock_movements`.
4. Transaksi **tidak dihapus**; koreksi lewat `void_sale` (alasan wajib, stok dikembalikan, tercatat di `audit_log`). Produk **tidak dihapus**, hanya `is_active=false`. Produk aktif wajib `price > 0` (constraint DB).
5. Stok tidak boleh minus; perubahan stok hanya lewat `adjust_stock` (barang masuk >0) dan `set_stock` (stok aktual/opname), keduanya mengecek hak `stock.u` **dan** akses cabang (`can_see_branch`); semua tercatat di `stock_movements` + `audit_log`.
6. Semua fungsi `security definer` memakai `set search_path = public`, mencabut `EXECUTE` dari `public/anon`, dan memberi ke `authenticated`.
7. Input pencarian dibersihkan (`shared/search.ts`) sebelum masuk filter PostgREST. Pesan login generik. Auto-logout idle 15 menit. Tanpa `dangerouslySetInnerHTML`.
8. Fungsi/perubahan SQL baru: buat sebagai migrasi bernomor berikutnya, **idempoten** (aman diulang), lalu tambahkan uji di `tests/sql-smoke.mjs`.

## 7. Data Excel sumber (`database28Ags.xlsx`, sheet `DataMaster`, baris 1 = judul, 32.656 produk, 37 kolom A–AK)
- A `produk id` = kode produk (TEKS, 10 karakter, ada yang alfanumerik seperti `1115AX0126`; unik) · B `prod Desc` = nama (maks 24 karakter; kolom F `Prod Nama Pnjng` = nama panjang) · O `Price2` = harga jual · AK `pengarang` (±55% kosong) · AG `Status` Y/N (N → nonaktif).
- N `Price1` = harga beli (rahasia). R `stokOnHand`, S `stokGudLain`, T `stokKonsinyasi`, U `stokPE`.
- Aturan impor (sudah diuji dry-run): harga 0 (1.984 produk) atau tidak valid (42, mis. `1,07E+11`) → diimpor **nonaktif**; 9 produk > Rp10 juta ditandai untuk dicek; 1 produk tanpa nama (`1115AX0126`). Hasil: 28.343 aktif / 4.313 nonaktif. Catatan lengkap di `import-report/products_perlu_dicek.csv` (dibuat skrip).
- Kolom lain disimpan di `products.attributes` sebagai array `[{"k": "<judul kolom>", "v": <nilai>}]` agar urutan Excel terjaga. Kolom harga beli → `product_costs.attributes`. Kolom stok tidak disimpan sebagai card.
- Impor: `npm run import:products -- file.xlsx --dry-run` lalu tanpa `--dry-run`. Default produk yang sudah ada DILEWATI (tidak menimpa harga yang diubah di aplikasi); `--update` menimpa. Stok awal: `--stock-branch=KODE` (hanya mengisi stok yang belum ada).

## 8. Cara menjalankan
1. Supabase SQL Editor (role `postgres`): jalankan `schema.sql` lalu `migrations/002` → `003` → `004` berurutan.
2. Buat user di Authentication → Users (centang Auto Confirm), lalu isi `profiles` dengan SQL (lihat README). User tanpa baris `profiles` aktif akan langsung dikeluarkan oleh aplikasi.
3. `.env` dari `.env.example` (URL + anon key). `.env.import` dari `.env.import.example` (hanya untuk skrip impor, di komputer pemilik).
4. `npm install` → `npm run dev` (http://localhost:5173). Cek: `npx tsc --noEmit`, `npm run build`, `npm run test:sql`.
Catatan lingkungan: shell sandbox kadang `sh` (tanpa brace expansion). Tailwind v4: jangan `@apply` kelas kustom; pakai `@utility`.

## 9. Status
**Selesai:** login, layout/tema, kasir (scan barcode, diskon per produk, bayar, struk), produk & harga (daftar, tambah/ubah, detail card, harga beli rahasia), stok per cabang (halaman Stok & Pengadaan, strip stok di kasir, detail produk), skrip impor, migrasi 002–004, tes SQL.
**Belum dibuat (urutan yang disarankan):**
1. Impor stok awal (total Excel → PUSAT), bangun fitur Mutasi stok pusat→cabang (migrasi 005), lalu uji kasir end-to-end dengan stok nyata (lihat §4 dan §10).
2. Rekap Penjualan: rekap harian kasir (cabangnya), rekap Kabag (inputan kasir), void transaksi (RPC `void_sale` sudah ada, UI belum).
3. Keuangan: rekap penjualan per metode bayar.
4. Halaman Cabang (tambah/nonaktifkan) dan Pengguna & Role (matriks CRUD per fitur; membuat user butuh Supabase Edge Function dengan `service_role` — kunci hanya di sisi Supabase, tidak di repo).
5. Purchase Order (fitur `purchasing` ada, tabel/halaman belum) dan halaman Member (tabel `members` ada; kasir saat ini hanya mengetik nomor/nama).
6. Hardening produksi: upgrade `react-router-dom` (npm audit moderat; JANGAN `npm audit fix --force`, itu memaksa lompat versi besar dan men-downgrade exceljs), header CSP/HSTS di hosting, MFA superadmin/keuangan, matikan sign-up publik di Supabase Auth, cadangan database.

## 10. Pertanyaan terbuka (tanya pemilik, jangan menebak)
- Terjawab: `stokOnHand` = total global (bukan per cabang). Menunggu konfirmasi: total itu ditaruh dulu di PUSAT lalu dibagi pengadaan lewat Mutasi stok? Atau sudah ada data sebaran per cabang? Cabang selain PUSAT harus ditambahkan dulu ke `branches`.
- Barcode di buku berisi nomor apa? Pencarian scan kini mencocokkan **kode produk (kolom A)** persis. Jika barcode = ISBN (`prod ISBN` di Excel berformat `979-672-465-0`), perlu kolom/indeks pencarian ISBN.
- Nama dan kode semua cabang; daftar user awal dan rolenya.
- Printer struk (thermal 80mm via dialog cetak browser sudah ada; QZ Tray bila ingin cetak tanpa dialog).

## 11. Jangan lakukan
- Jangan mengubah keputusan di §4 atau melonggarkan §6.
- Jangan memakai kartu (card) untuk daftar produk; jangan menambah diskon custom.
- Jangan menaruh logika harga/diskon/stok di klien sebagai sumber kebenaran.
- Jangan membuat file tanpa aman-diulang untuk SQL; jangan menimpa data produk/stok yang sudah ada tanpa persetujuan pemilik.
