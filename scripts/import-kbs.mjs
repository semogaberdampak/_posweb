// Impor data member toko KBS (kolom Cust ID + nama) ke tabel kbs_members.
//   Uji coba (tidak menulis apa pun):  npm run import:kbs -- file.csv --dry-run
//   Impor sungguhan:                   npm run import:kbs -- file.csv
// Kunci rahasia dibaca dari .env.import (JANGAN di-commit, JANGAN diberi awalan VITE_).
// Kode yang sudah ada akan diperbarui namanya (upsert), bukan diduplikasi.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const DRY = args.includes('--dry-run')
if (!file) { console.error('Pemakaian: npm run import:kbs -- <file.csv> [--dry-run]'); process.exit(1) }
if (!fs.existsSync(file)) { console.error(`Berkas tidak ditemukan: ${file}`); process.exit(1) }

// ---------- baca berkas: deteksi UTF-8 vs Windows-1252 (file pemilik ISO-8859) ----------
const buf = fs.readFileSync(file)
let text
try {
  text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
} catch {
  text = new TextDecoder('windows-1252').decode(buf)
}
text = text.replace(/^\uFEFF/, '')

// ---------- pemisah kolom: koma / titik koma / tab ----------
function detectDelimiter(s) {
  const line = s.slice(0, s.search(/\r?\n/) < 0 ? s.length : s.search(/\r?\n/))
  const counts = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of line) if (ch in counts) counts[ch]++
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}
const DELIM = detectDelimiter(text)

// Parser CSV sederhana: kutip ganda ("" = satu kutip), pemisah di dalam kutip aman, CRLF/LF.
function parseCsv(s, delim) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}
const raw = parseCsv(text, DELIM)
if (!raw.length) { console.error('Berkas kosong.'); process.exit(1) }

// ---------- temukan kolom kode & nama dari judul ----------
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const header = raw[0].map(norm)
const codeIdx = header.findIndex((h) => ['cust id', 'custid', 'kode', 'code', 'id'].includes(h))
const nameIdx = header.findIndex((h) => ['nama', 'name', 'nama toko'].includes(h))
const hasHeader = codeIdx >= 0 && nameIdx >= 0
const CODE_I = hasHeader ? codeIdx : 0
const NAME_I = hasHeader ? nameIdx : 1

// ---------- validasi (sama dengan aturan RPC import_kbs_members) ----------
const CODE_RE = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/
const rows = new Map()
const review = []
let empty = 0, dup = 0
for (let i = hasHeader ? 1 : 0; i < raw.length; i++) {
  const r = raw[i]
  if (!r || r.every((x) => String(x).trim() === '')) continue
  const code = String(r[CODE_I] ?? '').trim().toUpperCase()
  const name = String(r[NAME_I] ?? '').trim().replace(/\s+/g, ' ')
  if (!code && !name) { empty++; continue }
  // judul kolom yang terulang di tengah berkas = bukan data
  if (['CUST ID', 'CUSTID', 'KODE', 'CODE'].includes(code) && ['NAMA', 'NAME', 'NAMA TOKO'].includes(name.toUpperCase())) continue
  if (!CODE_RE.test(code)) { review.push({ kode: code, nama: name, masalah: 'Kode tidak valid (hanya A–Z, 0–9, . _ / -, maks. 40)' }); continue }
  if (!name) { review.push({ kode: code, nama: '', masalah: 'Nama kosong' }); continue }
  if (name.length > 120) { review.push({ kode: code, nama: name.slice(0, 60) + '…', masalah: 'Nama lebih dari 120 karakter' }); continue }
  if (rows.has(code)) dup++
  rows.set(code, { code, name, is_active: true, updated_at: new Date().toISOString() })
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`
fs.mkdirSync('import-report', { recursive: true })
fs.writeFileSync('import-report/kbs_perlu_dicek.csv',
  'kode,nama,masalah\n' + review.map((x) => [x.kode, x.nama, x.masalah].map(q).join(',')).join('\n'))

const list = [...rows.values()]
console.log(`Berkas               : ${file}`)
console.log(`Pemisah kolom        : ${DELIM === '\t' ? 'TAB' : DELIM === ';' ? 'titik koma' : 'koma'}`)
console.log(`Kolom dipakai        : ${hasHeader ? `"${raw[0][CODE_I]}" + "${raw[0][NAME_I]}"` : 'kolom 1 + 2 (tanpa judul)'}`)
console.log(`Baris terbaca        : ${raw.length - (hasHeader ? 1 : 0)}`)
console.log(`Data siap diimpor    : ${list.length} toko (kode kembar: ${dup}, dilewati)}`)
console.log(`Baris bermasalah     : ${review.length}${review.length ? ' -> import-report/kbs_perlu_dicek.csv' : ''}`)
console.log(`Contoh               : ${list.slice(0, 3).map((x) => `${x.code} - ${x.name}`).join(' | ') || '-'}`)
if (DRY) {
  console.log('Mode uji coba: tidak ada data dikirim.')
  process.exit(0)
}

// ---------- kirim ke Supabase (butuh .env.import) ----------
const env = Object.fromEntries(fs.readFileSync('.env.import', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('.env.import belum lengkap (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).'); process.exit(1) }
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const BATCH = 500
for (let i = 0; i < list.length; i += BATCH) {
  const part = list.slice(i, i + BATCH)
  const { error } = await sb.from('kbs_members').upsert(part, { onConflict: 'code' })
  if (error) { console.error(`\nGagal di batch mulai baris ${i + 1}:`, error.message); process.exit(1) }
  process.stdout.write(`\rTerkirim ${Math.min(i + BATCH, list.length)} / ${list.length}`)
}
console.log('')

const { count, error: ce } = await sb.from('kbs_members').select('*', { count: 'exact', head: true })
if (ce) console.log(`Data terkirim, tetapi gagal menghitung isi tabel: ${ce.message}`)
else console.log(`Selesai. Total data member toko di database: ${count}`)
