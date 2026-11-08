// Uji pembantu periode laporan (src/shared/period.ts): rentang WIB, bulan, validasi, label, pintasan. Jalankan: npm run test:period
import { transformSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/shared/period.ts'), 'utf8')
const P = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'))
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

t('todayWib: 16:59:59 UTC masih tanggal yang sama, 17:00:00 UTC = hari berikutnya (WIB UTC+7)', P.todayWib(new Date('2026-11-07T16:59:59Z')) === '2026-11-07' && P.todayWib(new Date('2026-11-07T17:00:00Z')) === '2026-11-08')
t('todayWib: pergantian tahun (31 Des 17:00 UTC = 1 Jan WIB)', P.todayWib(new Date('2026-12-31T17:00:00Z')) === '2027-01-01')
t('addDays: akhir bulan, akhir tahun, mundur, tahun kabisat', P.addDays('2026-01-31', 1) === '2026-02-01' && P.addDays('2026-12-31', 1) === '2027-01-01' && P.addDays('2026-03-01', -1) === '2026-02-28' && P.addDays('2028-02-28', 1) === '2028-02-29' && P.addDays('2028-03-01', -1) === '2028-02-29' && P.addDays('2026-02-28', 1) === '2026-03-01')
t('monthRange: Feb 2026 (28), Feb 2028 (29), Apr (30), Des (31), Jan', eq(P.monthRange(2026, 2), { from: '2026-02-01', to: '2026-02-28' }) && P.monthRange(2028, 2).to === '2028-02-29' && P.monthRange(2026, 4).to === '2026-04-30' && P.monthRange(2026, 12).to === '2026-12-31' && P.monthRange(2026, 1).to === '2026-01-31')
t('isIso: menolak 30 Feb, bulan 13, format salah, kosong', P.isIso('2026-03-01') && !P.isIso('2026-02-30') && !P.isIso('2026-13-01') && !P.isIso('2026-2-1') && !P.isIso('') && !P.isIso('abc') && P.isIso('2028-02-29') && !P.isIso('2026-02-29'))
const R = (from, to) => ({ mode: 'range', from, to })
t('validate: bulan & rentang sah → null', P.validate({ mode: 'month', year: 2026, month: 11 }) === null && P.validate(R('2026-11-01', '2026-11-07')) === null && P.validate(R('2026-11-07', '2026-11-07')) === null)
t('validate: tanggal terbalik ditolak', /sebelum atau sama/.test(P.validate(R('2026-11-08', '2026-11-07'))))
t('validate: 366 hari sah, 367 hari ditolak (sama dengan batas database)', P.validate(R('2026-01-01', '2027-01-01')) === null && /maksimal 366/.test(P.validate(R('2026-01-01', '2027-01-02'))))
t('validate: kosong / tidak nyata / di luar 2000–2100 ditolak', /belum lengkap/.test(P.validate(R('', '2026-01-01'))) && /belum lengkap/.test(P.validate(R('2026-02-30', '2026-03-01'))) && /luar batas/.test(P.validate(R('1999-12-31', '2000-01-01'))) && /luar batas/.test(P.validate(R('2100-12-31', '2101-01-01'))))
t('rangeOf: bulan → 1..akhir; rentang apa adanya', eq(P.rangeOf({ mode: 'month', year: 2026, month: 2 }), { from: '2026-02-01', to: '2026-02-28' }) && eq(P.rangeOf(R('2026-03-05', '2026-03-09')), { from: '2026-03-05', to: '2026-03-09' }))
t('label: bulan, 1 hari, rentang', P.labelOf({ mode: 'month', year: 2026, month: 3 }) === 'Maret 2026' && P.labelOf(R('2026-11-07', '2026-11-07')) === '7 November 2026' && P.labelOf(R('2026-11-01', '2026-11-07')) === '1 Nov 2026 – 7 Nov 2026')
t('tag berkas: bulan / 1 hari / rentang', P.tagOf({ mode: 'month', year: 2026, month: 3 }) === '2026-03' && P.tagOf(R('2026-11-07', '2026-11-07')) === '2026-11-07' && P.tagOf(R('2026-11-01', '2026-11-07')) === '2026-11-01_sd_2026-11-07')
const pr = Object.fromEntries(P.presets(new Date('2026-11-08T03:00:00Z')).map((x) => [x.label, [x.from, x.to]]))
t('pintasan (8 Nov 2026 WIB): hari ini, kemarin, 7 hari, 30 hari, bulan ini', eq(pr['Hari ini'], ['2026-11-08', '2026-11-08']) && eq(pr['Kemarin'], ['2026-11-07', '2026-11-07']) && eq(pr['7 hari terakhir'], ['2026-11-02', '2026-11-08']) && eq(pr['30 hari terakhir'], ['2026-10-10', '2026-11-08']) && eq(pr['Bulan ini'], ['2026-11-01', '2026-11-30']), JSON.stringify(pr))
const prB = Object.fromEntries(P.presets(new Date('2026-11-07T17:30:00Z')).map((x) => [x.label, [x.from, x.to]]))
t('pintasan memakai hari WIB (00:30 WIB 8 Nov = "hari ini" 8 Nov, walau masih 7 Nov di UTC)', eq(prB['Hari ini'], ['2026-11-08', '2026-11-08']) && eq(prB['Kemarin'], ['2026-11-07', '2026-11-07']))
t('semua pintasan lolos validasi', P.presets().every((x) => P.validate({ mode: 'range', from: x.from, to: x.to }) === null))
t('defaultPeriod = bulan berjalan menurut WIB', eq(P.defaultPeriod(new Date('2026-11-30T18:00:00Z')), { mode: 'month', year: 2026, month: 12 }))
t('daysBetween & slug', P.daysBetween('2026-01-01', '2026-01-08') === 7 && P.slug('Takom Santa Maria') === 'takom-santa-maria' && P.slug('###') === 'cabang')
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
