// Uji alur LENGKAP di Postgres tiruan (PGlite): 7 cabang, akun, impor stok, penjualan (semua metode bayar, diskon per baris),
// void, mutasi stok, lalu pemeriksaan keutuhan (buku stok = stok, total penjualan, tidak ada stok minus).
// Jalankan: npm run test:e2e            (data contoh sintetis)
//           node tests/e2e-flow.mjs produk.json   (JSON [{code,name,price,author}] mis. dari Excel asli)
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const db = new PGlite({ extensions: { pg_trgm } })
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  <-- ' + detail}`) }
const q = async (sql) => (await db.query(sql)).rows
const sq = (v) => `'${String(v).replace(/'/g, "''")}'`
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function as(user, sql) {
  await db.exec(`set request.jwt.claim.sub='${user}'; set role authenticated;`)
  try { return await q(sql) } catch (e) { throw new Error(e.message) } finally { await db.exec('reset role;') } // pesan ringkas
}
const seq = async (items, fn) => { const o = []; for (const x of items) o.push(await fn(x)); return o } // berurutan: satu koneksi, klaim JWT global
const err = async (user, sql) => { try { await as(user, sql); return null } catch (e) { return e.message } }

// ---------- persiapan ----------
await db.exec(`
 create role anon nologin; create role authenticated nologin; create role service_role nologin;
 create schema auth; create table auth.users(id uuid primary key, email text);
 create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema public to anon, authenticated; grant usage on schema auth to authenticated;
 grant execute on function auth.uid() to anon, authenticated;`)
await db.exec(sqlFile('supabase/schema.sql'))
for (const f of fs.readdirSync(path.join(ROOT, 'supabase/manual_migrations')).sort()) await db.exec(sqlFile('supabase/manual_migrations/' + f))

await db.exec(`
 update branches set name='Takom Pusat' where code='PUSAT';
 insert into branches(code,name,is_pusat) values ('KRANGGAN','Takom Kranggan',false),('KATEDRAL','Takom Katedral',false),('PAULUS','Takom Paulus',false),
   ('SANTAMARIA','Takom Santa Maria',false),('ATHANASIUS','Takom Athanasius',false),('ANTONIUS','Takom Antonius',false);`)
const B = Object.fromEntries((await q('select code,id from branches')).map((r) => [r.code, r.id]))
const users = [ // [n, email, nama, cabang, role]
  [101, 'kasir.kranggan', 'Kasir Kranggan', 'KRANGGAN', 'kasir'], [102, 'kasir.katedral1', 'Kasir Katedral 1', 'KATEDRAL', 'kasir'],
  [103, 'kasir.katedral2', 'Kasir Katedral 2', 'KATEDRAL', 'kasir'], [104, 'kasir.paulus', 'Kasir Paulus', 'PAULUS', 'kasir'],
  [105, 'kasir.santamaria', 'Kasir Santa Maria', 'SANTAMARIA', 'kasir'], [106, 'kasir.athanasius', 'Kasir Athanasius', 'ATHANASIUS', 'kasir'],
  [107, 'kasir.antonius', 'Kasir Antonius', 'ANTONIUS', 'kasir'], [201, 'pengadaan.pusat', 'Pengadaan', 'PUSAT', 'pengadaan'],
  [202, 'keuangan.pusat', 'Keuangan', 'PUSAT', 'keuangan'], [203, 'kabag.pusat', 'Kabag', 'PUSAT', 'kabag'], [204, 'superadmin', 'Super Admin', 'PUSAT', 'superadmin'],
]
for (const [n, em, nama, cab, role] of users) await db.exec(`insert into auth.users values ('${uid(n)}','${em}@takom.id');
  insert into profiles(id,full_name,branch_id,role_id) select '${uid(n)}','${nama}','${B[cab]}',(select id from roles where name='${role}');`)
const KR = { KRANGGAN: uid(101), KATEDRAL1: uid(102), KATEDRAL2: uid(103), PAULUS: uid(104), SANTAMARIA: uid(105), ATHANASIUS: uid(106), ANTONIUS: uid(107) }
const PENG = uid(201), KEU = uid(202), KABAG = uid(203), SA = uid(204)

let products = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : Array.from({ length: 60 }, (_, i) => ({ code: i % 9 === 0 ? `1115AX${String(i).padStart(4, '0')}` : `10000${11000 + i}`, name: `Buku contoh ${i}`, price: 5000 + (i % 13) * 3500, author: i % 2 ? 'Penulis X' : null }))
for (const p of products) await db.exec(`insert into products(code,name,price,author) values (${sq(p.code)}, ${sq(p.name)}, ${p.price}, ${p.author ? sq(p.author) : 'null'})`)
await db.exec(`insert into products(code,name,price,is_active) values ('NONAKTIF1','Produk nonaktif',10000,false)`)
const P = Object.fromEntries((await q('select code,id,price from products')).map((r) => [r.code, r]))
const codes = products.map((p) => p.code)
console.log(`Data uji: ${products.length} produk, 7 cabang, ${users.length} akun\n`)

// ---------- impor stok per cabang ----------
const branchList = ['KRANGGAN', 'KATEDRAL', 'PAULUS', 'SANTAMARIA', 'ATHANASIUS', 'ANTONIUS', 'PUSAT']
const NSTOCK = Math.min(150, codes.length)
const rowsFor = (bi) => codes.slice(0, NSTOCK).map((c, j) => ({ code: c, qty: ((j * 7 + bi * 3) % 9) + 6 })) // 6..14 pcs
const imp = async (user, branch, rows, mode = 'fill') => (await as(user, `select import_stock('${B[branch]}', ${lit(rows)}, '${mode}') as r`))[0].r
let r0 = await imp(PENG, 'KRANGGAN', [...rowsFor(0), { code: 'KODE-TIDAK-ADA', qty: 3 }])
check(`impor stok Kranggan: terisi ${NSTOCK}, 1 kode tidak dikenal dilaporkan`, r0.inserted === NSTOCK && r0.unknown_count === 1 && r0.unknown[0] === 'KODE-TIDAK-ADA', JSON.stringify(r0))
for (const [i, b] of branchList.slice(1).entries()) await imp(PENG, b, rowsFor(i + 1))
const r1 = await imp(PENG, 'KRANGGAN', rowsFor(0))
check(`impor ulang mode "fill": tidak menimpa (skipped ${NSTOCK}, inserted 0)`, r1.inserted === 0 && r1.skipped === NSTOCK, JSON.stringify(r1))
check('kasir TIDAK boleh impor stok', /forbidden/.test(await err(KR.KRANGGAN, `select import_stock('${B.KRANGGAN}', ${lit(rowsFor(0))}, 'fill')`) ?? ''))
check('kode ganda dalam file ditolak', /ganda/.test(await err(PENG, `select import_stock('${B.PAULUS}', ${lit([{ code: codes[0], qty: 1 }, { code: codes[0], qty: 2 }])}, 'fill')`) ?? ''))
check('jumlah negatif/desimal ditolak', /tidak valid/.test(await err(PENG, `select import_stock('${B.PAULUS}', ${lit([{ code: codes[1], qty: '-3' }])}, 'fill')`) ?? ''))
const totalInit = Object.fromEntries((await q(`select product_id, sum(qty)::int q from stock group by 1`)).map((r) => [r.product_id, r.q]))

// ---------- penjualan ----------
const stockAt = async (code, br) => (await q(`select coalesce((select qty from stock where branch_id='${B[br]}' and product_id='${P[code].id}'),0)::int q`))[0].q
const sell = async (user, items, member, method, cash, branch) =>
  (await as(user, `select create_sale(${lit(items.map((i) => ({ product_id: P[i.code].id, qty: i.qty, discount_pct: i.d ?? 0 })))}, ${member ? `'${member}'` : 'null'}, '${method}', ${cash ?? 'null'}, ${branch ? `'${B[branch]}'` : 'null'}) as r`))[0].r
const [c0, c1, c2, c3] = codes
const price = (c) => Number(P[c].price)

let before = await stockAt(c0, 'KRANGGAN')
let s = await sell(KR.KRANGGAN, [{ code: c0, qty: 2 }], null, 'cash', price(c0) * 2 + 5000)
check('TUNAI: total benar & kembalian = uang diterima - total', s.total === price(c0) * 2 && s.change === 5000, JSON.stringify(s))
check('TUNAI: stok cabang Kranggan berkurang 2', (await stockAt(c0, 'KRANGGAN')) === before - 2)

const gross1 = price(c1) * 3, gross2 = price(c2) * 1, d1 = Math.round(gross1 * 10 / 100), d2 = Math.round(gross2 * 25 / 100)
s = await sell(KR.PAULUS, [{ code: c1, qty: 3, d: 10 }, { code: c2, qty: 1, d: 25 }], 'M-001', 'qris')
check('QRIS + diskon per baris (10% & 25%): subtotal/diskon/total tepat', s.subtotal === gross1 + gross2 && s.discount === d1 + d2 && s.total === gross1 + gross2 - d1 - d2, JSON.stringify(s))
s = await sell(KR.SANTAMARIA, [{ code: c3, qty: 1, d: 5 }], 'M-002', 'debit')
check('DEBIT berhasil', !!s.invoice_no)
s = await sell(KR.ATHANASIUS, [{ code: c0, qty: 1 }, { code: c1, qty: 2, d: 15 }], 'M-003', 'credit_card')
check('KARTU KREDIT berhasil', !!s.invoice_no)

check('diskon tanpa member ditolak', /member wajib/.test(await err(KR.KRANGGAN, `select create_sale(${lit([{ product_id: P[c0].id, qty: 1, discount_pct: 5 }])}, '', 'qris', null, null)`) ?? ''))
check('diskon 12% (tidak ada di daftar) ditolak', /diskon tidak valid/.test(await err(KR.KRANGGAN, `select create_sale(${lit([{ product_id: P[c0].id, qty: 1, discount_pct: 12 }])}, 'M', 'qris', null, null)`) ?? ''))
check('tunai kurang ditolak', /uang diterima kurang/.test(await err(KR.KRANGGAN, `select create_sale(${lit([{ product_id: P[c0].id, qty: 1, discount_pct: 0 }])}, null, 'cash', 1, null)`) ?? ''))
check('stok kurang ditolak (qty melebihi stok)', /stok tidak cukup/.test(await err(KR.KRANGGAN, `select create_sale(${lit([{ product_id: P[c0].id, qty: 9999, discount_pct: 0 }])}, null, 'qris', null, null)`) ?? ''))
check('produk nonaktif tidak bisa dijual', /tidak ditemukan|nonaktif/.test(await err(KR.KRANGGAN, `select create_sale(${lit([{ product_id: P.NONAKTIF1.id, qty: 1, discount_pct: 0 }])}, null, 'qris', null, null)`) ?? ''))
check('kasir TIDAK bisa berjualan atas nama cabang lain', /forbidden/.test(await err(KR.KRANGGAN, `select create_sale(${lit([{ product_id: P[c0].id, qty: 1, discount_pct: 0 }])}, null, 'qris', null, '${B.PAULUS}')`) ?? ''))
check('pengadaan (tanpa hak kasir) tidak bisa berjualan', /forbidden/.test(await err(PENG, `select create_sale(${lit([{ product_id: P[c0].id, qty: 1, discount_pct: 0 }])}, null, 'qris', null, null)`) ?? ''))
const gagal = await q(`select count(*)::int n from sales where invoice_no is null`)
check('transaksi gagal tidak meninggalkan data setengah jadi', gagal[0].n === 0 && (await q(`select count(*)::int n from sales where total = 0 and subtotal = 0`))[0].n === 0)

// superadmin bertindak sebagai cabang lain
before = await stockAt(c2, 'ANTONIUS')
s = await sell(SA, [{ code: c2, qty: 1 }], null, 'qris', null, 'ANTONIUS')
check('SUPERADMIN berjualan atas nama Antonius: stok Antonius berkurang, bukan Pusat', (await stockAt(c2, 'ANTONIUS')) === before - 1)
check('penjualan superadmin tercatat di cabang Antonius', (await q(`select b.code from sales s join branches b on b.id=s.branch_id where s.invoice_no='${s.invoice_no}'`))[0].code === 'ANTONIUS')

// dua kasir Katedral berbagi stok
const cK = codes[10]
await as(PENG, `select set_stock('${B.KATEDRAL}','${P[cK].id}', 5, 'uji')`)
await sell(KR.KATEDRAL1, [{ code: cK, qty: 3 }], null, 'qris')
check('Katedral: kasir 2 melihat stok yang sudah dikurangi kasir 1 (tersisa 2)', (await stockAt(cK, 'KATEDRAL')) === 2)
check('Katedral: kasir 2 tidak bisa menjual 3 (hanya sisa 2)', /stok tidak cukup/.test(await err(KR.KATEDRAL2, `select create_sale(${lit([{ product_id: P[cK].id, qty: 3, discount_pct: 0 }])}, null, 'qris', null, null)`) ?? ''))
await sell(KR.KATEDRAL2, [{ code: cK, qty: 2 }], null, 'qris')
check('Katedral: stok habis tepat 0, penjualan berikutnya ditolak', (await stockAt(cK, 'KATEDRAL')) === 0 && /stok tidak cukup/.test(await err(KR.KATEDRAL1, `select create_sale(${lit([{ product_id: P[cK].id, qty: 1, discount_pct: 0 }])}, null, 'qris', null, null)`) ?? ''))

// void
const vs = await sell(KR.KRANGGAN, [{ code: codes[20], qty: 2 }], null, 'qris')
const stokSebelumVoid = await stockAt(codes[20], 'KRANGGAN')
check('kasir TIDAK bisa void', /forbidden/.test(await err(KR.KRANGGAN, `select void_sale('${vs.sale_id}', 'salah')`) ?? ''))
await as(KABAG, `select void_sale('${vs.sale_id}', 'salah input')`)
check('KABAG void: stok kembali', (await stockAt(codes[20], 'KRANGGAN')) === stokSebelumVoid + 2)
check('void dua kali ditolak', /tidak bisa di-void/.test(await err(KABAG, `select void_sale('${vs.sale_id}', 'lagi')`) ?? ''))

// mutasi stok
const tc = codes[30], pusatQ = await stockAt(tc, 'PUSAT'), krQ = await stockAt(tc, 'KRANGGAN'), tot = pusatQ + krQ
await as(PENG, `select transfer_stock('${B.PUSAT}','${B.KRANGGAN}','${P[tc].id}', 1, 'uji')`)
check('MUTASI Pusat→Kranggan: asal -1, tujuan +1, total tetap', (await stockAt(tc, 'PUSAT')) === pusatQ - 1 && (await stockAt(tc, 'KRANGGAN')) === krQ + 1 && (await stockAt(tc, 'PUSAT')) + (await stockAt(tc, 'KRANGGAN')) === tot)
check('mutasi melebihi stok asal ditolak', /stok asal tidak cukup/.test(await err(PENG, `select transfer_stock('${B.PUSAT}','${B.KRANGGAN}','${P[tc].id}', 99999, null)`) ?? ''))
check('mutasi ke cabang yang sama ditolak', /sama/.test(await err(PENG, `select transfer_stock('${B.PUSAT}','${B.PUSAT}','${P[tc].id}', 1, null)`) ?? ''))
check('kasir TIDAK bisa mutasi stok', /forbidden/.test(await err(KR.KRANGGAN, `select transfer_stock('${B.KRANGGAN}','${B.PAULUS}','${P[tc].id}', 1, null)`) ?? ''))
await as(PENG, `select transfer_stock('${B.PAULUS}','${B.KRANGGAN}','${P[tc].id}', 1, 'ke tujuan baru')`)

// mutasi banyak produk (atomik) + hak 'stock_move'
const bc = [codes[50], codes[51], codes[52]], pq = {}
for (const c of bc) pq[c] = [await stockAt(c, 'PUSAT'), await stockAt(c, 'PAULUS')]
const bl = (arr) => lit(arr.map(([c, n]) => ({ product_id: P[c].id, qty: n })))
const nb = (await as(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', ${bl(bc.map((c) => [c, 2]))}, 'kiriman') as n`))[0].n
check('BATCH: 3 produk Pusat→Paulus sekaligus (hasil 3)', nb === 3)
check('BATCH: stok asal -2 & tujuan +2 untuk tiap produk', (await Promise.all(bc.map(async (c) => (await stockAt(c, 'PUSAT')) === pq[c][0] - 2 && (await stockAt(c, 'PAULUS')) === pq[c][1] + 2))).every(Boolean))
const snap = await Promise.all(bc.map((c) => stockAt(c, 'PUSAT')))
check('BATCH ATOMIK: satu baris gagal (stok kurang) = SEMUA batal, tidak ada yang berpindah', /stok asal tidak cukup/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', ${bl([[bc[0], 1], [bc[1], 1], [bc[2], 99999]])}, null)`) ?? '') && JSON.stringify(await Promise.all(bc.map((c) => stockAt(c, 'PUSAT')))) === JSON.stringify(snap))
check('BATCH: produk ganda ditolak', /produk ganda/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', ${bl([[bc[0], 1], [bc[0], 1]])}, null)`) ?? ''))
check('BATCH: daftar kosong / >200 baris ditolak', /1-200/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', '[]'::jsonb, null)`) ?? '') && /1-200/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', ${lit(Array.from({ length: 201 }, (_, i) => ({ product_id: uid(900000 + i), qty: 1 })))}, null)`) ?? ''))
check('BATCH: jumlah 0 / bukan angka ditolak', /tidak valid/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', ${bl([[bc[0], 0]])}, null)`) ?? '') && /tidak valid/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PAULUS}', ${lit([{ product_id: P[bc[0]].id, qty: '1; drop table stock' }])}, null)`) ?? ''))
check('BATCH: kasir TIDAK bisa (tanpa hak stock_move)', /forbidden/.test(await err(KR.KRANGGAN, `select transfer_stock_batch('${B.KRANGGAN}','${B.PAULUS}', ${bl([[bc[0], 1]])}, null)`) ?? ''))
const hk = (await seq([PENG, SA, KR.KRANGGAN, KABAG, KEU], async (u) => (await as(u, `select has_perm('stock_move','u') as p`))[0].p)).join()
check('HAK stock_move: pengadaan & superadmin ya; kasir, kabag, keuangan tidak', hk === 'true,true,false,false,false', hk)
check('BATCH: cabang asal = tujuan ditolak', /sama/.test(await err(PENG, `select transfer_stock_batch('${B.PUSAT}','${B.PUSAT}', ${bl([[bc[0], 1]])}, null)`) ?? ''))

// mode "set" (stok opname via impor)
const o = await imp(PENG, 'PAULUS', [{ code: codes[40], qty: 77 }], 'set')
check('impor mode "set": stok ditimpa jadi 77, selisih tercatat', o.updated === 1 && (await stockAt(codes[40], 'PAULUS')) === 77)

// ---------- format cetak (admin) ----------
const cfgJson = lit({ title: 'NOTA PENJUALAN', footerLines: ['Terima kasih'] })
await as(SA, `select save_print_template('invoice', ${cfgJson})`)
check('FORMAT NOTA: superadmin bisa menyimpan', (await as(KR.KRANGGAN, `select config->>'title' t from print_templates where kind='invoice'`))[0]?.t === 'NOTA PENJUALAN')
check('FORMAT NOTA: kasir bisa MEMBACA (perlu untuk mencetak)', (await as(KR.KRANGGAN, `select count(*)::int n from print_templates`))[0].n === 1)
check('FORMAT NOTA: kasir TIDAK bisa menyimpan', /forbidden/.test(await err(KR.KRANGGAN, `select save_print_template('receipt', ${cfgJson})`) ?? ''))
check('FORMAT NOTA: kabag/pengadaan/keuangan TIDAK bisa menyimpan', (await seq([KABAG, PENG, KEU], (u) => err(u, `select save_print_template('receipt', ${cfgJson})`))).every((m) => /forbidden/.test(m ?? '')))
check('FORMAT NOTA: kasir tidak bisa menulis tabel langsung', !!(await err(KR.KRANGGAN, `insert into print_templates(kind, config) values ('receipt','{}')`)) && !!(await err(KR.KRANGGAN, `update print_templates set config='{}'`)))
check('FORMAT NOTA: jenis tidak valid / bukan objek / terlalu besar ditolak', /tidak valid/.test(await err(SA, `select save_print_template('lain', ${cfgJson})`) ?? '') && /tidak valid/.test(await err(SA, `select save_print_template('receipt', '[1]'::jsonb)`) ?? '') && /terlalu besar/.test(await err(SA, `select save_print_template('receipt', ${lit({ x: 'a'.repeat(21000) })})`) ?? ''))
await as(SA, `select save_print_template('invoice', ${lit({ title: 'NOTA V2' })})`)
check('FORMAT NOTA: simpan ulang menimpa (satu baris per jenis)', (await q(`select count(*)::int n from print_templates where kind='invoice'`))[0].n === 1)

// ---------- rekap penjualan ----------
const rc = async (u, y, m, br, pg = 1, sz = 20) => (await as(u, `select sales_recap(${y},${m},${br ? `'${B[br]}'` : 'null'},${pg},${sz}) as r`))[0].r
const nowYM = (await q(`select extract(year from now() at time zone 'Asia/Jakarta')::int y, extract(month from now() at time zone 'Asia/Jakarta')::int m`))[0]
const dbAll = (await q(`select count(*)::int n, count(*) filter (where status='completed')::int c, coalesce(sum(total) filter (where status='completed'),0)::int t, count(*) filter (where status='void')::int v from sales`))[0]
let rcAll = await rc(SA, nowYM.y, nowYM.m, null)
check('REKAP: superadmin (semua cabang) = seluruh transaksi bulan ini', rcAll.total_rows === dbAll.n && rcAll.summary.count === dbAll.c && rcAll.summary.total === dbAll.t && rcAll.summary.void_count === dbAll.v, JSON.stringify(rcAll.summary) + JSON.stringify(dbAll))
check('REKAP: total per metode bayar menjumlah ke total penjualan', Object.values(rcAll.by_method).reduce((a, b) => a + b, 0) === rcAll.summary.total && ['cash', 'qris', 'debit', 'credit_card'].every((m) => m in rcAll.by_method))
const rcK = await rc(KR.KRANGGAN, nowYM.y, nowYM.m, null)
const dbK = (await q(`select count(*)::int n from sales where branch_id='${B.KRANGGAN}'`))[0].n
check('REKAP: kasir hanya melihat cabangnya (tanpa memilih cabang)', rcK.total_rows === dbK && rcK.rows.every((r) => r.branch_name === 'Takom Kranggan'), `${rcK.total_rows} vs ${dbK}`)
check('REKAP: kasir TIDAK bisa membuka cabang lain', /forbidden/.test(await err(KR.KRANGGAN, `select sales_recap(${nowYM.y},${nowYM.m},'${B.PAULUS}',1,20)`) ?? ''))
check('REKAP: parameter tidak valid ditolak (bulan 13, halaman 0, ukuran 500)', (await seq([`13,null,1,20`, `1,null,0,20`, `1,null,1,500`], (a) => err(SA, `select sales_recap(${nowYM.y},${a})`))).every((m) => /tidak valid/.test(m ?? '')))
check('REKAP: role tanpa hak sales_recap (pengadaan) ditolak', /forbidden/.test(await err(PENG, `select sales_recap(${nowYM.y},${nowYM.m},null,1,20)`) ?? ''))
// paginasi: ukuran 5 -> semua halaman digabung = semua transaksi, tanpa duplikat, urut terbaru dulu
const pages = Math.ceil(rcAll.total_rows / 5), ids = [], times = []
for (let p = 1; p <= pages; p++) { const r = await rc(SA, nowYM.y, nowYM.m, null, p, 5); r.rows.forEach((x) => { ids.push(x.id); times.push(x.created_at) }); if (p < pages) check(`REKAP: halaman ${p} berisi tepat 5 baris`, r.rows.length === 5) }
check('REKAP: semua halaman digabung = semua transaksi, tanpa duplikat', ids.length === rcAll.total_rows && new Set(ids).size === ids.length)
check('REKAP: urutan terbaru dulu', times.every((t, i) => i === 0 || times[i - 1] >= t))
check('REKAP: halaman di luar jangkauan = kosong (bukan error)', (await rc(SA, nowYM.y, nowYM.m, null, pages + 5, 5)).rows.length === 0)
check('REKAP: transaksi void tampil dengan status void & tidak masuk total', rcAll.rows.some((r) => r.status === 'void') && rcAll.summary.void_total > 0)
// batas bulan WIB (termasuk Maret setelah Februari 28 hari)
const [bA, bB] = (await q(`select id from sales where status='completed' order by created_at limit 2`)).map((r) => r.id)
await db.exec(`update sales set created_at = '2026-02-28 16:59:59+00' where id='${bA}'; update sales set created_at = '2026-02-28 17:00:00+00' where id='${bB}';`)
const feb = await rc(SA, 2026, 2, null), mar = await rc(SA, 2026, 3, null)
check('REKAP: 28 Feb 23:59:59 WIB masuk Februari, 1 Mar 00:00 WIB masuk Maret', feb.rows.some((r) => r.id === bA) && !feb.rows.some((r) => r.id === bB) && mar.rows.some((r) => r.id === bB) && !mar.rows.some((r) => r.id === bA))
check('REKAP: bulan tanpa transaksi = kosong dengan ringkasan nol', (await rc(SA, 2026, 5, null)).total_rows === 0 && (await rc(SA, 2026, 5, null)).summary.total === 0)
// ---------- rekap & ekspor RENTANG TANGGAL ----------
const rr = async (u, a, b, br, pg = 1, sz = 20) => (await as(u, `select sales_recap_range('${a}','${b}',${br ? `'${B[br]}'` : 'null'},${pg},${sz}) as r`))[0].r
const d28 = await rr(SA, '2026-02-28', '2026-02-28', null), d01 = await rr(SA, '2026-03-01', '2026-03-01', null), both = await rr(SA, '2026-02-28', '2026-03-01', null)
check('RENTANG: 1 hari (28 Feb) hanya memuat transaksi 23:59:59 WIB, bukan yang 00:00 WIB 1 Mar', d28.rows.some((r) => r.id === bA) && !d28.rows.some((r) => r.id === bB))
check('RENTANG: 1 Mar saja memuat transaksi 00:00 WIB', d01.rows.some((r) => r.id === bB) && !d01.rows.some((r) => r.id === bA))
check('RENTANG: 28 Feb – 1 Mar (lintas bulan) = jumlah dua hari, kedua transaksi ada', both.total_rows === d28.total_rows + d01.total_rows && both.rows.some((r) => r.id === bA) && both.rows.some((r) => r.id === bB))
const todayCnt = (await q(`select count(*)::int n from sales where (created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date`))[0].n
const todayStr = (await q(`select to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD') d`))[0].d
check('RENTANG: "hari ini" (WIB) = hitungan independen dari tabel sales', (await rr(SA, todayStr, todayStr, null)).total_rows === todayCnt, `${todayCnt}`)
const w1 = await rr(SA, '2026-02-28', '2026-03-01', null, 1, 1), w2 = await rr(SA, '2026-02-28', '2026-03-01', null, 2, 1)
check('RENTANG: paginasi 1 baris/halaman: halaman 1 & 2 berbeda dan lengkap', w1.total_rows === 2 && w1.rows.length === 1 && w2.rows.length === 1 && w1.rows[0].id !== w2.rows[0].id)
const febWrap = await rc(SA, 2026, 2, null), febRange = await rr(SA, '2026-02-01', '2026-02-28', null)
check('PEMBUNGKUS bulanan = rentang 1–akhir bulan (Februari)', JSON.stringify(febWrap) === JSON.stringify(febRange))
const marWrap = await rc(SA, 2026, 3, null), marRange = await rr(SA, '2026-03-01', '2026-03-31', null)
check('PEMBUNGKUS bulanan = rentang 1–31 (Maret, bulan 31 hari)', JSON.stringify(marWrap) === JSON.stringify(marRange))
check('RENTANG: tanggal awal setelah akhir ditolak', /tanggal awal/.test(await err(SA, `select sales_recap_range('2026-03-02','2026-03-01')`) ?? ''))
check('RENTANG: 366 hari boleh, 367 hari ditolak', (await err(SA, `select sales_recap_range('2026-01-01','2027-01-01')`)) === null && /maksimal 366/.test(await err(SA, `select sales_recap_range('2026-01-01','2027-01-02')`) ?? ''))
check('RENTANG: tanggal kosong / di luar 2000–2100 ditolak', /tidak valid/.test(await err(SA, `select sales_recap_range(null,'2026-01-01')`) ?? '') && /tidak valid/.test(await err(SA, `select sales_recap_range('1999-12-31','2000-01-02')`) ?? ''))
check('RENTANG: kasir tidak bisa membuka cabang lain / role tanpa hak ditolak', /forbidden/.test(await err(KR.KRANGGAN, `select sales_recap_range('2026-02-28','2026-03-01','${B.PAULUS}')`) ?? '') && /forbidden/.test(await err(PENG, `select sales_recap_range('2026-02-28','2026-03-01')`) ?? ''))
const kr = await rr(KR.KRANGGAN, '2026-01-01', '2026-12-31', null)
check('RENTANG: kasir tanpa memilih cabang hanya melihat cabangnya', kr.rows.every((r) => r.branch_name === 'Takom Kranggan'))
const exr = (await as(SA, `select sales_export_range('2026-02-28','2026-03-01',null,20000) as r`))[0].r
check('EKSPOR RENTANG: jumlah transaksi = rekap rentang yang sama; item terhubung', exr.sales.length === both.total_rows && exr.items.every((i) => exr.sales.some((x) => x.id === i.sale_id)))
check('EKSPOR RENTANG: tercatat di audit log dengan tanggal awal/akhir', (await q(`select count(*)::int n from audit_log where action='sales.export' and detail->>'from'='2026-02-28' and detail->>'to'='2026-03-01'`))[0].n >= 1)
check('EKSPOR RENTANG: batas baris & hak tetap berlaku', /terlalu banyak/.test(await err(SA, `select sales_export_range('2026-02-28','2026-03-01',null,1)`) ?? '') && /forbidden/.test(await err(KR.KRANGGAN, `select sales_export_range('2026-02-28','2026-03-01','${B.PAULUS}')`) ?? ''))

// detail transaksi
const one = (await q(`select id, invoice_no, total, branch_id from sales where status='completed' and branch_id='${B.KRANGGAN}' limit 1`))[0]
const det = (await as(KR.KRANGGAN, `select sale_detail('${one.id}') as r`))[0].r
check('DETAIL: invoice, item, dan jumlah line_total = total', det.invoice_no === one.invoice_no && det.items.length > 0 && det.items.reduce((a, i) => a + i.line_total, 0) === det.total)
const otherSale = (await q(`select id from sales where branch_id='${B.PAULUS}' limit 1`))[0].id
check('DETAIL: kasir TIDAK bisa membuka transaksi cabang lain', /tidak ditemukan/.test(await err(KR.KRANGGAN, `select sale_detail('${otherSale}')`) ?? ''))

// ---------- ekspor rekap ----------
const ex = async (u, y, m, br, lim = 20000) => (await as(u, `select sales_export(${y},${m},${br ? `'${B[br]}'` : 'null'},${lim}) as r`))[0].r
const exAll = await ex(SA, nowYM.y, nowYM.m, null), rcNow = await rc(SA, nowYM.y, nowYM.m, null)
check('EKSPOR: jumlah transaksi = rekap bulan itu (seluruh halaman, bukan 20 baris)', exAll.sales.length === rcNow.total_rows, `${exAll.sales.length} vs ${rcNow.total_rows}`)
check('EKSPOR: jumlah rincian barang = baris sale_items bulan itu', exAll.items.length === (await q(`select count(*)::int n from sale_items i join sales s on s.id=i.sale_id where s.created_at >= date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'`))[0].n)
check('EKSPOR: total transaksi selesai = ringkasan rekap', exAll.sales.filter((x) => x.status === 'completed').reduce((a, x) => a + x.total, 0) === rcNow.summary.total)
check('EKSPOR: tiap item terhubung ke transaksinya & jumlah per transaksi cocok', exAll.sales.every((x) => exAll.items.filter((i) => i.sale_id === x.id).reduce((a, i) => a + i.line_total, 0) === x.total))
const exK = await ex(KR.KRANGGAN, nowYM.y, nowYM.m, null)
check('EKSPOR: kasir hanya memperoleh cabangnya', exK.sales.length > 0 && exK.sales.every((x) => x.branch_name === 'Takom Kranggan'))
check('EKSPOR: kasir TIDAK bisa mengekspor cabang lain', /forbidden/.test(await err(KR.KRANGGAN, `select sales_export(${nowYM.y},${nowYM.m},'${B.PAULUS}')`) ?? ''))
check('EKSPOR: role tanpa hak rekap ditolak', /forbidden/.test(await err(PENG, `select sales_export(${nowYM.y},${nowYM.m},null)`) ?? ''))
check('EKSPOR: melebihi batas baris ditolak dengan pesan jelas', /terlalu banyak transaksi/.test(await err(SA, `select sales_export(${nowYM.y},${nowYM.m},null,1)`) ?? ''))
check('EKSPOR: setiap unduhan tercatat di audit log', (await q(`select count(*)::int n from audit_log where action='sales.export'`))[0].n >= 2)

// ---------- tutup transaksi harian ----------
const hariIni = (await q(`select to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD') d`))[0].d
const tutupSum = async (u, br, d = hariIni) => (await as(u, `select daily_close_summary(${br ? `'${B[br]}'` : 'null'}, '${d}') as r`))[0].r
const kSum = await tutupSum(KR.KRANGGAN), kDay = await rr(KR.KRANGGAN, hariIni, hariIni, null)
check('TUTUP: ringkasan hari = Rekap Penjualan hari itu (jumlah, total, tunai)',
  kSum.totals.count === kDay.summary.count && Number(kSum.totals.net) === Number(kDay.summary.total) && Number(kSum.cash_expected) === Number(kDay.by_method.cash ?? 0),
  JSON.stringify(kSum.totals) + ' vs ' + JSON.stringify(kDay.summary))
check('TUTUP: hari yang belum ditutup -> closing null', kSum.closing === null && kSum.changed_after_close === false)
const kas = Number(kSum.cash_expected) + 2500
const close1 = (await as(KR.KRANGGAN, `select close_day('${B.KRANGGAN}','${hariIni}', ${kas}, 'uji tutup kasir') as r`))[0].r
check('TUTUP: kasir menutup hari cabangnya; snapshot & selisih tersimpan',
  !!close1.closing && close1.closing.total_count === kSum.totals.count && Number(close1.closing.net) === Number(kSum.totals.net) && Number(close1.closing.cash_difference) === 2500,
  JSON.stringify(close1.closing))
check('TUTUP: menutup dua kali ditolak', /sudah ditutup/.test(await err(KR.KRANGGAN, `select close_day('${B.KRANGGAN}','${hariIni}', 0, null)`) ?? ''))
check('TUTUP: kasir lain tidak bisa menutup / melihat cabang itu',
  /forbidden/.test(await err(KR.PAULUS, `select close_day('${B.KRANGGAN}','${hariIni}', 0, null)`) ?? '') &&
  (await as(KR.PAULUS, 'select count(*)::int n from daily_closings'))[0].n === 0 &&
  (await as(KR.KRANGGAN, 'select count(*)::int n from daily_closings'))[0].n === 1)
check('TUTUP: tanggal tanpa transaksi & tanggal yang belum terjadi ditolak',
  /belum ada transaksi/.test(await err(KR.KRANGGAN, `select close_day(null,'2000-02-01',0,null)`) ?? '') &&
  /belum terjadi/.test(await err(KR.KRANGGAN, `select close_day(null,'2100-01-01',0,null)`) ?? ''))
check('TUTUP: keuangan hanya boleh melihat, pengadaan ditolak',
  // migrasi 020: menutup HANYA role kasir (pesan khusus, bukan lagi 'forbidden')
  /hanya kasir/.test(await err(KEU, `select close_day(null,'${hariIni}',0,null)`) ?? '') &&
  (await tutupSum(KEU, null)).totals.count >= 0 && /forbidden/.test(await err(PENG, `select daily_close_summary(null,'${hariIni}')`) ?? ''))
check('TUTUP: tulis langsung ke tabel ditolak', !!(await err(KR.KRANGGAN, `insert into daily_closings(branch_id, close_date, closed_by) values ('${B.KRANGGAN}','2000-01-01','${KR.KRANGGAN}')`)))

// ---------- keutuhan ----------
console.log('')
const mism = await q(`select s.branch_id, s.product_id, s.qty, coalesce(m.t,0)::int t from stock s left join (select branch_id, product_id, sum(qty_change) t from stock_movements group by 1,2) m using (branch_id, product_id) where s.qty <> coalesce(m.t,0)`)
check('KEUTUHAN: untuk setiap (cabang, produk) stok = jumlah riwayat pergerakan', mism.length === 0, `${mism.length} selisih`)
check('KEUTUHAN: tidak ada stok minus', (await q(`select count(*)::int n from stock where qty < 0`))[0].n === 0)
const bad = await q(`select s.id from sales s join sale_items i on i.sale_id=s.id group by s.id, s.subtotal, s.discount_amount, s.total
  having s.subtotal <> sum(i.unit_price*i.qty) or s.discount_amount <> sum(i.discount_amount) or s.total <> sum(i.line_total) or s.total <> s.subtotal - s.discount_amount`)
check('KEUTUHAN: subtotal/diskon/total setiap transaksi = jumlah barisnya', bad.length === 0, `${bad.length} transaksi tidak cocok`)
check('KEUTUHAN: kembalian tunai = diterima - total', (await q(`select count(*)::int n from sales where payment_method='cash' and change_amount <> cash_received - total`))[0].n === 0)
const bra = await q(`select count(*)::int n from sales s join profiles p on p.id=s.cashier_id join roles r on r.id=p.role_id where r.name='kasir' and s.branch_id <> p.branch_id`)
check('KEUTUHAN: transaksi kasir selalu tercatat di cabangnya sendiri', bra[0].n === 0)
const sold = await q(`select coalesce(sum(i.qty),0)::int n from sale_items i join sales s on s.id=i.sale_id where s.status='completed'`)
const mv = await q(`select coalesce(sum(qty_change) filter (where reason in ('sale','void')),0)::int n from stock_movements`)
check('KEUTUHAN: pergerakan "sale"+"void" = -(jumlah barang terjual yang sah)', mv[0].n === -sold[0].n, `${mv[0].n} vs ${-sold[0].n}`)
const transferNet = await q(`select coalesce(sum(qty_change) filter (where reason in ('transfer_in','transfer_out')),0)::int n from stock_movements`)
check('KEUTUHAN: mutasi stok tidak mengubah total global (net 0)', transferNet[0].n === 0)
const au = await q(`select count(*)::int n from audit_log where action in ('sale.create','sale.void','stock.import','stock.transfer','stock.set','print_template.save','sales.export')`)
check('audit log mencatat penjualan/void/impor/mutasi', au[0].n > 0, String(au[0].n))

console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`)
process.exit(fail ? 1 : 0)
