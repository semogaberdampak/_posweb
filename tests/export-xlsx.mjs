// Uji berkas Excel hasil ekspor rekap: isi, tipe angka/teks, total, zona waktu WIB, keamanan rumus. Jalankan: npm run test:xlsx
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cache = path.join(ROOT, 'node_modules', '.cache'); fs.mkdirSync(cache, { recursive: true })
const out = path.join(cache, 'export-xlsx-test.cjs')
await build({ entryPoints: [path.join(ROOT, 'src/features/sales/exportXlsx.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, external: ['exceljs'], logLevel: 'silent' })
const require = createRequire(path.join(ROOT, 'package.json'))
const X = require(out), ExcelJS = require('exceljs')
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }

const mk = (i, over = {}) => ({ id: `s${i}`, invoice_no: `INV-${i}`, created_at: '2026-10-31T16:59:59Z', branch_name: 'Takom Kranggan', cashier_name: 'Kasir A', payment_method: 'cash', subtotal: 10000, discount_amount: 0, total: 10000, cash_received: 20000, change_amount: 10000, member_label: null, status: 'completed', void_reason: null, ...over })
const sales = [
  mk(1), // 31 Okt 16:59:59 UTC = 31 Okt 23:59:59 WIB
  mk(2, { created_at: '2026-10-31T17:00:00Z', branch_name: 'Takom Paulus', payment_method: 'qris', subtotal: 50000, discount_amount: 5000, total: 45000, cash_received: null, change_amount: null, member_label: '=HYPERLINK("http://x","klik")' }), // = 1 Nov 00:00 WIB
  mk(3, { created_at: '2026-11-02T03:00:00Z', payment_method: 'debit', total: 30000, subtotal: 30000, status: 'void', void_reason: 'salah input' }),
]
const items = [
  { sale_id: 's1', created_at: sales[0].created_at, invoice_no: 'INV-1', code: '0012', name: 'Buku A', unit_price: 10000, qty: 1, discount_pct: 0, discount_amount: 0, line_total: 10000 },
  { sale_id: 's2', created_at: sales[1].created_at, invoice_no: 'INV-2', code: '1000011013', name: 'Buku "B", edisi 2', unit_price: 25000, qty: 2, discount_pct: 10, discount_amount: 5000, line_total: 45000 },
  { sale_id: 's3', created_at: sales[2].created_at, invoice_no: 'INV-3', code: '1115AX0126', name: 'Rosario', unit_price: 30000, qty: 1, discount_pct: 0, discount_amount: 0, line_total: 30000 },
]
const buf = await X.buildRecapWorkbook({ sales, items }, { year: 2026, month: 10, branchLabel: 'Semua cabang', generatedBy: 'Admin' })
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf)
t('3 sheet: Ringkasan, Transaksi, Rincian Barang', JSON.stringify(wb.worksheets.map((w) => w.name)) === JSON.stringify(['Ringkasan', 'Transaksi', 'Rincian Barang']))
const tx = wb.getWorksheet('Transaksi'), it = wb.getWorksheet('Rincian Barang'), sm = wb.getWorksheet('Ringkasan')
t('Transaksi: judul + 3 baris; Rincian: judul + 3 baris', tx.rowCount === 4 && it.rowCount === 4)
t('angka tersimpan sebagai ANGKA (bisa dijumlah di Excel)', typeof tx.getRow(3).getCell(11).value === 'number' && tx.getRow(3).getCell(11).value === 45000 && typeof it.getRow(3).getCell(7).value === 'number')
t('kode barang tetap TEKS (0012 tidak jadi 12)', it.getRow(2).getCell(5).value === '0012' && it.getRow(4).getCell(5).value === '1115AX0126')
t('tanggal & jam menurut WIB (23:59:59 tgl 31 Okt vs 00:00:00 tgl 1 Nov)', tx.getRow(2).getCell(2).value === '2026-10-31' && tx.getRow(2).getCell(3).value === '23:59:59' && tx.getRow(3).getCell(2).value === '2026-11-01' && tx.getRow(3).getCell(3).value === '00:00:00')
const m = tx.getRow(3).getCell(7).value
t('KEAMANAN: teks berawalan "=" tersimpan sebagai teks, bukan rumus', typeof m === 'string' && m.startsWith('=HYPERLINK') && !(tx.getRow(3).getCell(7).formula))
t('nama dengan tanda kutip & koma utuh', it.getRow(3).getCell(6).value === 'Buku "B", edisi 2')
t('status Void + alasan tampil di Transaksi', tx.getRow(4).getCell(8).value === 'Void' && tx.getRow(4).getCell(14).value === 'salah input')
const cells = []; sm.eachRow((r) => cells.push(r.values.slice(1)))
const row = (label) => cells.find((r) => r[0] === label)
t('Ringkasan: selesai 2 transaksi Rp 55.000, diskon 5.000, void 1 (30.000) — void tidak ikut total', row('Transaksi selesai')[1] === 2 && row('Transaksi selesai')[2] === 55000 && row('Total diskon')[2] === 5000 && row('Dibatalkan (void)')[1] === 1 && row('Dibatalkan (void)')[2] === 30000, JSON.stringify(cells.slice(0, 8)))
t('Ringkasan: per metode (Tunai 10.000, QRIS 45.000; debit void tidak muncul)', row('Tunai')[2] === 10000 && row('QRIS')[2] === 45000 && !row('Debit'))
t('Ringkasan: per cabang muncul karena ada >1 cabang', row('Takom Kranggan')?.[2] === 10000 && row('Takom Paulus')?.[2] === 45000)
t('Ringkasan: per hari memakai tanggal WIB (31 Okt 10.000, 1 Nov 45.000)', row('2026-10-31')?.[2] === 10000 && row('2026-11-01')?.[2] === 45000)
t('nama berkas aman & jelas', X.exportFileName(2026, 3, 'Takom Santa Maria') === 'rekap-penjualan_2026-03_takom-santa-maria.xlsx' && X.exportFileName(2026, 11, 'Semua cabang') === 'rekap-penjualan_2026-11_semua-cabang.xlsx')
const empty = await X.buildRecapWorkbook({ sales: [], items: [] }, { year: 2026, month: 5, branchLabel: 'X', generatedBy: 'A' })
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(empty)
t('bulan kosong tetap menghasilkan berkas valid', wb2.getWorksheet('Transaksi').rowCount === 1)
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
