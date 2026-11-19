// Uji pembaca CSV member KBS (src/features/kbs/csv.ts). Jalankan: npm run test:kbs-csv
import { transformSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/kbs/csv.ts'), 'utf8')
const { parseKbsCsv } = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'))
let ok = 0, bad = 0
const t = (name, cond, d = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + d}`) }

let r = parseKbsCsv('Cust ID,nama\n11510001,PEMBELIAN KONTAN\n11510002,KANTOR PEMASARAN JAKARTA\n')
t('format pemilik: Cust ID,nama (koma)', r.rows.length === 2 && r.rows[0].code === '11510001' && r.rows[1].name === 'KANTOR PEMASARAN JAKARTA', JSON.stringify(r))

r = parseKbsCsv('\uFEFFKode;Nama;Status\r\nabc001;Toko A;Y\r\nabc002;Toko B;N\r\n')
t('titik koma + BOM + CRLF (Excel Indonesia)', r.rows.length === 2 && r.rows[0].code === 'ABC001' && r.rows[1].is_active === false && r.inactive === 1, JSON.stringify(r))

r = parseKbsCsv('kode,nama\n11510003,"SUSTERAN, FMM"\n')
t('koma di dalam tanda kutip aman', r.rows.length === 1 && r.rows[0].name === 'SUSTERAN, FMM', JSON.stringify(r.rows))

r = parseKbsCsv('11510004,TOKO TANPA JUDUL\n')
t('tanpa baris judul tetap terbaca', r.rows.length === 1 && r.rows[0].code === '11510004' && r.rows[0].name === 'TOKO TANPA JUDUL', JSON.stringify(r))

r = parseKbsCsv('kode,nama\nA1,Toko A\nA1,Toko A lagi\n,Kosong\nA2,\nA 3,Salah\n')
t('duplikat & baris rusak dilaporkan, baris valid tetap masuk', r.rows.length === 1 && r.duplicates[0] === 'A1' && r.problems.length === 4, JSON.stringify(r))

r = parseKbsCsv('kode,nama\n' + 'A1,Toko\n'.repeat(50001))
t('batas 50.000 baris', r.rows.length === 0 && r.problems.some((p) => p.includes('50.000')), JSON.stringify(r.problems))

console.log(`\n${ok} lulus, ${bad} gagal`)
process.exit(bad ? 1 : 0)
