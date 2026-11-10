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

console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
