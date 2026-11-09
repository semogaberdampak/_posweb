# AGENTS.md — Konteks proyek POS Terintegrasi

Dokumen serah-terima untuk agen/AI coding yang melanjutkan proyek ini. Baca SELURUHNYA sebelum mengubah apa pun.
Terakhir diperbarui: 8 Nov 2026.

## 1. Tentang proyek
Aplikasi POS web terintegrasi (multi-cabang + pusat) untuk toko buku/rohani. Database Supabase (Postgres) terpusat.
- Pemilik proyek berbahasa Indonesia dan bukan programmer berpengalaman. **Jelaskan pelan-pelan, sederhana, langkah demi langkah** (klik apa, ketik apa). Balas dalam bahasa Indonesia.
- Dikembangkan di PC desktop (Windows/Linux/macOS). Version control lewat repo GitHub → **jangan pernah commit data sensitif**.
- Ada template tampilan referensi (prototipe React-CDN dengan tema hijau); tampilannya sudah dipindahkan ke proyek ini. Template TIDAK dipakai untuk logika (ia hanya menyimpan data di memori browser dan mengecek hak akses di sisi klien, jadi tidak aman).

## 2. Stack
Vite 5 + React 18 + TypeScript (strict) + Tailwind v4 (dark mode lewat class `dark`, token warna semantik amber, lihat bagian palet) + React Router 6 + TanStack Query 5 + lucide-react + `@supabase/supabase-js`. Tanpa server sendiri: browser bicara langsung ke Supabase; aturan penting dijaga di database (RLS + fungsi RPC `security definer`).
Skrip impor: Node + `exceljs`. Tes SQL: `@electric-sql/pglite`.

## 3. Struktur folder
```
supabase/schema.sql                         tabel, RLS, RPC awal, seed role/fitur
supabase/manual_migrations/002_products_import.sql kolom author, attributes[], constraint harga aktif > 0
supabase/manual_migrations/003_costs_and_line_discount.sql  harga beli rahasia + diskon per baris + create_sale baru
supabase/manual_migrations/004_stock_views.sql     stock_by_branch, set_stock, adjust_stock (cek cabang)
supabase/manual_migrations/005_user_permissions.sql hak granular: user_permissions, has_perm baru, RPC kelola role/user
supabase/manual_migrations/006_email_domain.sql    trigger: akun BARU wajib @takom.id
supabase/manual_migrations/007_revoke_sessions.sql revoke_user_sessions (hanya service_role)
supabase/manual_migrations/008_active_branch.sql   my_scope() + create_sale(p_branch): cabang aktif untuk role lintas cabang
supabase/manual_migrations/009_stock_tools.sql     import_stock() (impor CSV dari aplikasi), transfer_stock() (mutasi antar cabang), alasan transfer_in/out
supabase/manual_migrations/010_print_templates.sql  tabel print_templates (baca: semua user; tulis: hanya RPC save_print_template, superadmin)
src/features/print/                         templates.ts (bawaan = nota lama TAKOM, merge aman, token), views.tsx (ReceiptView 80mm, InvoiceView A4, PrintSheet), FormatNotaPage.tsx (editor admin /format-nota)
supabase/manual_migrations/011_sales_recap.sql     RPC sales_recap (bulan/tahun WIB, cabang, halaman 20) + sale_detail (untuk detail & cetak ulang)
src/features/sales/                         SalesRecapPage (filter bulan/tahun/cabang, kartu ringkasan, tabel 20 baris/halaman), SaleDetailModal (detail, cetak struk/A4, void), api.ts
supabase/manual_migrations/016_branch_short_top_products.sql  branches.short_name (singkatan), stock_by_branch + branch_short, RPC top_products (produk terlaris per periode)
src/features/layout/Sidebar.tsx + sidebarLayout.ts   sidebar: menu (yang tak muat disembunyikan → burger), pegangan tarik tinggi kartu, kartu terlaris; hitungan murni di sidebarLayout.ts
src/features/layout/TopProducts.tsx         widget sidebar "Produk Terlaris" (Harian rentang tanggal / Bulanan / Tahunan), menyesuaikan tinggi & zoom
tests/ui-smoke.mjs                          uji antarmuka di Chromium dengan Supabase tiruan (opsional; butuh playwright)
supabase/manual_migrations/015_report_range.sql  fungsi *_range(p_from,p_to,...) untuk Rekap/Ekspor/Keuangan (tanggal inklusif WIB, maks. 366 hari); sales_recap/sales_export/finance_summary bulanan = pembungkus tipis
src/shared/period.ts + PeriodPicker.tsx     periode laporan: Bulanan atau Rentang tanggal (pintasan Hari ini/Kemarin/7/30 hari/Bulan ini), validasi, label, tag nama berkas
supabase/manual_migrations/014_finance.sql          RPC finance_summary (bulan WIB; total, per metode/cabang/hari, estimasi laba bila punya cost_prices) + _cost_val (internal)
src/features/finance/                       FinancePage, exportFinance.ts (Excel 4 sheet), api.ts
src/lib/escpos.ts                           struk ESC/POS teks yang MENGIKUTI Format Nota (kolom 48/32, ASCII-aman)
src/lib/webusb-printer.ts                   cetak langsung via WebUSB (pairing kelas printer, kirim bertahap, gagal rapi -> cadangan cetak browser)
src/types/webusb.d.ts                       tipe WebUSB minimal
public/favicon.svg|ico, apple-touch-icon.png ikon aplikasi (keranjang, warna primer amber)
supabase/manual_migrations/013_stock_move.sql      fitur hak 'stock_move' (pengadaan+superadmin), transfer_stock (5 arg, cek stock_move.u), transfer_stock_batch (atomik), pembersihan sisa percobaan lama
src/features/stock/StockMovePage.tsx        halaman /mutasi-stok: pilih cabang asal/tujuan, cari produk (server-side), daftar, satu tombol pindahkan (atomik)
src/features/print/printing.ts              pengaturan cetak per KOMPUTER (localStorage), triggerPrint (anti-ganda), penjaga sekali-cetak
scripts/kasir-kiosk.cmd                     membuka Chrome/Edge mode --kiosk-printing (cetak langsung ke printer default, tanpa dialog)
deploy/htaccess.example                     contoh SPA fallback Apache bila di subfolder (VITE_BASE=/_posweb/); vercel.json di akar = SPA fallback + header keamanan untuk Vercel
supabase/manual_migrations/012_sales_export.sql     RPC sales_export (semua transaksi + rincian barang sebulan, dicatat di audit_log)
scripts/backup.mjs + scripts/lib/backup-core.mjs + scripts/schedule-backup.ps1   backup mandiri (npm run backup / backup:verify), jadwal harian Windows
src/features/sales/exportXlsx.ts            pembuat Excel (3 sheet), dimuat lazy saat tombol "Unduh Excel" ditekan
supabase/checks/integritas_stok.sql         pemeriksaan keutuhan (baca saja): stok = riwayat, tanpa minus, total transaksi cocok
supabase/functions/reset-password/index.ts  Edge Function: HANYA superadmin mereset kata sandi user mana pun
supabase/functions/create-user/index.ts     Edge Function pembuat akun login+profil (service_role di sisi Supabase)
scripts/import-products.mjs                 impor Excel master → products (+ product_costs)
scripts/import-stock.mjs                    impor stok awal per cabang dari file hitung fisik (kode, jumlah)
tests/sql-smoke.mjs                         tes SQL otomatis (npm run test:sql)
tests/e2e-flow.mjs                          uji alur lengkap 7 cabang: impor stok, semua metode bayar, diskon per baris, void, mutasi, keutuhan (npm run test:e2e [produk.json])
tests/print-render.mjs                      uji tampilan struk/nota A4 + merge konfigurasi (npm run test:print)
tests/stock-csv.mjs                         uji pembaca CSV stok (npm run test:csv)
src/main.tsx, App.tsx, index.css            provider, route, gaya (.btn/.btn-primary/.btn-ghost/.input = rounded)
src/lib/supabase.ts                         klien (hanya anon key dari .env)
src/shared/                                 format.ts (rupiah), hooks.ts (useDebounced, useIdle), search.ts (cleanSearch), Modal.tsx
src/features/<fitur>/                       modular: halaman + api.ts + komponen per fitur
  auth/      AuthProvider (sesi, profil, can(feature, 'c'|'r'|'u'|'d'), auto-logout 15 menit), guards, LoginPage (ingat email, ikon mata)
  layout/    Layout (sidebar menurut hak akses, header, toggle tema)
  pos/       PosPage (kasir), api.ts, types.ts (struk lewat features/print + lib/webusb-printer)
  finance/   FinancePage (/keuangan), exportFinance.ts (Excel), api.ts
  products/  ProductsPage (daftar baris + double-click = detail card), ProductForm, ProductDetail, api.ts
  stock/     StockPage, StockEdit, StockByBranch (chip stok per cabang), api.ts
  users/     UsersPage (tab Pengguna & Role), PermMatrix, NewUserModal, api.ts
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
  - Stok awal (SUDAH DIBUAT): tiap lokasi menghitung stok fisik → file CSV dua kolom `kode`,`jumlah` (template `template_stok_cabang.csv`; Excel Indonesia menyimpan CSV dengan titik koma, sudah ditangani) → halaman **Stok & Pengadaan → Impor stok (CSV)** (RPC `import_stock`, mode "isi stok awal saja" = aman, atau "timpa dengan hasil hitung" = opname). Alternatif baris perintah: `scripts/import-stock.mjs` (butuh kunci service_role lokal). Total Excel `stokOnHand` hanya PEMBANDING (jumlah semua cabang vs 17.337 pcs / 1.285 produk); `StockByBranch` menampilkan "Total semua cabang". Cabang yang stoknya belum diisi = 0 → kasirnya belum bisa menjual (hitung fisik wajib sebelum go-live).
  - **Mutasi stok** antar cabang (SUDAH DIBUAT, migrasi 009): tombol "Pindah stok antar cabang" di halaman Stok; RPC `transfer_stock` atomik, mengunci baris berurutan (anti-deadlock), butuh hak `stock.u` dan akses ke kedua cabang (jadi role lintas cabang), total global tidak berubah.
  - `stokGudLain` = stok yang tampil di SEMUA toko, dikelompokkan per baris/cabang dengan jumlah aktual masing-masing → diwujudkan lewat RPC `stock_by_branch` (nama cabang + jumlah saja, terlihat semua user yang berhak).
  - `stokKonsinyasi` = DIBUANG (belum dipakai). `stokPE` = semua nol, dibiarkan sebagai card.
  - Stok awal diatur user **pengadaan**.
- **Harga beli** (Excel `Price1`; juga `OldPrice1`, `lastCost`) = rahasia, hanya role dengan hak `cost_prices` (superadmin, pengadaan, keuangan). Disimpan di tabel terpisah `product_costs`. **Harga jual = Excel kolom O (`Price2`).**

## 4b. Palet warna (keputusan pemilik)
Palet bertema amber hangat (hue 63), didefinisikan sebagai variabel CSS di `src/index.css` (`:root` = terang, `.dark` = gelap) dan dipetakan ke utilitas Tailwind lewat `@theme inline`: `bg-bg-dark | bg-bg | bg-bg-light`, `text-text | text-text-muted`, `bg-highlight`, `border-border | border-border-muted`, `bg-primary | text-on-primary`, `secondary`, `danger`, `warning`, `success`, `info`. Mode gelap = palet dari pemilik apa adanya; mode terang = turunan (terang-gelap dibalik, hue/chroma sama) dan bisa disetel. `--on-primary` adalah tambahan (teks di atas primary). **Jangan memakai kelas warna Tailwind mentah (slate/amber/red/...) maupun varian `dark:` untuk warna**: pakai token semantik di atas. `bg-bg-light` = panel/kartu (menonjol), `bg-bg-dark` = area tenggelam (header tabel, input), baris terpilih = `bg-primary/20`, hover = `bg-highlight/25`.

## 4c. Cabang & akun (dari pemilik)
Tujuh lokasi (kode `branches.code` yang disarankan): `KRANGGAN` Takom Kranggan · `KATEDRAL` Takom Katedral · `PAULUS` Takom Paulus · `SANTAMARIA` Takom Santa Maria · `ATHANASIUS` Takom Athanasius · `ANTONIUS` Takom Antonius (pemilik menulis "Antoius", diasumsikan salah ketik; KONFIRMASI) · `PUSAT` Takom Pusat (`is_pusat=true`, baris yang sudah ada diganti namanya).
Akun kasir: 1 per cabang, KECUALI Katedral = 2. Role cabang hanya `kasir` (hanya cabangnya sendiri). Takom Pusat: banyak user dengan berbagai role (kabag, pengadaan, keuangan, dst.; lintas cabang), ditambahkan kemudian. Gunakan akun per orang (bukan akun bersama) agar audit jelas; dua kasir Katedral berbagi stok cabang yang sama (aman: pengurangan stok dikunci per baris). Username `<nama>@takom.id`.
Hosting: paket gratis Supabase (500 MB DB, tanpa backup otomatis, proyek dijeda setelah 1 minggu tanpa aktivitas, tanpa SLA). Pro (±$25/bln) = backup harian 7 hari, 8 GB, tanpa jeda. Rekomendasi: backup mandiri terjadwal selama masih gratis dan naik ke Pro sebelum go-live 7 cabang. Pantau ukuran DB: `select pg_size_pretty(pg_database_size(current_database()));`.

**Superadmin (dan role `all_branches`) harus bisa masuk ke SEMUA cabang** (keputusan pemilik, seperti admin pada umumnya): `roles.all_branches=true` membuka data semua cabang (RLS `can_see_branch`), dan header memiliki pemilih **Cabang aktif** (`AuthProvider.activeBranchId`, disimpan di sessionStorage). Di kasir, penjualan atas nama cabang aktif dikirim sebagai `p_branch` ke `create_sale`; server menolaknya untuk role non-lintas-cabang (mis. kasir). Berganti cabang mengosongkan keranjang; header menampilkan peringatan "Bertindak sebagai cabang lain". Halaman rekap/laporan nanti WAJIB memakai `activeBranchId` (atau pilihan "semua cabang").

## 5. Peran & hak akses (RBAC berbasis permission, bukan nama role)
Tabel: `roles`, `features`, `role_permissions(role_id, feature_key, can_create/read/update/delete)`, `profiles(id, full_name, branch_id, role_id, is_active)`. Role = paket permission (template). Granular: tiap USER bisa punya pengecualian per fitur di `user_permissions` (NULL = ikut role, true/false = menimpa); `has_perm()` memakai pengecualian dulu, baru role. Superadmin mengatur semuanya di halaman Pengguna & Hak Akses (matriks Tambah/Lihat/Ubah/Hapus per fitur). Fitur baru = baris baru di tabel `features` → otomatis muncul di matriks. `roles.all_branches=true` → boleh lihat semua cabang.
Role bawaan: `superadmin` (semua, lintas cabang), `kasir` (pos c/r, sales_recap r; hanya cabangnya), `kabag` (sales_recap r, sales_void r/u; lintas cabang), `pengadaan` (products, stock, purchasing c/r/u; cost_prices c/r/u; lintas cabang), `keuangan` (sales_recap r, finance r, cost_prices r; lintas cabang).
Fitur (`features.key`): pos, sales_recap, sales_void, products, stock, purchasing, members, finance, users, roles, audit, settings, cost_prices, stock_move.
Ide role tambahan yang sudah didiskusikan (belum dibuat): supervisor kasir, gudang, manajer cabang, auditor (read-only), marketing/member.

## 6. Aturan keamanan (WAJIB dipatuhi)
1. Hak akses **ditegakkan di database** (RLS + RPC). Guard di React (`RequirePerm`, `can()`) hanya untuk UX.
2. Browser hanya memakai **anon key**. `service_role` TIDAK BOLEH masuk frontend/repo. File rahasia: `.env`, `.env.import` (sudah di `.gitignore`, begitu juga `*.xlsx`, `*.csv`, `import-report/`). Jangan pernah meminta/menampilkan isinya.
3. Penjualan **hanya lewat RPC `create_sale`**: harga, diskon, cabang, stok dihitung ulang di server; klien cuma kirim `product_id`, `qty`, `discount_pct`. Tidak ada policy INSERT/UPDATE/DELETE langsung pada `sales`, `sale_items`, `stock`, `stock_movements`.
4. Transaksi **tidak dihapus**; koreksi lewat `void_sale` (alasan wajib, stok dikembalikan, tercatat di `audit_log`). Produk **tidak dihapus**, hanya `is_active=false`. Produk aktif wajib `price > 0` (constraint DB).
5. Stok tidak boleh minus; perubahan stok hanya lewat `adjust_stock` (barang masuk >0) dan `set_stock` (stok aktual/opname), keduanya mengecek hak `stock.u` **dan** akses cabang (`can_see_branch`); semua tercatat di `stock_movements` + `audit_log`.
6. Semua fungsi `security definer` memakai `set search_path = public`, mencabut `EXECUTE` dari `public/anon`, dan memberi ke `authenticated`.
7. Input pencarian dibersihkan (`shared/search.ts`) sebelum masuk filter PostgREST. Pesan login generik. Auto-logout idle 15 menit. Tanpa `dangerouslySetInnerHTML`.
8. Penulisan ke `roles`, `role_permissions`, `profiles`, `user_permissions` HANYA lewat RPC (`set_role_permission`, `set_user_permission`, `set_user_role`, `set_user_active`, `create_role`); tidak ada policy tulis langsung. Penjaga anti-eskalasi: tidak boleh mengubah hak/role/status diri sendiri; hak role `superadmin` dan akun superadmin tidak bisa diubah dari aplikasi; hanya superadmin yang boleh memberi role superadmin / `all_branches`; mencentang Tambah/Ubah/Hapus otomatis memberi Lihat. Pembuatan akun login hanya lewat Edge Function `create-user` (cek `has_perm('users','c')` atas nama pemanggil; menolak role superadmin; rollback bila profil gagal).
9. Semua akun baru WAJIB berformat `<username>@takom.id` (keputusan pemilik): dijaga di UI (NewUserModal hanya meminta username), Edge Function (`EMAIL_DOMAIN`, default takom.id) dan trigger DB (migrasi 006). Akun lama (superadmin@posweb.id) tidak diubah. Login menerima username saja (otomatis ditambah @takom.id).
10. Reset kata sandi: hanya superadmin (dicek di Edge Function `reset-password` langsung ke tabel profiles/roles, bukan dari klaim token), berlaku untuk semua role; kata sandi tidak pernah dicatat di audit_log; sesi lama user dikeluarkan lewat `revoke_user_sessions`. Pengguna mengganti kata sandinya sendiri di Pengaturan (min. 12 karakter).
11. Fungsi/perubahan SQL baru: buat sebagai migrasi bernomor berikutnya, **idempoten** (aman diulang), lalu tambahkan uji di `tests/sql-smoke.mjs`.

## 7. Data Excel sumber (`database28Ags.xlsx`, sheet `DataMaster`, baris 1 = judul, 32.656 produk, 37 kolom A–AK)
- A `produk id` = kode produk (TEKS, 10 karakter, ada yang alfanumerik seperti `1115AX0126`; unik) · B `prod Desc` = nama (maks 24 karakter; kolom F `Prod Nama Pnjng` = nama panjang) · O `Price2` = harga jual · AK `pengarang` (±55% kosong) · AG `Status` Y/N (N → nonaktif).
- N `Price1` = harga beli (rahasia). R `stokOnHand`, S `stokGudLain`, T `stokKonsinyasi`, U `stokPE`.
- Aturan impor (sudah diuji dry-run): harga 0 (1.984 produk) atau tidak valid (42, mis. `1,07E+11`) → diimpor **nonaktif**; 9 produk > Rp10 juta ditandai untuk dicek; 1 produk tanpa nama (`1115AX0126`). Hasil: 28.343 aktif / 4.313 nonaktif. Catatan lengkap di `import-report/products_perlu_dicek.csv` (dibuat skrip).
- Kolom lain disimpan di `products.attributes` sebagai array `[{"k": "<judul kolom>", "v": <nilai>}]` agar urutan Excel terjaga. Kolom harga beli → `product_costs.attributes`. Kolom stok tidak disimpan sebagai card.
- Impor: `npm run import:products -- file.xlsx --dry-run` lalu tanpa `--dry-run`. Default produk yang sudah ada DILEWATI (tidak menimpa harga yang diubah di aplikasi); `--update` menimpa. Stok awal: `--stock-branch=KODE` (hanya mengisi stok yang belum ada).

## 8. Cara menjalankan
1. Supabase SQL Editor (role `postgres`): jalankan `schema.sql` lalu `manual_migrations/002` → `003` → `004` → `005` → `006` → `007` → `008` → `009` → `010` → `011` → `012` → `013` → `014` → `015` → `016` berurutan. Setelah 005, pasang Edge Function `create-user` dan `reset-password` (Supabase → Edge Functions → Deploy a new function → Via Editor, nama `create-user`, tempel isi `supabase/functions/create-user/index.ts`; biarkan Verify JWT aktif; opsional secret `ALLOWED_ORIGIN` = alamat web aplikasi). Fungsi ini BELUM diuji di Supabase.
2. Buat user di Authentication → Users (centang Auto Confirm), lalu isi `profiles` dengan SQL (lihat README). User tanpa baris `profiles` aktif akan langsung dikeluarkan oleh aplikasi.
3. `.env` dari `.env.example` (URL + anon key). `.env.import` dari `.env.import.example` (hanya untuk skrip impor, di komputer pemilik).
4. `npm install` → `npm run dev` (alamat dicetak di terminal, bawaan http://127.0.0.1:3000). Cek: `npx tsc --noEmit`, `npm run build`, `npm run test:sql`, `npm run test:e2e`, `npm run test:csv`, `npm run test:print`, `npm run test:backup`, `npm run test:xlsx`, `npm run test:printing`, `npm run test:merge`, `npm run test:finance`, `npm run test:escpos`, `npm run test:period`, `npm run test:top`, `npm run test:sidebar`. Jalankan semua tes setiap mengubah SQL atau alur penjualan/stok; tambahkan kasus baru bila ada fitur baru.
Catatan lingkungan: shell sandbox kadang `sh` (tanpa brace expansion). Tailwind v4: jangan `@apply` kelas kustom; pakai `@utility`.

## 9. Status
**Selesai:** Pengguna & Hak Akses granular (migrasi 005 + halaman + Edge Function; SQL lolos tes lokal, UI/Edge Function belum diuji di Supabase), login, layout/tema, kasir (scan barcode, diskon per produk, bayar, struk), produk & harga (daftar, tambah/ubah, detail card, harga beli rahasia), stok per cabang (halaman Stok & Pengadaan, strip stok di kasir, detail produk), skrip impor, migrasi 002–004, tes SQL.
**Belum dibuat (urutan yang disarankan):**
1. (Pemilik) hitung fisik tiap cabang → impor lewat aplikasi → uji kasir dengan stok nyata. Fitur impor/mutasi/total sudah ada; sisanya pekerjaan data, bukan kode.
2. Tutup kasir: rekap harian per kasir/kabag (Rekap Penjualan bulanan, void, ekspor Excel & Keuangan bulanan SUDAH ada).
3. Perbaikan data harga beli (lihat bagian Keuangan): isi `lastCost`/Price1 yang benar agar estimasi laba akurat.
4. Halaman Cabang (tambah/nonaktifkan; saat ini cabang baru lewat SQL). Pengguna & Role SUDAH dibuat (lihat Status selesai) tetapi perlu diuji di Supabase sungguhan, termasuk Edge Function.
5. Purchase Order (fitur `purchasing` ada, tabel/halaman belum) dan halaman Member (tabel `members` ada; kasir saat ini hanya mengetik nomor/nama).
6. Hardening produksi: upgrade `react-router-dom` (npm audit moderat; JANGAN `npm audit fix --force`, itu memaksa lompat versi besar dan men-downgrade exceljs), header CSP/HSTS di hosting, MFA superadmin/keuangan, matikan sign-up publik di Supabase Auth, cadangan database.

## 10. Pertanyaan terbuka (tanya pemilik, jangan menebak)
- Konfirmasi pemilik untuk jalur stok awal di atas (hitung fisik per lokasi + impor per cabang). Cabang selain PUSAT harus ditambahkan dulu ke `branches` (butuh nama dan kode semua cabang).
- Barcode di buku berisi nomor apa? Pencarian scan kini mencocokkan **kode produk (kolom A)** persis. Jika barcode = ISBN (`prod ISBN` di Excel berformat `979-672-465-0`), perlu kolom/indeks pencarian ISBN.
- Konfirmasi ejaan cabang ke-6 (Antonius) dan nama orang untuk akun kasir tiap cabang. Daftar user Pusat menyusul.
- Printer struk (thermal 80mm via dialog cetak browser sudah ada; QZ Tray bila ingin cetak tanpa dialog).

## 11. Jangan lakukan
- Jangan mengubah keputusan di §4 atau melonggarkan §6.
- Jangan memakai kartu (card) untuk daftar produk; jangan menambah diskon custom.
- Jangan menaruh logika harga/diskon/stok di klien sebagai sumber kebenaran.
- Jangan membuat file tanpa aman-diulang untuk SQL; jangan menimpa data produk/stok yang sudah ada tanpa persetujuan pemilik.

## 12. Catatan serah-terima (22 Okt 2026)
Pemilik pindah ke agen lain karena kredit Claude gratis habis. Hal yang perlu ditanyakan ke pemilik di awal: (a) apakah migrasi `004_stock_views.sql` sudah dijalankan di Supabase; (b) apakah `delete from stock;` (membuang stok percobaan 100 pcs) sudah dijalankan; (c) angka yang muncul saat scan satu buku (kode produk atau ISBN); (d) nama + kode semua cabang. `npm run test:sql` butuh `npm install` dulu (paket `@electric-sql/pglite`).

## Format cetak (struk 80mm & nota A4)
- Dua format meniru nota lama TAKOM: **struk 80mm** (nota transaksi, otomatis tercetak setelah bayar) dan **nota A4** (laporan; tombol "Cetak nota A4" / "Cetak ulang struk" di banner setelah transaksi).
- Setiap elemen (kepala, label, judul kolom, kaki, tampil/sembunyi baris, kolom PPn, lebar, huruf) disimpan sebagai JSON di `print_templates` dan **hanya superadmin** yang bisa mengubah lewat halaman **Format Nota** (`/format-nota`, ada pratinjau langsung, "Cetak contoh", "Kembalikan bawaan"). Penulisan hanya lewat RPC `save_print_template` (cek superadmin di server, maks. 20 KB). Semua teks dirender sebagai teks React (tanpa HTML mentah).
- Token di teks: `{kasir} {cabang} {CABANG} {waktu} {tanggal} {no} {pelanggan}`. Pelanggan = member yang diketik kasir, bila kosong memakai `defaultCust`.
- Kolom PPn nota A4: hanya TAMPILAN (harga jual di sistem sudah termasuk pajak): harga tampil = harga / (1 + PPn efektif); bawaan PPn tertulis 12 dan efektif 11 (cocok dengan nota lama: 46.000 → 41.441). Total & stok tidak terpengaruh.
- Cetak ulang dari Rekap Penjualan sudah ada (struk 80mm & nota A4). Nomor nota memakai nomor sistem baru, bukan format `210726110001` lama.

## Rekap Penjualan (`/laporan`, fitur `sales_recap`)
- Alur: pilih **Bulan** → pilih **Tahun** (→ pilih **Cabang** bagi role lintas cabang; bawaan = cabang aktif, atau "Semua cabang") → kartu ringkasan (transaksi selesai, total penjualan, total diskon, void, total per metode bayar) + tabel transaksi **20 baris per halaman** (« ‹ Hal x dari y › »). Ganti bulan/tahun/cabang = kembali ke halaman 1.
- Batas bulan dihitung menurut **WIB** di SQL (`make_date(...)::timestamp at time zone 'Asia/Jakarta'`; JANGAN `timestamptz + interval '1 month'`, salah untuk Maret). Void tampil tapi tidak masuk total. Kasir/role satu cabang hanya melihat cabangnya (dipaksa server); cabang lain ditolak.
- Klik baris = detail transaksi (`sale_detail`): cetak struk 80mm / nota A4, dan **void** (butuh hak `sales_void.u`; alasan wajib; stok kembali). Void memanggil `void_sale` yang sudah ada.
- **Unduh Excel** (migrasi 012): seluruh transaksi bulan/cabang terpilih (bukan hanya halaman aktif): sheet Ringkasan (total, per metode, per cabang, per hari; void tidak ikut total), Transaksi, Rincian Barang. Waktu WIB sebagai teks, angka sebagai angka, kode barang & teks sebagai TEKS (aman dari injeksi rumus Excel). Batas 20.000 transaksi (pilih satu cabang bila lebih).
- Belum: ekspor PDF, rekap harian per kasir (tutup kasir), halaman Keuangan.

## Backup mandiri (Supabase gratis tidak punya backup otomatis)
- `npm run backup` (opsi `--out=DIR --keep=14`) membaca 16 tabel + daftar akun (TANPA kata sandi) lewat API (kunci service_role di `.env.import`) → `backups/pos-TAHUNBULANTANGGAL-JAMMENITDETIK/*.jsonl.gz` + `manifest.json` (jumlah baris & SHA-256). Ditulis ke folder sementara lalu di-rename: backup yang gagal tidak meninggalkan folder setengah jadi; backup lama aman. Retensi: hanya folder `pos-*` ber-manifest yang dihapus (default simpan 14). Hasil dicatat di `backups/backup.log`.
- `npm run backup:verify [-- folder]` memeriksa sidik jari, gunzip, JSON valid, jumlah baris. Backup otomatis diverifikasi setelah selesai.
- Terjadwal Windows: `powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1` (harian 22:00, jalan susulan bila PC mati; akun harus login). **Belum diuji di Windows pemilik.**
- **Pemulihan (restore) BELUM dibuat.** Kolom `id` tabel pergerakan/baris transaksi/audit bertipe `generated always` sehingga tidak bisa diisi ulang lewat REST apa adanya, dan akun login (auth.users) tidak ikut kata sandinya. Skrip restore harus dirancang & diuji di proyek Supabase cadangan sebelum dipercaya. Alternatif penuh: `pg_dump` ke connection string database (butuh PostgreSQL client).
- Data backup berisi harga beli & nama pegawai: simpan di folder yang terlindungi; salin ke flashdisk/cloud pribadi.

## Cetak otomatis & cetak ulang ke printer thermal
- Pengaturan per KOMPUTER (localStorage, halaman Pengaturan → "Printer struk"): *Cetak struk otomatis* (bawaan nyala) dan *hanya printer thermal* (menyembunyikan tombol nota A4). Setelah transaksi selesai, struk 80mm tercetak otomatis sekali (penjaga per nomor nota; aman terhadap StrictMode); "Cetak ulang struk (thermal)" ada di banner kasir & detail transaksi Rekap; "Cetak struk contoh" untuk uji printer.
- Browser TIDAK bisa memilih printer atau mencetak diam-diam sendiri. Cara kerja: printer thermal dijadikan **printer default Windows**, aplikasi dibuka lewat `scripts\kasir-kiosk.cmd` (Chrome/Edge `--kiosk-printing`, profil terpisah) sehingga `window.print()` langsung ke printer default tanpa dialog. Tanpa itu dialog cetak tetap muncul. Karena kiosk-printing tanpa dialog, nota A4 dicetak dari komputer lain (browser biasa).
- Belum teruji pada printer/Windows pemilik. Ukuran kertas memakai `@page { size: <lebar>mm auto }`; pastikan ukuran roll 80mm diatur di driver printer.

## Penggabungan dengan compare.zip (7 Nov 2026)
- Dari compare: `base: '/_posweb/'` — DIGANTI menjadi env `VITE_BASE` (bawaan `/`) karena produksi di Vercel (akar domain; base subfolder membuat aset 404). `BrowserRouter basename={import.meta.env.BASE_URL}` ditambahkan (di compare belum ada), tambahan `.gitignore`.
- Mutasi stok: percobaan di compare (`stock-move/`, `005_stock_movements.sql`) digantikan `013` + `StockMovePage` baru. Alasan: (1) policy `mov_i` memberi INSERT langsung ke buku stok, (2) policy `mov_r` tanpa batas cabang, (3) transfer 4-arg tanpa kunci baris/ref_id, (4) halaman memuat semua produk (terpotong 1000 baris oleh PostgREST), non-atomik (loop per produk), memakai kelas warna di luar palet, dan tidak terpasang di rute. 013 membersihkan objek lama bila sudah terlanjur dijalankan.
- `src/features/users/UsersRolesPage.tsx` di compare membuat `npm run build` GAGAL (mengimpor fungsi yang tidak ada di api.ts); sudah digantikan UsersPage + PermMatrix → tidak dibawa.
- `20261107172300_user_permissions.sql` = salinan identik `005_user_permissions.sql` → dipakai nama 005 (idempoten; tidak perlu dijalankan ulang bila sudah).
- Dev: http://127.0.0.1:3000/ . Hosting statis butuh SPA fallback (lihat deploy/htaccess.example).

## Folder SQL: `supabase/manual_migrations/` (BUKAN `supabase/migrations/`)
- SQL proyek ini dijalankan MANUAL di SQL Editor (schema.sql lalu 002…013). Folder bawaan CLI `supabase/migrations/` sengaja TIDAK dipakai: integrasi GitHub "Supabase Preview" menjalankan semua file di sana dari database kosong dan memakai angka di depan nama sebagai nomor versi (dua file berawalan `005` = galat `schema_migrations_pkey`, dan `schema.sql` bukan migrasi sehingga `002` gagal di database kosong). Dengan nama folder ini, integrasi mengabaikannya → Preview tidak lagi gagal dan tidak ada risiko migrasi otomatis ke produksi.
- Jangan membuat berkas SQL bernomor ganda; jangan menaruh SQL di `supabase/migrations/` kecuali alur dipindah penuh ke Supabase CLI (butuh `001_schema.sql` + semua migrasi dibuat idempoten + `supabase migration repair` pada database produksi).

## Berkas sisa yang harus tidak ada di repo (dari compare.zip / versi lama)
`src/features/users/UsersRolesPage.tsx` (membuat `tsc`/build GAGAL di Vercel), folder `src/features/stock-move/`, `src/features/pos/Receipt.tsx`, folder `supabase/migrations/` (diganti `supabase/manual_migrations/`). Mengekstrak zip menimpa folder TIDAK menghapus berkas yang hanya ada di folder lama → hapus manual, lalu jalankan `npm run build` sebelum commit.

## Keuangan (`/keuangan`, fitur `finance`, migrasi 014)
- Filter Bulan/Tahun/Cabang (WIB). Kartu: penjualan bersih, kotor, diskon, transaksi, rata-rata, void (void tidak masuk angka). Tabel per metode bayar (dengan porsi), per cabang (bila >1), per hari (dengan batang). **Unduh Excel** (4 sheet).
- **Estimasi laba kotor** hanya muncul bagi yang juga punya hak `cost_prices`; tanpa hak itu server mengembalikan `margin: null` dan Excel tidak memuat bagian laba. Server hanya mengirim agregat, tidak pernah harga beli per produk.
- **Data modal di Excel pemilik tidak bisa dipercaya mentah**: dari 28.330 produk aktif, `Price1` SAMA dengan harga jual pada 11.855 (42%) dan LEBIH TINGGI pada 1.781 (6%); `lastCost` hanya ada di 2.314 produk (median ±55% harga jual, tampak realistis). Aturan: modal = `lastCost` bila < harga jual saat transaksi, kalau tidak `Price1` bila < harga jual, kalau tidak baris itu TIDAK dihitung dan dilaporkan sebagai "tanpa data modal" + angka "cakupan data modal" (peringatan bila < 80%). Modal memakai harga beli TERKINI (bukan historis saat transaksi) → estimasi.
- Tes: `npm run test:finance` (angka dihitung tangan, hak akses, rahasia modal, batas bulan WIB) + bagian KEUANGAN di `npm run test:xlsx`.

## Cetak langsung USB (WebUSB) — eksperimental (dari zip pemilik 8 Nov 2026, diperbaiki)
- Asal: `webusb-printer.ts` di zip pemilik mengirim struk teks polos (mengabaikan Format Nota), memakai perangkat USB apa saja, tidak punya tombol pairing (jadi tak pernah aktif), lebar 32 kolom tetap. Sekarang: isi dibangun `escpos.ts` dari `ReceiptCfg` (format admin ikut), hanya perangkat kelas printer (7), pairing lewat tombol di Pengaturan (aturan browser: harus klik pengguna), pengaturan `pos.usbDirect` (bawaan mati), kirim bertahap ≤4096 byte, setiap kegagalan → cetak browser (dialog/kiosk).
- **Windows:** WebUSB hanya bisa membuka perangkat berdriver WinUSB; printer berdriver pabrikan biasanya "Access denied". Mengganti driver (mis. Zadig) membuat printer tidak lagi tampil sebagai printer Windows (kiosk-printing tak bisa memakainya). Jalur andal tetap printer default Windows + `scripts\kasir-kiosk.cmd`. Belum diuji pada printer nyata.
- Dari zip yang sama diterima: `useMemo` penyaringan hasil pencarian di memori + debounce 50 ms (server memakai pencarian kode/nama yang sama, jadi tidak ada hasil hilang), `aliveRef` (cegah cetak susulan di halaman lain), perbaikan tes untuk path Windows, URL produksi `https://posweb-nine.vercel.app/` sebagai bawaan `kasir-kiosk.cmd` (menggantikan `kasir-kiosk-1.cmd`).

## Laporan rentang tanggal (migrasi 015)
- Rekap Penjualan dan Keuangan memakai `PeriodPicker`: **Bulanan** (bulan+tahun) atau **Rentang tanggal** (Dari–Sampai, inklusif; pintasan Hari ini, Kemarin, 7/30 hari terakhir, Bulan ini). 1 hari = Dari sama dengan Sampai ("laporan harian"). Maks. 366 hari (dijaga di UI `period.ts` DAN database). Tanggal = hari kalender WIB; "hari ini" dihitung WIB, bukan zona waktu browser.
- Frontend selalu memanggil `sales_recap_range`, `sales_export_range`, `finance_summary_range`; fungsi bulanan lama tetap ada sebagai pembungkus (tes memastikan hasilnya identik dengan rentang 1–akhir bulan, termasuk Februari/Maret).
- Ekspor Excel: judul memuat label periode; nama berkas `rekap-penjualan_2026-11-01_sd_2026-11-07_<cabang>.xlsx` (1 hari: `..._2026-11-07_...`; bulanan: `..._2026-11_...`). Sheet "Per Hari" di Keuangan = laporan harian.
- Periode tidak sah (tanggal terbalik/kosong/>366 hari): pesan galat tampil, permintaan tidak dikirim, angka periode lama disembunyikan.
- Tes: `test:period` (pembantu), bagian RENTANG di `test:e2e` & `test:finance` (jumlah per hari = total rentang, batas 28 Feb/1 Mar, pembungkus = rentang, hak & cabang, audit).

## Sidebar "Produk Terlaris" & chip stok ringkas (migrasi 016)
- **Produk Terlaris** mengisi ruang kosong sidebar (antara menu dan kartu pengguna). Periode: **Harian** (rentang tanggal Dari–Sampai, bawaan hari ini WIB), **Bulanan** (bulan+tahun), **Tahunan**; pilihan mode diingat per komputer (`pos.topMode`). Jumlah terjual (transaksi selesai, void tidak dihitung), 10 teratas, seri qty dipecah jumlah nota. RPC `top_products` (hak `pos` atau `sales_recap`; kasir hanya cabangnya; peran lintas cabang mengikuti "Cabang aktif"). Hanya jumlah, tanpa harga/modal. Dimuat ulang otomatis setelah transaksi.
- **Responsif terhadap zoom/tinggi layar**: `useElementHeight` (ResizeObserver) mengukur ruang yang tersedia dalam rem: ≥14rem = tab + pemilih periode + daftar; 7–14rem = tab + daftar; <7rem = disembunyikan. Sidebar `w-52` (<1280px) / `w-64`; panel keranjang POS `clamp(19rem,30vw,26rem)`; kolom harga/kode tidak boleh patah baris.
- **Chip stok per cabang** (POS & detail produk): satu sel ringkas per cabang memakai **singkatan** (`branches.short_name`: TKSAP=Antonius, TKSP=Paulus, Kranggan, Katedral, TKSM=Santa Maria, TKSAA=Athanasius, PUSAT) + jumlah, urutan tetap, cabang aktif disorot, "Total" di akhir, membungkus mengikuti lebar. Cabang baru tanpa singkatan memakai nama lengkap; isi dengan `update branches set short_name='XYZ' where code='...'` (maks. 12 huruf).
- Tes: `test:top` (SQL), `test:period` (yearRange), dan `tests/ui-smoke.mjs` (16 pemeriksaan di Chromium: parameter tiap mode, validasi rentang, zoom 75/100/125%, layar pendek, urutan chip, lintas cabang).

## Sidebar: kartu Produk Terlaris yang bisa ditarik + burger menu
- Menu bernama **Informasi Produk** (sebelumnya "Produk & Harga"; judul halaman ikut).
- **Tarik pegangan** (pil kecil di atas kartu): ke ATAS = kartu lebih tinggi (daftar produk lebih panjang) dan menu berkurang; ke BAWAH = kartu lebih rendah. Batas bawah 7,5rem (di bawah itu kartu hilang), batas atas = menyisakan **2 menu**. Papan ketik: fokus pegangan lalu ↑/↓ (±1rem), Home/Enter atau **klik ganda** = otomatis (mengisi sisa ruang). Tinggi disimpan per komputer dalam rem (`pos.topHeightRem`) sehingga ikut zoom.
- **Menu yang tak muat disembunyikan (bukan digulir)**; tombol **burger** di header sidebar membuka daftar SEMUA menu (terlihat + tersembunyi), lencana = jumlah yang tersembunyi; Escape/klik di luar/memilih menu menutupnya. Layar pendek tanpa ruang kartu: kartu & pegangan hilang, menu mengisi ruang (≥2 terlihat).
- Hitungan: `computeSidebarLayout` (murni, `tests/sidebar-layout.mjs`: 18 skenario) memakai tinggi border-box sidebar/logo/kartu pengguna (`useElementHeight('border')`); konstanta dalam rem (tombol menu 2,75rem, padding nav 1,5rem, pegangan 0,75rem). Pembungkus kartu `box-border pb-2`, jadi minimum pembungkus = 7rem isi + 0,5rem.
- Tes browser (`tests/ui-smoke.mjs`, 31 pemeriksaan): tarik naik/turun, tepat 2 menu, lencana, burger (semua menu, Escape, pindah halaman), simpan setelah muat ulang, klik ganda, papan ketik, layar pendek.
