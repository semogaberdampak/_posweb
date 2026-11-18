// Uji pembaca CSV produk (src/features/products/csv.ts). Jalankan: npm run test:product-csv
import { transformSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/products/csv.ts'), 'utf8')
const { parseProductCsv, parsePrice } = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'))
let ok = 0, bad = 0
const t = (name, cond, d = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + d}`) }

let r = parseProductCsv('kode,nama,harga\nA1,Buku A,10000\nB2,Buku B,5000\n')
t('koma: 2 produk dengan harga', r.rows.length === 2 && r.rows[0].code === 'A1' && r.rows[0].price === 10000 && r.problems.length === 0, JSON.stringify(r))

r = parseProductCsv('\uFEFFKode Produk;Nama Produk;Harga;Pengarang;Status\r\na1;Buku A;"45.000";Budi;Y\r\nb2;Buku B;0;Siti;N\r\n')
t('titik koma + BOM + CRLF (Excel Indonesia)', r.rows.length === 2 && r.rows[0].code === 'a1' && r.rows[0].price === 45000 && r.problems.length === 0, JSON.stringify(r))
t('kolom pengarang & status terbaca', r.rows[0].author === 'Budi' && r.rows[0].is_active === true && r.rows[1].is_active === false && r.inactive === 1, JSON.stringify(r.rows))

t('judul alternatif "produk id"/"prod Desc"', (() => {
  const x = parseProductCsv('produk id,prod Desc,Price2\n1115AX0126,Buku Panjang,25000\n')
  return x.rows[0]?.code === '1115AX0126' && x.rows[0].name === 'Buku Panjang' && x.rows[0].price === 25000
})(), JSON.stringify(r))

t('harga Rp & ribuan titik', parsePrice('Rp 45.000') === 45000 && parsePrice('1.234.567') === 1234567, '')
t('harga desimal koma dibulatkan', parsePrice('45.000,50') === 45001 && parsePrice('45000,4') === 45000, '')
t('harga sel kosong = tidak diisi', parsePrice('  ') === null && parseProductCsv('kode,nama,harga\nA1,Buku,\n').rows[0]?.price === undefined)
t('harga bukan angka ditolak', parsePrice('dua ribu') === 'bad' && parsePrice('1,07E+11') === 'bad')

r = parseProductCsv('kode,nama,harga\nA1,Buku A,10\na1,Buku A lagi,20\n')
t('kode ganda (beda kapital) dilewati & dilaporkan', r.rows.length === 1 && r.duplicates.length === 1 && r.problems.some((p) => /lebih dari satu kali/.test(p)), JSON.stringify(r))

r = parseProductCsv('kode,nama\n,Buku\nA1,\n')
t('kode/nama kosong ditandai', r.rows.length === 0 && r.problems.length === 2, JSON.stringify(r.problems))

r = parseProductCsv('kode,nama,harga\nA1,Buku,abc\n')
t('harga rusak ditandai, baris dilewati', r.rows.length === 0 && r.problems.some((p) => /harga/.test(p)), JSON.stringify(r.problems))

r = parseProductCsv('kode,nama,status\nA1,Buku,mungkin\n')
t('status tidak dikenal ditandai', r.rows.length === 0 && r.problems.some((p) => /status/.test(p)), JSON.stringify(r.problems))

r = parseProductCsv('nama,harga\nBuku,1000\n')
t('tanpa kolom kode ditolak', r.rows.length === 0 && /judul kolom kode/.test(r.problems[0] ?? ''), JSON.stringify(r.problems))

r = parseProductCsv('kode,harga\nA1,1000\n')
t('tanpa kolom nama ditolak', r.rows.length === 0 && /judul kolom nama/.test(r.problems[0] ?? ''), JSON.stringify(r.problems))

r = parseProductCsv('')
t('file kosong', r.problems.length === 1)

r = parseProductCsv('kode,nama,pengarang\nA1,"Buku, Lengkap","Santosa, MS."\n')
t('kutip berisi koma aman', r.rows[0]?.name === 'Buku, Lengkap' && r.rows[0].author === 'Santosa, MS.', JSON.stringify(r.rows[0]))

r = parseProductCsv('kode,nama\n\nA1,Buku\n,,\n')
t('baris kosong diabaikan', r.rows.length === 1 && r.problems.length === 0, JSON.stringify(r))

console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
