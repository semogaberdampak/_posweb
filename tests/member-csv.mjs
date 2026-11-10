// Uji pembaca CSV member (src/features/members/csv.ts). Jalankan: npm run test:member
import { transformSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/members/csv.ts'), 'utf8')
const { parseMemberCsv } = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'))
let ok = 0, bad = 0
const t = (name, cond, d = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + d}`) }

let r = parseMemberCsv('nomor,nama\nM001,Budi Santoso\nM002,Siti\n')
t('koma: 2 member, nomor disimpan kapital', r.rows.length === 2 && r.rows[0].member_no === 'M001' && r.rows[1].name === 'Siti' && r.problems.length === 0, JSON.stringify(r))

r = parseMemberCsv('\uFEFFNomor;Nama;Status\r\nm-001;budi;Y\r\nm-002;siti;N\r\n')
t('titik koma + BOM + CRLF (Excel Indonesia) + kolom status', r.rows.length === 2 && r.rows[0].member_no === 'M-001' && r.rows[0].is_active === true && r.rows[1].is_active === false && r.inactive === 1, JSON.stringify(r))

r = parseMemberCsv('id member;nama member\n"0012";Ani\n')
t('judul kolom alternatif & nomor berawalan nol tetap teks', r.rows[0]?.member_no === '0012' && r.rows[0].name === 'Ani', JSON.stringify(r))

r = parseMemberCsv('nomor,nama\n,Budi\nM002,\nM 003,Salah\n')
t('nomor/nama kosong & nomor tidak sah ditandai (3 masalah)', r.problems.length === 3 && r.rows.length === 0, JSON.stringify(r.problems))

r = parseMemberCsv('nomor,nama\nM001,Budi\nM001,Budi lagi\n')
t('nomor ganda ditandai', r.duplicates.length === 1 && r.problems.length === 1, JSON.stringify(r))

r = parseMemberCsv('nomor,nama\n"1,00001E+09",Rusak\n')
t('nomor format ilmiah Excel ditandai', r.problems.some((p) => /ilmiah/.test(p)), JSON.stringify(r.problems))

r = parseMemberCsv('nama,qty\nx,1\n')
t('tanpa kolom nomor/nama ditolak dengan pesan jelas', r.rows.length === 0 && /judul kolom/.test(r.problems[0] ?? ''))

r = parseMemberCsv('nomor;nama;status\nM001;Budi;mungkin\n')
t('status tidak dikenal ditolak', r.rows.length === 0 && r.problems.some((p) => /status/.test(p)), JSON.stringify(r.problems))

r = parseMemberCsv('')
t('file kosong', r.problems.length === 1)

r = parseMemberCsv('nomor,nama\n\nM001,Budi\n,\n')
t('baris kosong diabaikan', r.rows.length === 1 && r.problems.length === 0, JSON.stringify(r))

r = parseMemberCsv('nomor,nama\nM001,"Budi, S.Pd"\n')
t('nama dalam tanda kutip berisi koma', r.rows[0]?.name === 'Budi, S.Pd', JSON.stringify(r))

// ---------- format CSV pemilik: Cust ID,Nama,Lembaga,Alamat,Kota,Propinsi,Telp.,Sellular,Segment,Segment Detail,Balance ----------
const HEAD = 'Cust ID,Nama,Lembaga,Alamat,Kota,Propinsi,Telp.,Sellular,Segment,Segment Detail,Balance,'
r = parseMemberCsv(HEAD + '\r\n' +
  '21600003,"FX. Santosa, MS.",,"Jl. Pandean II/18 RT 04/56 CC, Depok",SLEMAN,DIY,517740,,Member ,Guru/Dosen,0,\r\n' +
  '21500008,"Rm. Alexander Joko Purwanto, Pr","Gereja St. Maria Assumpta, Cawas - Klaten"," Jl. Tembus, Gebang, Barepan",KLATEN,JATENG,,0821-1141-6200,Member ,Pastor,69500,\r\n')
t('CSV pemilik: 2 baris, koma dalam kutip aman', r.rows.length === 2 && r.rows[0].name === 'FX. Santosa, MS.' && r.rows[0].alamat.includes('RT 04/56') && r.problems.length === 0, JSON.stringify(r))
t('CSV pemilik: kolom tersimpan dengan nama yang benar', r.rows[0].kota === 'SLEMAN' && r.rows[0].propinsi === 'DIY' && r.rows[0].telp === '517740' && r.rows[0].segment === 'Member' && r.rows[0].segment_detail === 'Guru/Dosen' && r.rows[0].saldo === '0', JSON.stringify(r.rows[0]))
t('CSV pemilik: saldo besar & sellular tetap teks', r.rows[1].saldo === '69500' && r.rows[1].sellular === '0821-1141-6200' && r.rows[1].lembaga === 'Gereja St. Maria Assumpta, Cawas - Klaten', JSON.stringify(r.rows[1]))

t('CSV pemilik: kolom tambahan tidak wajib (nomor,nama saja)', parseMemberCsv(HEAD + '\n21700001,Budi\n').rows[0]?.kota === '')

// baris 6019 pada file pemilik: sel Kota kosong berlebih → kolom sesudahnya bergeser satu
t('baris bergeser dirapikan (kota/propinsi/segment benar)', r2check(parseMemberCsv(HEAD + '\n21800514,ANTIMUS,,Blok U2 No.5 Graha Pratama, ,TANGERANG,BANTEN,,81282917419,Member ,Personal,0\n')))
function r2check(x) {
  const row = x.rows[0]
  return x.repaired === 1 && x.problems.length === 0 && row.kota === 'TANGERANG' && row.propinsi === 'BANTEN' &&
    row.sellular === '81282917419' && row.segment === 'Member' && row.segment_detail === 'Personal' && row.saldo === '0' &&
    row.alamat === 'Blok U2 No.5 Graha Pratama'
}

t('saldo angka ilmiah ditandai rusak (tidak dirapikan)', (() => {
  const x = parseMemberCsv(HEAD + '\n22400474,Kristianus,,Jalan Wirajaya,ENDE,NTT,,82337833451,Member ,Personal,1.82E+07,\n')
  return x.rows.length === 0 && x.problems.some((p) => /saldo/.test(p))
})())
t('saldo bersimbol ribuan diterima', parseMemberCsv(HEAD + '\n21700002,Siti,,Jl. A,BANDUNG,JABAR,,0812,Member ,Personal,"1.234.567",\n').rows[0]?.saldo === '1.234.567')
t('saldo bukan angka ditandai', parseMemberCsv(HEAD + '\n21700003,Siti,,Jl. A,BANDUNG,JABAR,,0812,Member ,Personal,dua ribu,\n').problems.some((p) => /saldo/.test(p)))
t('alamat > 300 huruf ditandai', parseMemberCsv(HEAD + '\n21700004,Siti,,"' + 'x'.repeat(301) + '",BANDUNG,JABAR,,0812,Member ,Personal,0,\n').problems.some((p) => /alamat/.test(p)))

console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
