// Uji singkatan cabang + produk terlaris (migrasi 016). Jalankan: npm run test:top
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const db = new PGlite({ extensions: { pg_trgm } })
const q = async (s) => (await db.query(s)).rows
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`
async function as(u, s) { await db.exec(`set request.jwt.claim.sub='${u}'; set role authenticated;`); try { return await q(s) } catch (e) { throw new Error(e.message) } finally { await db.exec('reset role;') } }
const err = async (u, s) => { try { await as(u, s); return null } catch (e) { return e.message } }
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
 create schema auth; create table auth.users(id uuid primary key, email text); create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema public to anon, authenticated; grant usage on schema auth to authenticated; grant execute on function auth.uid() to anon, authenticated;`)
await db.exec(rd('supabase/schema.sql'))
const files = fs.readdirSync(path.join(ROOT, 'supabase/manual_migrations')).sort()
for (const f of files.filter((f) => f < '016')) await db.exec(rd('supabase/manual_migrations/' + f))
// cabang SUDAH ada sebelum 016 dijalankan (seperti database pemilik)
await db.exec(`insert into branches(code,name,is_pusat) values ('KRANGGAN','Takom Kranggan',false),('KATEDRAL','Takom Katedral',false),('PAULUS','Takom Paulus',false),('SANTAMARIA','Takom Santa Maria',false),('ATHANASIUS','Takom Athanasius',false),('ANTONIUS','Takom Antonius',false),('BARU','Takom Baru',false)`)
for (const f of files.filter((f) => f >= '016')) await db.exec(rd('supabase/manual_migrations/' + f))
const short = Object.fromEntries((await q('select code, short_name from branches')).map((r) => [r.code, r.short_name]))
t('SINGKATAN terisi sesuai daftar pemilik (TKSAP, TKSP, Kranggan, Katedral, TKSM, TKSAA, PUSAT)', short.ANTONIUS === 'TKSAP' && short.PAULUS === 'TKSP' && short.KRANGGAN === 'Kranggan' && short.KATEDRAL === 'Katedral' && short.SANTAMARIA === 'TKSM' && short.ATHANASIUS === 'TKSAA' && short.PUSAT === 'PUSAT', JSON.stringify(short))
t('cabang baru tanpa singkatan = null (UI memakai nama lengkap)', short.BARU === null)
let e = ''; try { await db.exec(`update branches set short_name='ABCDEFGHIJKLM' where code='BARU'`) } catch (x) { e = x.message }
t('singkatan >12 huruf ditolak oleh database', /check/i.test(e))
await db.exec(rd('supabase/manual_migrations/016_branch_short_top_products.sql'))
t('016 aman dijalankan ulang (idempoten)', true)

const B = Object.fromEntries((await q('select code,id from branches')).map((r) => [r.code, r.id]))
const spec = [[1, 'ka', 'ANTONIUS', 'kasir'], [2, 'kp', 'PAULUS', 'kasir'], [3, 'sa', 'PUSAT', 'superadmin'], [4, 'peng', 'PUSAT', 'pengadaan'], [5, 'kabag', 'PUSAT', 'kabag']]
for (const [n, em, cab, role] of spec) await db.exec(`insert into auth.users values ('${uid(n)}','${em}@takom.id'); insert into profiles(id,full_name,branch_id,role_id) select '${uid(n)}','${em}','${B[cab]}',(select id from roles where name='${role}')`)
const P = {}
for (const c of ['A', 'B', 'C', 'D', 'E']) {
  P[c] = (await q(`insert into products(code,name,price) values ('${c}','Produk ${c}',10000) returning id`))[0].id
  for (const br of ['ANTONIUS', 'PAULUS']) await as(uid(4), `select set_stock('${B[br]}','${P[c]}',200,'awal')`)
}
const sell = async (user, items) => (await as(uid(user), `select create_sale(${lit(items.map(([c, n]) => ({ product_id: P[c], qty: n, discount_pct: 0 })))}, null, 'qris', null, null) as r`))[0].r
await sell(1, [['A', 3]]); await sell(1, [['A', 2], ['C', 2]]); await sell(1, [['B', 4]]); await sell(1, [['C', 2]])   // Antonius: A=5(2 nota) C=4(2 nota) B=4(1 nota)
await sell(2, [['D', 1], ['E', 9]])                                                                                     // Paulus : E=9 D=1
const voided = await sell(1, [['A', 10]]); await as(uid(5), `select void_sale('${voided.sale_id}','salah')`)             // void: tidak dihitung
const today = (await q(`select to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD') d`))[0].d
const top = async (u, a, b, br, lim = 10) => (await as(uid(u), `select top_products('${a}','${b}',${br ? `'${B[br]}'` : 'null'},${lim}) as r`))[0].r
let r = await top(1, today, today, null)
t('URUTAN: A(5) > C(4, 2 nota) > B(4, 1 nota) — seri qty dipecah oleh jumlah nota', r.map((x) => `${x.code}:${x.qty}`).join() === 'A:5,C:4,B:4', JSON.stringify(r))
t('VOID tidak dihitung (A bukan 15)', r[0].qty === 5 && r[0].trx === 2)
t('SCOPE: kasir Antonius hanya melihat cabangnya (tanpa D/E milik Paulus)', !r.some((x) => x.code === 'D' || x.code === 'E'))
r = await top(3, today, today, null)
t('SUPERADMIN semua cabang: E(9) A(5) C(4) B(4) D(1)', r.map((x) => `${x.code}:${x.qty}`).join() === 'E:9,A:5,C:4,B:4,D:1', JSON.stringify(r))
r = await top(3, today, today, 'PAULUS')
t('SUPERADMIN pilih cabang Paulus: E(9), D(1)', r.map((x) => `${x.code}:${x.qty}`).join() === 'E:9,D:1')
t('LIMIT: 2 teratas saja', (await top(3, today, today, null, 2)).length === 2)
t('kasir TIDAK bisa melihat cabang lain', /forbidden/.test(await err(uid(1), `select top_products('${today}','${today}','${B.PAULUS}')`) ?? ''))
t('role tanpa hak pos/sales_recap (pengadaan) ditolak', /forbidden/.test(await err(uid(4), `select top_products('${today}','${today}')`) ?? ''))
t('parameter tidak valid: limit 0/51, tanggal null, terbalik, >366 hari', /tidak valid/.test(await err(uid(3), `select top_products('${today}','${today}',null,0)`) ?? '') && /tidak valid/.test(await err(uid(3), `select top_products('${today}','${today}',null,51)`) ?? '') && /tidak valid/.test(await err(uid(3), `select top_products(null,'${today}')`) ?? '') && /tanggal awal/.test(await err(uid(3), `select top_products('2026-03-02','2026-03-01')`) ?? '') && /maksimal 366/.test(await err(uid(3), `select top_products('2026-01-01','2027-01-02')`) ?? ''))
// periode: pindahkan satu nota ke bulan lalu (WIB) -> keluar dari "hari ini"/bulan ini, masuk ke rentang lama
const old = (await q(`select s.id from sales s join sale_items i on i.sale_id=s.id where i.product_id='${P.B}' and s.status='completed' limit 1`))[0].id
await db.exec(`update sales set created_at = '2026-02-28 16:59:59+00' where id='${old}'`)
r = await top(3, today, today, 'ANTONIUS')
t('PERIODE: nota yang dipindah ke 28 Feb tidak lagi muncul hari ini (B hilang)', !r.some((x) => x.code === 'B'))
r = await top(3, '2026-02-28', '2026-02-28', null)
t('PERIODE: rentang 28 Feb memuat nota 23:59:59 WIB itu (B=4)', r.length === 1 && r[0].code === 'B' && r[0].qty === 4)
t('PERIODE: 1 Mar saja kosong (nota itu masih 28 Feb WIB)', (await top(3, '2026-03-01', '2026-03-01', null)).length === 0)
t('TAHUNAN: 1 Jan–31 Des 2026 memuat nota Februari', (await top(3, '2026-01-01', '2026-12-31', null)).some((x) => x.code === 'B'))
t('hasil bulan kosong = [] (bukan error)', JSON.stringify(await top(3, '2026-05-01', '2026-05-31', null)) === '[]')
const sb = (await as(uid(1), `select * from stock_by_branch('${P.A}')`))
t('stock_by_branch membawa singkatan; cabang tanpa singkatan memakai nama', sb.find((x) => x.branch_code === 'ANTONIUS').branch_short === 'TKSAP' && sb.find((x) => x.branch_code === 'BARU').branch_short === 'Takom Baru' && sb.length === 8, JSON.stringify(sb.map((x) => x.branch_short)))
t('stock_by_branch: kasir tetap melihat stok semua toko; jumlah stok benar (Antonius 200-5-10+10=195)', sb.find((x) => x.branch_code === 'ANTONIUS').qty === 195, String(sb.find((x) => x.branch_code === 'ANTONIUS').qty))
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
