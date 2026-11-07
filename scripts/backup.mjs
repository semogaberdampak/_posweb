// Backup mandiri seluruh data POS dari Supabase ke komputer ini.
//   npm run backup                      -> folder backups/pos-TAHUNBULANTANGGAL-JAMMENITDETIK
//   npm run backup -- --out=E:\Backup --keep=30
//   npm run backup:verify -- backups\pos-20261107-220000     (periksa keutuhan backup)
// Memakai .env.import (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — kunci rahasia, jangan dibagikan.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { runBackup, verifyBackup, DIR_RE } from './lib/backup-core.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const verifyIdx = args.indexOf('--verify')

if (verifyIdx >= 0) {
  const dir = args.find((a, i) => i !== verifyIdx && !a.startsWith('--')) ?? latest(opt('out', 'backups'))
  if (!dir) { console.error('Tidak ada backup untuk diperiksa.'); process.exit(1) }
  const r = await verifyBackup(dir)
  if (r.ok) { console.log(`BACKUP UTUH: ${dir} (dibuat ${r.manifest.created_at}, ${Object.values(r.manifest.files).reduce((a, f) => a + f.rows, 0)} baris)`); process.exit(0) }
  console.error(`BACKUP BERMASALAH: ${dir}`); r.problems.forEach((p) => console.error(' - ' + p)); process.exit(1)
}

function latest(out) {
  if (!fs.existsSync(out)) return null
  const d = fs.readdirSync(out).filter((x) => DIR_RE.test(x) && fs.existsSync(path.join(out, x, 'manifest.json'))).sort().pop()
  return d ? path.join(out, d) : null
}
function loadEnv() {
  const env = { ...process.env }
  try {
    for (const l of fs.readFileSync('.env.import', 'utf8').split(/\r?\n/)) {
      if (!l.includes('=') || l.trim().startsWith('#')) continue
      const i = l.indexOf('='); env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* pakai variabel lingkungan */ }
  return env
}

const outDir = opt('out', 'backups'), keep = Number(opt('keep', '14'))
const logFile = path.join(outDir, 'backup.log')
const note = (s) => { try { fs.mkdirSync(outDir, { recursive: true }); fs.appendFileSync(logFile, `${new Date().toISOString()} ${s}\n`) } catch { /* abaikan */ } }
const env = loadEnv()
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.import'); note('GAGAL: .env.import belum lengkap'); process.exit(1) }

console.log(`Backup ke ${path.resolve(outDir)} (simpan ${keep} terbaru)`)
const t0 = Date.now()
try {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const r = await runBackup({ client, outDir, keep })
  const v = await verifyBackup(r.dir)
  if (!v.ok) throw new Error('Pemeriksaan setelah backup gagal: ' + v.problems.join('; '))
  const total = Object.values(r.files).reduce((a, f) => a + f.rows, 0)
  const msg = `OK ${path.basename(r.dir)} ${total} baris, ${((Date.now() - t0) / 1000).toFixed(1)} dtk${r.pruned.length ? `, hapus ${r.pruned.length} backup lama` : ''}`
  console.log('\n' + msg + '\nSalin folder backup ke tempat lain (flashdisk / cloud pribadi) agar aman bila komputer rusak.'); note(msg)
} catch (e) {
  console.error('\nBACKUP GAGAL: ' + (e instanceof Error ? e.message : e)); note('GAGAL: ' + (e instanceof Error ? e.message : e)); process.exit(1)
}
