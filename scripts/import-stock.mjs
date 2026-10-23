// Impor stok awal SATU cabang dari file Excel/CSV hasil hitung fisik (stok opname) cabang itu.
//   Uji coba:  npm run import:stock -- stok_cabang1.xlsx --branch=CAB1 --dry-run
//   Impor:     npm run import:stock -- stok_cabang1.xlsx --branch=CAB1
// File: sheet pertama, baris 1 = judul kolom "kode" dan "jumlah" (nama lain yang diterima: kode produk, produk id, stok, qty).
// Aman: hanya mengisi stok yang BELUM ada untuk cabang itu (tidak menimpa). Koreksi lewat halaman Stok → "Aktual".
import fs from 'node:fs'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const DRY = args.includes('--dry-run')
const BRANCH = args.find((a) => a.startsWith('--branch='))?.split('=')[1]
if (!file || !BRANCH) { console.error('Pemakaian: npm run import:stock -- <file> --branch=KODE_CABANG [--dry-run]'); process.exit(1) }

const wb = new ExcelJS.Workbook()
if (file.toLowerCase().endsWith('.csv')) await wb.csv.readFile(file); else await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]
const norm = (v) => String(v ?? '').trim().toLowerCase()
const head = []; ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = norm(c.value) })
const iCode = head.findIndex((h) => ['kode', 'kode produk', 'produk id'].includes(h))
const iQty = head.findIndex((h) => ['jumlah', 'stok', 'qty'].includes(h))
if (iCode < 1 || iQty < 1) { console.error('Judul kolom tidak ditemukan. Baris 1 harus berisi "kode" dan "jumlah".'); process.exit(1) }

const val = (v) => (v && typeof v === 'object' ? ('result' in v ? v.result : 'text' in v ? v.text : v.richText?.map((r) => r.text).join('')) : v)
const rows = new Map(), bad = []
for (let r = 2; r <= ws.rowCount; r++) {
  const code = String(val(ws.getRow(r).getCell(iCode).value) ?? '').trim()
  const rawQ = val(ws.getRow(r).getCell(iQty).value)
  if (!code && (rawQ == null || rawQ === '')) continue
  const q = typeof rawQ === 'number' ? rawQ : /^\d+$/.test(String(rawQ ?? '').trim()) ? Number(rawQ) : NaN
  if (!code) bad.push([r, '', rawQ, 'Kode kosong'])
  else if (!Number.isInteger(q) || q < 0) bad.push([r, code, rawQ, 'Jumlah harus angka bulat 0 atau lebih'])
  else if (rows.has(code)) bad.push([r, code, rawQ, 'Kode muncul dua kali (baris ini dilewati)'])
  else rows.set(code, q)
}
fs.mkdirSync('import-report', { recursive: true })
fs.writeFileSync('import-report/stok_bermasalah.csv', 'baris,kode,nilai,masalah\n' + bad.map((b) => b.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'))
const positive = [...rows].filter(([, q]) => q > 0)
console.log(`Baris valid: ${rows.size} (berstok > 0: ${positive.length}, total ${positive.reduce((a, [, q]) => a + q, 0)} pcs) · bermasalah: ${bad.length} -> import-report/stok_bermasalah.csv`)
if (DRY) { console.log('Mode uji coba: tidak ada data dikirim.'); process.exit(0) }

const env = Object.fromEntries(fs.readFileSync('.env.import', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: br } = await sb.from('branches').select('id').eq('code', BRANCH).maybeSingle()
if (!br) { console.error(`Cabang "${BRANCH}" tidak ada di tabel branches. Tambahkan dulu.`); process.exit(1) }

const codes = positive.map(([c]) => c), unknown = []
let inserted = 0
for (let i = 0; i < codes.length; i += 200) {
  const chunk = codes.slice(i, i + 200)
  const { data: ps, error } = await sb.from('products').select('id,code').in('code', chunk)
  if (error) { console.error('Gagal membaca produk:', error.message); process.exit(1) }
  const found = new Set(ps.map((p) => p.code)); chunk.filter((c) => !found.has(c)).forEach((c) => unknown.push(c))
  const { data: ins, error: e2 } = await sb.from('stock').upsert(ps.map((p) => ({ branch_id: br.id, product_id: p.id, qty: rows.get(p.code) })), { onConflict: 'branch_id,product_id', ignoreDuplicates: true }).select('product_id,qty')
  if (e2) { console.error('Gagal menyimpan stok:', e2.message); process.exit(1) }
  if (ins?.length) {
    const { error: e3 } = await sb.from('stock_movements').insert(ins.map((x) => ({ branch_id: br.id, product_id: x.product_id, qty_change: x.qty, reason: 'initial', note: 'Impor stok awal (hitung fisik)' })))
    if (e3) { console.error('Gagal mencatat riwayat:', e3.message); process.exit(1) }
  }
  inserted += ins?.length ?? 0
}
fs.writeFileSync('import-report/stok_kode_tidak_dikenal.csv', 'kode\n' + unknown.join('\n'))
console.log(`Selesai: ${inserted} produk diisi, ${codes.length - inserted - unknown.length} dilewati (stok sudah ada), ${unknown.length} kode tidak dikenal -> import-report/stok_kode_tidak_dikenal.csv`)
