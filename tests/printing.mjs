// Uji logika cetak otomatis/ulang (src/features/print/printing.ts) tanpa browser. Jalankan: npm run test:printing
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cache = path.join(ROOT, 'node_modules', '.cache'); fs.mkdirSync(cache, { recursive: true })
const out = path.join(cache, 'printing-test.cjs')
await build({ entryPoints: [path.join(ROOT, 'src/features/print/printing.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, external: ['react'], logLevel: 'silent' })
const P = createRequire(path.join(ROOT, 'package.json'))(out)
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }

// penyimpanan tiruan
const mem = new Map()
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => void mem.set(k, String(v)) }
t('bawaan: cetak otomatis NYALA, mode thermal-saja MATI', P.getAutoPrint() === true && P.getThermalOnly() === false)
P.setAutoPrint(false); P.setThermalOnly(true)
t('pengaturan tersimpan & terbaca', P.getAutoPrint() === false && P.getThermalOnly() === true)
P.setAutoPrint(true)
t('nyalakan lagi', P.getAutoPrint() === true)
globalThis.localStorage = { getItem() { throw new Error('diblokir') }, setItem() { throw new Error('diblokir') } }
t('penyimpanan diblokir browser: tidak crash, memakai bawaan', P.getAutoPrint() === true && P.getThermalOnly() === false && P.setAutoPrint(false) === false)

// penjaga sekali-cetak
const g = P.createPrintGuard()
t('penjaga: nota yang sama hanya sekali, nota lain tetap boleh', g.once('INV-1') === true && g.once('INV-1') === false && g.once('INV-2') === true)

// penjadwal tiruan
const mkSched = () => { const q = []; return { q, schedule: (fn, ms) => { q.push({ fn, ms, live: true }); return q.length - 1 }, cancel: (h) => { q[h].live = false }, fire: () => q.filter((x) => x.live).forEach((x) => { x.live = false; x.fn() }) } }
let s = mkSched(), printed = 0; const win = { print: () => { printed++ } }
P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel, delay: 200 })
t('cetak dijadwalkan 200 ms setelah render, belum langsung', printed === 0 && s.q[0].ms === 200)
s.fire(); t('setelah jeda: print() dipanggil sekali', printed === 1)

// klik ganda
s = mkSched(); printed = 0
P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel }); P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel }); P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel })
s.fire(); t('klik cepat 3x = hanya 1 cetakan', printed === 1, String(printed))
printed = 0; P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel }); s.fire()
t('setelah selesai, cetak ulang berikutnya diizinkan', printed === 1)

// simulasi React StrictMode: efek jalan, dibersihkan, jalan lagi untuk nota yang sama
s = mkSched(); printed = 0; const guard = P.createPrintGuard()
const eff = () => P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel, shouldPrint: () => guard.once('INV-9') })
const c1 = eff(); c1(); eff(); s.fire()
t('StrictMode (efek ganda): nota tetap tercetak TEPAT sekali', printed === 1, String(printed))
const again = eff(); s.fire(); t('efek berulang untuk nota yang sama tidak mencetak ulang otomatis', printed === 1 && typeof again === 'function')

// pembatalan & galat
s = mkSched(); printed = 0
const cancel = P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel }); cancel(); s.fire()
t('dibatalkan sebelum jeda berakhir: tidak mencetak', printed === 0)
let errs = 0; s = mkSched()
P.triggerPrint({ win: { print() { throw new Error('printer offline') } }, schedule: s.schedule, cancel: s.cancel, onError: () => { errs++ } }); s.fire()
t('print() melempar galat: ditangani (onError), tidak crash', errs === 1)
printed = 0; P.triggerPrint({ win, schedule: s.schedule, cancel: s.cancel }); s.fire()
t('setelah galat, cetak berikutnya tetap bisa (tidak macet)', printed === 1)
// timer sungguhan
printed = 0; P.triggerPrint({ win, delay: 5 }); await new Promise((r) => setTimeout(r, 40))
t('timer sungguhan bekerja', printed === 1)
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
