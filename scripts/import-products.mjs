// Impor produk dari Excel ke Supabase.
//   Uji coba (tidak menulis apa pun):  npm run import:products -- file.xlsx --dry-run
//   Impor sungguhan:                   npm run import:products -- file.xlsx
//   Timpa data produk yang sudah ada:  tambahkan --update  (default: produk yang sudah ada DILEWATI)
//   Stok awal dari kolom stokOnHand:   tambahkan --stock-branch=KODE_CABANG  (mis. --stock-branch=PUSAT)
//                                      Hanya mengisi stok yang BELUM ada; stok yang sudah ada tidak diubah.
// Kunci rahasia dibaca dari .env.import (JANGAN di-commit, JANGAN diberi awalan VITE_).
import fs from 'node:fs'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const DRY = args.includes('--dry-run')
const UPDATE = args.includes('--update')
const STOCK_BRANCH = args.find((a) => a.startsWith('--stock-branch='))?.split('=')[1]
if (!file) { console.error('Pemakaian: npm run import:products -- <file.xlsx> [--dry-run] [--update]'); process.exit(1) }

// Kolom yang disimpan khusus (huruf kolom Excel). Sisanya masuk ke "attributes" sebagai card.
const COL = { code: 1, name: 2, price: 15, author: 37 } // A, B, O, AK
const MAX_PRICE_WARN = 10_000_000
// Harga beli: disimpan di tabel rahasia product_costs, BUKAN di products.attributes
const COST_KEYS = new Set(['Price1', 'OldPrice1', 'lastCost'])
// Kolom stok Excel tidak disimpan sebagai card: stok hidup di tabel stock (per cabang). Konsinyasi tidak dipakai.
const STOCK_KEYS = new Set(['stokOnHand', 'stokGudLain', 'stokKonsinyasi'])

function cell(v) {
  if (v == null) return null
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0')
    const d = `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`
    const t = `${p(v.getUTCHours())}:${p(v.getUTCMinutes())}`
    return t === '00:00' ? d : `${d} ${t}`
  }
  if (typeof v === 'object') {
    if ('result' in v) return cell(v.result)
    if ('richText' in v) return v.richText.map((r) => r.text).join('')
    if ('text' in v) return String(v.text)
    return null
  }
  if (typeof v === 'string') { const s = v.trim(); return s === '' ? null : s }
  return v
}
const str = (v) => (v == null ? null : String(v).trim() || null)

function parsePrice(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v === Math.round(v) ? v : null
  if (typeof v === 'string') { const s = v.replace(/^rp\.?\s*/i, '').trim(); return /^\d+$/.test(s) ? Number(s) : null }
  return null
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]
const headers = []
ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i] = str(cell(c.value)) ?? `kolom_${i}` })
const skip = new Set(Object.values(COL))

const rows = [], review = [], seen = new Set(), costsByCode = new Map(), stockByCode = new Map()
let dup = 0
for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const code = str(cell(row.getCell(COL.code).value))
  if (!code) continue
  if (seen.has(code)) { dup++; review.push({ kode: code, nama: '', masalah: 'Kode kembar (baris dilewati)', nilai_asli: '' }); continue }
  seen.add(code)

  const issues = []
  let name = str(cell(row.getCell(COL.name).value))
  if (!name) { name = str(cell(row.getCell(6).value)) ?? '(tanpa nama)'; issues.push('Nama kosong (dipakai nama panjang/placeholder)') }
  const rawPrice = cell(row.getCell(COL.price).value)
  let price = parsePrice(rawPrice)
  let active = str(cell(row.getCell(headers.indexOf('Status')).value))?.toUpperCase() !== 'N'
  if (price == null) { issues.push('Harga tidak valid, diimpor NONAKTIF'); price = 0; active = false }
  else if (price <= 0) { issues.push('Harga 0, diimpor NONAKTIF sampai harga diisi'); active = false }
  else if (price > MAX_PRICE_WARN) issues.push('Harga sangat besar, mohon dicek')
  if (name === '(tanpa nama)') active = false

  const attributes = [], costs = []
  for (let i = 1; i < headers.length; i++) {
    if (skip.has(i)) continue
    const v = cell(row.getCell(i).value)
    if (v == null || STOCK_KEYS.has(headers[i])) continue
    ;(COST_KEYS.has(headers[i]) ? costs : attributes).push({ k: headers[i], v })
  }
  if (costs.length) costsByCode.set(code, costs)
  const oh = cell(row.getCell(headers.indexOf('stokOnHand')).value)
  if (oh != null) {
    if (typeof oh === 'number' && Number.isInteger(oh) && oh >= 0) { if (oh > 0) stockByCode.set(code, oh) }
    else issues.push('Stok awal (stokOnHand) tidak valid, dilewati')
  }
  for (const m of issues) review.push({ kode: code, nama: name, masalah: m, nilai_asli: rawPrice == null ? '' : String(rawPrice) })
  rows.push({ code, name: name.slice(0, 200), price, author: str(cell(row.getCell(COL.author).value))?.slice(0, 200) ?? null, is_active: active, attributes })
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`
fs.mkdirSync('import-report', { recursive: true })
fs.writeFileSync('import-report/products_perlu_dicek.csv',
  'kode,nama,masalah,nilai_asli\n' + review.map((x) => [x.kode, x.nama, x.masalah, x.nilai_asli].map(q).join(',')).join('\n'))

console.log(`Baris produk terbaca : ${rows.length}  (kode kembar dilewati: ${dup})`)
console.log(`Aktif / nonaktif     : ${rows.filter((x) => x.is_active).length} / ${rows.filter((x) => !x.is_active).length}`)
console.log(`Stok awal (stokOnHand): ${stockByCode.size} produk berstok, total ${[...stockByCode.values()].reduce((a, b) => a + b, 0)} pcs${STOCK_BRANCH ? ` -> cabang ${STOCK_BRANCH}` : ' (tidak diimpor: tambahkan --stock-branch=KODE)'}`)
console.log(`Perlu dicek          : ${review.length} catatan -> import-report/products_perlu_dicek.csv`)
if (DRY) {
  fs.writeFileSync('import-report/contoh_2_baris.json', JSON.stringify(rows.slice(0, 2), null, 1))
  console.log('Mode uji coba: tidak ada data dikirim. Contoh hasil: import-report/contoh_2_baris.json')
  process.exit(0)
}

// ---- kirim ke Supabase (butuh .env.import) ----
const env = Object.fromEntries(fs.readFileSync('.env.import', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('.env.import belum lengkap (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).'); process.exit(1) }
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const BATCH = 500
for (let i = 0; i < rows.length; i += BATCH) {
  const part = rows.slice(i, i + BATCH)
  const { data, error } = await sb.from('products').upsert(part, { onConflict: 'code', ignoreDuplicates: !UPDATE }).select('id,code')
  if (error) { console.error(`Gagal di batch mulai baris ${i + 1}:`, error.message); process.exit(1) }
  const costRows = (data ?? []).filter((x) => costsByCode.has(x.code)).map((x) => ({ product_id: x.id, attributes: costsByCode.get(x.code) }))
  if (costRows.length) {
    const { error: e2 } = await sb.from('product_costs').upsert(costRows, { onConflict: 'product_id', ignoreDuplicates: !UPDATE })
    if (e2) { console.error(`Gagal menyimpan harga beli (batch ${i + 1}):`, e2.message); process.exit(1) }
  }
  process.stdout.write(`\rTerkirim ${Math.min(i + BATCH, rows.length)} / ${rows.length}`)
}
console.log('')

if (STOCK_BRANCH) {
  const { data: br, error: be } = await sb.from('branches').select('id').eq('code', STOCK_BRANCH).maybeSingle()
  if (be || !br) { console.error(`Cabang dengan kode "${STOCK_BRANCH}" tidak ditemukan di tabel branches.`); process.exit(1) }
  const codes = [...stockByCode.keys()]
  let inserted = 0
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200)
    const { data: ps, error: pe } = await sb.from('products').select('id,code').in('code', chunk)
    if (pe) { console.error('Gagal membaca produk untuk stok:', pe.message); process.exit(1) }
    const rowsStock = ps.map((x) => ({ branch_id: br.id, product_id: x.id, qty: stockByCode.get(x.code) }))
    const { data: ins, error: se } = await sb.from('stock').upsert(rowsStock, { onConflict: 'branch_id,product_id', ignoreDuplicates: true }).select('product_id,qty')
    if (se) { console.error('Gagal menyimpan stok:', se.message); process.exit(1) }
    if (ins?.length) {
      const { error: me } = await sb.from('stock_movements').insert(ins.map((x) => ({ branch_id: br.id, product_id: x.product_id, qty_change: x.qty, reason: 'initial', note: 'Impor stok awal dari Excel' })))
      if (me) { console.error('Gagal mencatat riwayat stok:', me.message); process.exit(1) }
    }
    inserted += ins?.length ?? 0
    process.stdout.write(`\rStok awal tersimpan ${inserted} / ${codes.length}`)
  }
  console.log(`\nStok awal: ${inserted} produk baru diisi, ${codes.length - inserted} dilewati (stok sudah ada).`)
}
console.log('Selesai.')
