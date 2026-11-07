// Uji logika backup dengan Supabase tiruan (tanpa jaringan): halaman, batas 1000, verifikasi, kerusakan, kegagalan, retensi.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { runBackup, verifyBackup, pruneBackups, TABLES } from '../scripts/lib/backup-core.mjs'

let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const SIZES = { products: 2500, sales: 1000, sale_items: 0, stock: 1, branches: 7 } // 1000 persis = uji batas halaman
const makeDb = (over = {}) => Object.fromEntries(TABLES.map(([name, order]) => [name, Array.from({ length: SIZES[name] ?? 3 }, (_, i) => ({ [order[0]]: String(i + 1).padStart(6, '0'), n: i, note: `baris ${i} "kutip" é` }))]))
function fake(db, { failOn, lieCount } = {}) {
  return {
    from(table) {
      const rows = db[table]
      return {
        select(_c, o) {
          if (o?.head) return Promise.resolve({ count: rows.length + (lieCount?.[table] ?? 0), error: null })
          const b = { order: () => b, range: (a, z) => Promise.resolve(failOn === table ? { data: null, error: { message: 'koneksi putus' } } : { data: rows.slice(a, z + 1), error: null }) }
          return b
        },
      }
    },
    auth: { admin: { listUsers: ({ page, perPage }) => Promise.resolve({ data: { users: Array.from({ length: 1201 }, (_, i) => ({ id: `u${i}`, email: `u${i}@takom.id`, encrypted_password: 'RAHASIA', created_at: 'x' })).slice((page - 1) * perPage, page * perPage) }, error: null }) } },
  }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'))
const out = path.join(tmp, 'backups'), quiet = () => {}
const readGz = (f) => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

const db = makeDb()
const r = await runBackup({ client: fake(db), outDir: out, now: new Date(2026, 10, 7, 22, 0, 0), log: quiet })
t('semua tabel + akun tertulis, nama folder berformat tanggal', r.dir.endsWith('pos-20261107-220000') && Object.keys(r.files).length === TABLES.length + 1)
t('jumlah baris per tabel sama (termasuk 2500 = 3 halaman, 1000 persis, 0 baris)', r.files['products.jsonl.gz'].rows === 2500 && r.files['sales.jsonl.gz'].rows === 1000 && r.files['sale_items.jsonl.gz'].rows === 0 && r.files['branches.jsonl.gz'].rows === 7)
const back = readGz(path.join(r.dir, 'products.jsonl.gz'))
t('isi identik & berurutan, karakter khusus utuh', back.length === 2500 && JSON.stringify(back) === JSON.stringify(db.products))
t('akun: 1201 diekspor (2 halaman) TANPA kata sandi', r.files['auth_users.jsonl.gz'].rows === 1201 && !fs.readFileSync(path.join(r.dir, 'auth_users.jsonl.gz')).toString('latin1').includes('RAHASIA') && !JSON.stringify(readGz(path.join(r.dir, 'auth_users.jsonl.gz'))).includes('encrypted_password'))
t('tidak ada folder sementara tersisa', fs.readdirSync(out).every((d) => !d.startsWith('.partial')))
let v = await verifyBackup(r.dir)
t('verifikasi: backup utuh lolos', v.ok, v.problems.join('; '))

// kerusakan
const f = path.join(r.dir, 'sales.jsonl.gz'), orig = fs.readFileSync(f)
const flip = Buffer.from(orig); flip[20] ^= 0xff; fs.writeFileSync(f, flip)
v = await verifyBackup(r.dir); t('verifikasi: berkas diubah 1 byte terdeteksi', !v.ok && v.problems.some((p) => /sidik jari/.test(p)))
fs.writeFileSync(f, orig); fs.rmSync(path.join(r.dir, 'stock.jsonl.gz'))
v = await verifyBackup(r.dir); t('verifikasi: berkas hilang terdeteksi', !v.ok && v.problems.some((p) => /hilang/.test(p)))
fs.writeFileSync(path.join(r.dir, 'stock.jsonl.gz'), zlib.gzipSync('{"a":1}\n'))
v = await verifyBackup(r.dir); t('verifikasi: berkas pengganti (isi lain) terdeteksi', !v.ok)
fs.rmSync(path.join(r.dir, 'manifest.json')); v = await verifyBackup(r.dir); t('verifikasi: manifest hilang terdeteksi', !v.ok)

// kegagalan di tengah jalan
const before = fs.readdirSync(out).sort()
let msg = ''; try { await runBackup({ client: fake(makeDb(), { failOn: 'sales' }), outDir: out, now: new Date(2026, 10, 8, 22, 0, 0), log: quiet }) } catch (e) { msg = e.message }
t('gagal di tengah: error jelas, tidak ada folder baru/sementara, backup lama aman', /sales.*koneksi putus/.test(msg) && JSON.stringify(fs.readdirSync(out).sort()) === JSON.stringify(before), msg)
msg = ''; try { await runBackup({ client: fake(makeDb(), { lieCount: { products: 5 } }), outDir: out, now: new Date(2026, 10, 8, 23, 0, 0), log: quiet }) } catch (e) { msg = e.message }
t('baris terlewat (terbaca < jumlah di database) membatalkan backup', /Ulangi backup/.test(msg), msg)

// retensi
const rt = path.join(tmp, 'rt'); fs.mkdirSync(rt); fs.mkdirSync(path.join(rt, 'foto-penting')); fs.mkdirSync(path.join(rt, 'pos-20200101-000000')) // tanpa manifest
for (let d = 1; d <= 5; d++) await runBackup({ client: fake(makeDb()), outDir: rt, keep: 3, now: new Date(2026, 10, d, 22, 0, 0), withAuth: false, log: quiet })
const left = fs.readdirSync(rt).sort()
t('retensi: simpan 3 terbaru, hapus yang lama', JSON.stringify(left.filter((x) => /^pos-2026/.test(x))) === JSON.stringify(['pos-20261103-220000', 'pos-20261104-220000', 'pos-20261105-220000']), left.join())
t('retensi: folder lain & folder tanpa manifest TIDAK disentuh', left.includes('foto-penting') && left.includes('pos-20200101-000000'))
let e2 = ''; try { await runBackup({ client: fake(makeDb()), outDir: rt, keep: 0, log: quiet }) } catch (e) { e2 = e.message }
t('keep 0 ditolak (tidak boleh menghapus semuanya)', /keep minimal 1/.test(e2))
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
