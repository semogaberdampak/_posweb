// Inti backup (dipisah dari CLI agar bisa diuji). Membaca semua tabel lewat API Supabase (kunci service_role),
// menulis satu berkas .jsonl.gz per tabel + daftar akun (tanpa kata sandi) + manifest berisi jumlah baris & sidik jari SHA-256.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import readline from 'node:readline'

// tabel + kolom pengurut (urutan tetap supaya halaman tidak tumpang tindih)
export const TABLES = [
  ['branches', ['id']], ['roles', ['id']], ['features', ['key']], ['role_permissions', ['role_id', 'feature_key']],
  ['profiles', ['id']], ['user_permissions', ['user_id', 'feature_key']], ['products', ['id']], ['product_costs', ['product_id']],
  ['product_price_history', ['id']], ['stock', ['branch_id', 'product_id']], ['stock_movements', ['id']], ['members', ['id']],
  ['sales', ['id']], ['sale_items', ['id']], ['audit_log', ['id']], ['print_templates', ['kind']],
]
const PAGE = 1000
export const DIR_RE = /^pos-\d{8}-\d{6}$/
const pad = (n) => String(n).padStart(2, '0')
export const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

async function countRows(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: gagal menghitung (${error.message})`)
  return count ?? 0
}
async function* pages(client, table, order) {
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*')
    for (const c of order) q = q.order(c, { ascending: true })
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: gagal membaca (${error.message})`)
    if (!data?.length) return
    yield data
    if (data.length < PAGE) return
  }
}
async function* authPages(client) {
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE })
    if (error) throw new Error(`akun: gagal membaca (${error.message})`)
    const users = (data?.users ?? []).map((u) => ({ id: u.id, email: u.email, phone: u.phone ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null, banned_until: u.banned_until ?? null }))
    if (!users.length) return
    yield users
    if (users.length < PAGE) return
  }
}
async function writeJsonl(file, gen) {
  let n = 0
  async function* lines() { for await (const rows of gen) { n += rows.length; yield rows.map((r) => JSON.stringify(r)).join('\n') + '\n' } }
  await pipeline(Readable.from(lines()), zlib.createGzip({ level: 9 }), fs.createWriteStream(file))
  return n
}
export const sha256 = (file) => new Promise((res, rej) => {
  const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej)
})

export async function runBackup({ client, outDir, keep = 14, now = new Date(), withAuth = true, log = console.log }) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep minimal 1')
  fs.mkdirSync(outDir, { recursive: true })
  const name = `pos-${stamp(now)}`, tmp = path.join(outDir, `.partial-${name}`), final = path.join(outDir, name)
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp)
  try {
    const files = {}
    const jobs = TABLES.map(([t, order]) => ({ key: t, table: t, order })).concat(withAuth ? [{ key: 'auth_users', auth: true }] : [])
    for (const j of jobs) {
      const before = j.auth ? null : await countRows(client, j.table)
      const file = path.join(tmp, `${j.key}.jsonl.gz`)
      const rows = await writeJsonl(file, j.auth ? authPages(client) : pages(client, j.table, j.order))
      const after = j.auth ? null : await countRows(client, j.table)
      // data bertambah saat backup berjalan itu wajar; berkurang / terbaca kurang dari jumlah awal = ada yang terlewat
      if (!j.auth && rows < Math.min(before, after)) throw new Error(`${j.key}: terbaca ${rows} baris, di database ${before}→${after}. Ulangi backup.`)
      files[`${j.key}.jsonl.gz`] = { rows, sha256: await sha256(file) }
      log(`  ${j.key.padEnd(22)} ${String(rows).padStart(8)} baris`)
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ format: 1, created_at: now.toISOString(), files }, null, 2))
    fs.renameSync(tmp, final) // hanya backup yang LENGKAP yang mendapat nama final
    const pruned = pruneBackups(outDir, keep)
    return { dir: final, files, pruned }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw e
  }
}

/** Hapus backup lama (hanya folder bernama pos-YYYYMMDD-HHMMSS yang punya manifest), sisakan `keep` terbaru. */
export function pruneBackups(outDir, keep) {
  const dirs = fs.readdirSync(outDir).filter((d) => DIR_RE.test(d) && fs.existsSync(path.join(outDir, d, 'manifest.json'))).sort().reverse()
  const old = dirs.slice(keep)
  for (const d of old) fs.rmSync(path.join(outDir, d), { recursive: true, force: true })
  return old
}

/** Periksa backup: sidik jari, bisa di-gunzip, setiap baris JSON valid, jumlah baris sama dengan manifest. */
export async function verifyBackup(dir) {
  const problems = []
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) } catch { return { ok: false, problems: ['manifest.json tidak ada / rusak'], manifest: null } }
  const expected = new Set([...TABLES.map(([t]) => `${t}.jsonl.gz`)])
  for (const f of expected) if (!manifest.files[f]) problems.push(`${f}: tidak tercatat di manifest`)
  for (const [f, info] of Object.entries(manifest.files)) {
    const file = path.join(dir, f)
    if (!fs.existsSync(file)) { problems.push(`${f}: berkas hilang`); continue }
    if ((await sha256(file)) !== info.sha256) { problems.push(`${f}: sidik jari tidak cocok (berkas berubah/rusak)`); continue }
    let n = 0
    try {
      const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity })
      for await (const line of rl) { if (line.trim()) { JSON.parse(line); n++ } }
    } catch (e) { problems.push(`${f}: isi rusak (${e.message})`); continue }
    if (n !== info.rows) problems.push(`${f}: ${n} baris, manifest mencatat ${info.rows}`)
  }
  return { ok: problems.length === 0, problems, manifest }
}
