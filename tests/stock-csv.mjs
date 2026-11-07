// Uji pembaca CSV stok (src/features/stock/csv.ts). Jalankan: npm run test:csv
import { transformSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/stock/csv.ts'), 'utf8')
const { parseStockCsv } = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'))
let ok = 0, bad = 0
const t = (name, cond, d = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + d}`) }
let r = parseStockCsv('kode,jumlah\n1000011013,5\n1115AX0126,0\n')
t('koma: 2 baris, kode alfanumerik utuh', r.rows.length === 2 && r.rows[1].code === '1115AX0126' && r.problems.length === 0, JSON.stringify(r))
r = parseStockCsv('\uFEFFkode;jumlah\r\n1000011013;12\r\n1000011014;3\r\n')
t('titik koma + BOM + CRLF (CSV Excel Indonesia)', r.rows.length === 2 && r.totalQty === 15, JSON.stringify(r))
r = parseStockCsv('Kode Produk;Stok\n"0012";7\n')
t('judul kolom alternatif & kode berawalan nol tetap teks', r.rows[0]?.code === '0012' && r.rows[0].qty === 7, JSON.stringify(r))
r = parseStockCsv('kode,jumlah\n1000011013,-3\n1000011014,2.5\n1000011015,abc\n')
t('jumlah negatif/desimal/huruf ditandai bermasalah', r.problems.length === 3 && r.rows.length === 0, JSON.stringify(r.problems))
r = parseStockCsv('kode,jumlah\n1000011013,1\n1000011013,2\n')
t('kode ganda ditandai', r.duplicates.length === 1 && r.problems.length === 1)
r = parseStockCsv('kode,jumlah\n"1,00001E+09",5\n')
t('kode format ilmiah Excel ditandai', r.problems.some((p) => /ilmiah/.test(p)), JSON.stringify(r.problems))
r = parseStockCsv('kode;jumlah\n1,00001E+09;5\n')
t('kode format ilmiah (titik koma) ditandai', r.problems.some((p) => /ilmiah/.test(p)), JSON.stringify(r.problems))
r = parseStockCsv('nama,qty\nx,1\n')
t('tanpa kolom "kode" ditolak dengan pesan jelas', r.rows.length === 0 && /judul kolom/.test(r.problems[0] ?? ''))
r = parseStockCsv('kode,jumlah\n\n1000011013,4\n,\n')
t('baris kosong diabaikan', r.rows.length === 1 && r.problems.length === 0, JSON.stringify(r))
r = parseStockCsv('kode,jumlah\n"A,B",3\n')
t('kode dalam tanda kutip berisi koma', r.rows[0]?.code === 'A,B', JSON.stringify(r))
r = parseStockCsv('')
t('file kosong', r.problems.length === 1)
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
