// Uji tampilan cetak: struk 80mm & nota A4 meniru nota lama, penggabungan konfigurasi aman. Jalankan: npm run test:print
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cache = path.join(ROOT, 'node_modules', '.cache'); fs.mkdirSync(cache, { recursive: true })
const out = path.join(cache, 'print-render-test.cjs') // di dalam proyek agar memakai React yang sama
const entry = path.join(os.tmpdir(), 'print-entry.tsx')
fs.writeFileSync(entry, `export * from '${ROOT}/src/features/print/views'; export * from '${ROOT}/src/features/print/templates'`)
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, external: ['react', 'react-dom', 'react/jsx-runtime'], jsx: 'automatic',
  nodePaths: [path.join(ROOT, 'node_modules')], define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://x.supabase.co"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"x"' }, logLevel: 'silent' })
const require = createRequire(path.join(ROOT, 'package.json'))
// Di Node < 22 tidak ada WebSocket global; supabase-js (diimpor templates.ts via lib/supabase)
// melempar galat saat createClient. Sediakan polyfill dari paket `ws` agar uji bisa jalan.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws') } catch { /* abaikan, akan gagal dengan pesan jelas */ }
}
const { renderToStaticMarkup } = require('react-dom/server'), React = require('react')
const M = require(out)
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const h = (el) => renderToStaticMarkup(el)

// data = nota lama (foto 1): 1 barang Rp 46.000, bayar 46.000, kembali 0
const legacy = { invoiceNo: '210726110001', at: new Date('2026-11-07T15:37:42'), cashier: 'Stephanus Edward Saputro', branch: 'Takom Antonius', customer: 'TAMAN KOMUNIKASI KANISIUS',
  lines: [{ code: '1326CT0128', name: 'KalungTitaniumLiontinSal', price: 46000, qty: 1, disc: 0 }], subtotal: 46000, discount: 0, total: 46000, method: 'cash', paid: 46000, change: 0 }
let html = h(React.createElement(M.InvoiceView, { cfg: M.DEFAULT_INVOICE, data: legacy }))
t('A4: judul, perusahaan, Nomor/Tanggal/Kepada', ['NOTA PENJUALAN', 'PT KANISIUS TAMAN KOMUNIKASI', 'Nomor', '210726110001', 'Tanggal', 'Kepada', 'TAMAN KOMUNIKASI KANISIUS'].every((x) => html.includes(x)))
t('A4: kolom Kode/Barang/Harga/Qty/Disc./PPn/Sub Total', ['Kode', 'Barang', 'Harga', 'Qty', 'Disc.', 'PPn', 'Sub Total'].every((x) => html.includes(`>${x}<`)))
t('A4: harga tanpa PPn 41.441, PPn 12, sub total 46.000 (sama dengan nota lama)', html.includes('>41.441<') && html.includes('>12<') && html.includes('>46.000<'), html.slice(0, 0))
t('A4: baris keterangan kasir / waktu', html.includes('Stephanus Edward Saputro / Divisi Penjualan TAKOM / 2026-11-07 15:37:42'))
t('A4: Total / Pembayaran / Kembalian + kaki nota', ['Total', 'Pembayaran', 'Kembalian', 'Terima Kasih Atas Kunjungan Anda', 'tidak dapat dikembalikan'].every((x) => html.includes(x)))
html = h(React.createElement(M.InvoiceView, { cfg: { ...M.DEFAULT_INVOICE, showPpn: false }, data: legacy }))
t('A4: kolom PPn bisa dimatikan (harga tampil apa adanya)', !html.includes('>PPn<') && html.includes('>46.000<'))

const rc = { ...legacy, invoiceNo: '210726100306', at: new Date('2026-10-30T08:15:00'), cashier: '2341', customer: '', lines: [{ code: '1116TK0007', name: 'LD Ros Bsr', price: 4000, qty: 1, disc: 0 }], subtotal: 4000, total: 4000, paid: 5000, change: 1000 }
html = h(React.createElement(M.ReceiptView, { cfg: M.DEFAULT_RECEIPT, data: rc }))
t('Struk: kepala (perusahaan, email, web, toko cabang, alamat, WA)', ['PT KANISIUS TAMAN KOMUNIKASI', 'office@takomkanisius.id', 'www.takomkanisius.id', 'Toko Rohani - TAKOM ANTONIUS', 'WA : 082337641713'].every((x) => html.includes(x)))
t('Struk: No./Tgl./Kasir/Cust., kode+nama barang, 0%, total 4.000, bayar 5.000, kembali 1.000, CASH', ['No.', 'Tgl.', 'Kasir', '2341', 'Cust.', 'UMUM', '1116TK0007', 'LD Ros Bsr', '0%', '4.000', '5.000', '1.000', 'CASH'].every((x) => html.includes(x)))
t('Struk: kaki "Terima Kasih…" & "tidak dapat ditukar/dikembalikan"', html.includes('Terima Kasih Atas Kunjungan Anda') && html.includes('tidak dapat ditukar/dikembalikan'))
html = h(React.createElement(M.ReceiptView, { cfg: { ...M.DEFAULT_RECEIPT, showCashier: false, labels: { ...M.DEFAULT_RECEIPT.labels, cust: 'Pelanggan' } }, data: { ...rc, method: 'qris', customer: 'M-001' } }))
t('Struk: opsi sembunyi kasir, label diganti, metode QRIS, member tampil', !html.includes('2341') && html.includes('Pelanggan') && html.includes('QRIS') && html.includes('M-001'))
html = h(React.createElement(M.ReceiptView, { cfg: { ...M.DEFAULT_RECEIPT, footerLines: ['<script>alert(1)</script>'] }, data: rc }))
t('KEAMANAN: teks edit admin di-escape (tidak jadi HTML/skrip)', !html.includes('<script>') && html.includes('&lt;script&gt;'))

t('merge: isi tersimpan sebagian diambil, sisanya bawaan', M.merge(M.DEFAULT_INVOICE, { title: 'X' }).title === 'X' && M.merge(M.DEFAULT_INVOICE, { title: 'X' }).cols.code === 'Kode')
const junk = M.merge(M.DEFAULT_RECEIPT, { widthMm: 'lebar', fontPx: null, headerLines: [1, 2], labels: 'x', evil: { a: 1 }, methodLabels: { cash: 5 } })
t('merge: tipe salah/kunci asing diabaikan (kembali ke bawaan)', junk.widthMm === 72 && junk.fontPx === 12 && junk.headerLines.length === 7 && junk.labels.no === 'No.' && junk.evil === undefined && junk.methodLabels.cash === 'CASH')
t('merge: tanpa data tersimpan = bawaan persis', JSON.stringify(M.merge(M.DEFAULT_RECEIPT, undefined)) === JSON.stringify(M.DEFAULT_RECEIPT))
t('fill: token dikenal diganti, token asing dibiarkan', M.fill('{kasir} {zzz}', { kasir: 'A' }) === 'A {zzz}')
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
