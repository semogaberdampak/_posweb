// Uji Keuangan (finance_summary) dengan data kecil yang angkanya bisa dihitung tangan. Jalankan: npm run test:finance
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
for (const f of fs.readdirSync(path.join(ROOT, 'supabase/manual_migrations')).sort()) await db.exec(rd('supabase/manual_migrations/' + f))
await db.exec(`insert into branches(code,name,is_pusat) values ('KRANGGAN','Takom Kranggan',false),('PAULUS','Takom Paulus',false)`)
const B = Object.fromEntries((await q('select code,id from branches')).map((r) => [r.code, r.id]))
const U = { K: 1, P: 2, KEU: 3, KABAG: 4, SA: 5, PENG: 6 }
const spec = [[1, 'k', 'KRANGGAN', 'kasir'], [2, 'p', 'PAULUS', 'kasir'], [3, 'keu', 'PUSAT', 'keuangan'], [4, 'kabag', 'PUSAT', 'kabag'], [5, 'sa', 'PUSAT', 'superadmin'], [6, 'peng', 'PUSAT', 'pengadaan']]
for (const [n, e, cab, role] of spec) await db.exec(`insert into auth.users values ('${uid(n)}','${e}@takom.id'); insert into profiles(id,full_name,branch_id,role_id) select '${uid(n)}','${e}','${B[cab]}',(select id from roles where name='${role}')`)

// produk & modal: A lastCost sah; B Price1 = harga jual (tidak sah); C Price1 sah; D tanpa modal; E lastCost >= harga (tidak sah) tapi Price1 sah
const prods = { A: [10000, [{ k: 'lastCost', v: 6000 }, { k: 'Price1', v: 9000 }]], B: [20000, [{ k: 'Price1', v: 20000 }]], C: [50000, [{ k: 'Price1', v: 30000 }, { k: 'lastCost', v: 0 }]], D: [8000, null], E: [12000, [{ k: 'lastCost', v: 15000 }, { k: 'Price1', v: 9000 }]] }
const P = {}
for (const [c, [price, cost]] of Object.entries(prods)) {
  P[c] = (await q(`insert into products(code,name,price) values ('${c}','Produk ${c}',${price}) returning id`))[0].id
  if (cost) await db.exec(`insert into product_costs(product_id, attributes) values ('${P[c]}', ${lit(cost)})`)
  for (const br of ['KRANGGAN', 'PAULUS']) await as(uid(U.PENG), `select set_stock('${B[br]}','${P[c]}',100,'awal')`)
}
const sell = async (user, items, method, cash) => (await as(uid(user), `select create_sale(${lit(items.map(([c, n, d]) => ({ product_id: P[c], qty: n, discount_pct: d ?? 0 })))}, ${items.some((i) => i[2]) ? "'M-1'" : 'null'}, '${method}', ${cash ?? 'null'}, null) as r`))[0].r
const s1 = await sell(U.K, [['A', 2], ['B', 1]], 'cash', 40000)
const s2 = await sell(U.K, [['C', 1, 10]], 'qris')
const s3 = await sell(U.P, [['D', 5]], 'debit')
const s4 = await sell(U.P, [['E', 3, 5]], 'credit_card')
const s5 = await sell(U.K, [['A', 1]], 'qris')
await as(uid(U.KABAG), `select void_sale('${s5.sale_id}','salah')`)
const now = (await q(`select extract(year from now() at time zone 'Asia/Jakarta')::int y, extract(month from now() at time zone 'Asia/Jakarta')::int m`))[0]
const fin = async (u, y, m, br) => (await as(uid(u), `select finance_summary(${y},${m},${br ? `'${B[br]}'` : 'null'}) as r`))[0].r

let f = await fin(U.KEU, now.y, now.m)
const T = f.totals
t('TOTAL: 4 transaksi selesai, kotor 166.000, diskon 6.800, bersih 159.200', T.count === 4 && T.gross === 166000 && T.discount === 6800 && T.net === 159200, JSON.stringify(T))
t('TOTAL: void dipisah (1 transaksi, Rp 10.000) dan tidak masuk bersih', T.void_count === 1 && T.void_total === 10000)
const M = Object.fromEntries(f.by_method.map((x) => [x.method, x]))
t('PER METODE: tunai 40.000, QRIS 45.000, debit 40.000, kartu kredit 34.200 (void QRIS tidak ikut)', M.cash.net === 40000 && M.qris.net === 45000 && M.debit.net === 40000 && M.credit_card.net === 34200 && M.qris.count === 1, JSON.stringify(f.by_method))
t('PER METODE: jumlah = bersih', f.by_method.reduce((a, x) => a + x.net, 0) === T.net)
const BR = Object.fromEntries(f.by_branch.map((x) => [x.branch, x]))
t('PER CABANG: Kranggan 85.000 (2), Paulus 74.200 (2)', BR['Takom Kranggan'].net === 85000 && BR['Takom Kranggan'].count === 2 && BR['Takom Paulus'].net === 74200, JSON.stringify(f.by_branch))
t('PER HARI: satu hari (hari ini WIB) = 4 transaksi 159.200', f.by_day.length === 1 && f.by_day[0].count === 4 && f.by_day[0].net === 159200 && /^\d{4}-\d{2}-\d{2}$/.test(f.by_day[0].date))
const G = f.margin
t('LABA: omzet bermodal 99.200, modal 69.000 (A lastCost 6.000×2, C Price1 30.000, E Price1 9.000×3), laba 30.200', G.revenue_covered === 99200 && G.cost === 69000 && G.revenue_covered - G.cost === 30200, JSON.stringify(G))
t('LABA PENJAGA: B (Price1 = harga jual) & D (tanpa modal) tidak dihitung; E memakai Price1 karena lastCost > harga', G.lines === 5 && G.lines_no_cost === 2 && G.revenue_all === 159200, JSON.stringify(G))
const fk = await fin(U.KEU, now.y, now.m, 'KRANGGAN')
t('FILTER CABANG: Kranggan saja = 85.000; laba Kranggan = A(20.000-12.000) + C(45.000-30.000)', fk.totals.net === 85000 && fk.margin.revenue_covered === 65000 && fk.margin.cost === 42000, JSON.stringify(fk.margin))
t('SUPERADMIN bisa; hasil sama dengan keuangan', (await fin(U.SA, now.y, now.m)).totals.net === 159200)

// hak akses
t('HAK: kasir, kabag, pengadaan (tanpa hak finance) ditolak', (await Promise.all([])).length === 0 && /forbidden/.test(await err(uid(U.K), `select finance_summary(${now.y},${now.m},null)`) ?? '') && /forbidden/.test(await err(uid(U.KABAG), `select finance_summary(${now.y},${now.m},null)`) ?? '') && /forbidden/.test(await err(uid(U.PENG), `select finance_summary(${now.y},${now.m},null)`) ?? ''))
await db.exec(`insert into user_permissions(user_id, feature_key, can_read) values ('${uid(U.KEU)}','cost_prices', false)`)
f = await fin(U.KEU, now.y, now.m)
t('HARGA BELI RAHASIA: keuangan tanpa hak cost_prices tetap melihat omzet, tetapi laba = null', f.totals.net === 159200 && f.margin === null, JSON.stringify(f.margin))
t('parameter tidak valid ditolak', /tidak valid/.test(await err(uid(U.KEU), `select finance_summary(${now.y},13,null)`) ?? ''))
t('fungsi pembantu _cost_val tidak bisa dipanggil langsung oleh user', !!(await err(uid(U.KEU), `select _cost_val('[{"k":"Price1","v":5}]'::jsonb,'Price1')`)))
t('data kotor: nilai teks rusak / negatif / 0 → dianggap tidak ada', (await q(`select _cost_val('[{"k":"Price1","v":"abc"}]','Price1') a, _cost_val('[{"k":"Price1","v":0}]','Price1') b, _cost_val('[{"k":"Price1","v":-5}]','Price1') c, _cost_val('{"x":1}','Price1') d, _cost_val(null,'Price1') e, _cost_val('[{"k":"Price1","v":"20000.5"}]','Price1') f`)).every((r) => r.a === null && r.b === null && r.c === null && r.d === null && r.e === null && Number(r.f) === 20000.5))

// batas bulan WIB
await db.exec(`update sales set created_at='2026-02-28 16:59:59+00' where id='${s2.sale_id}'; update sales set created_at='2026-02-28 17:00:00+00' where id='${s1.sale_id}'`)
await db.exec(`delete from user_permissions`)
const feb = await fin(U.KEU, 2026, 2), mar = await fin(U.KEU, 2026, 3)
t('BULAN WIB: 28 Feb 23:59:59 → Februari (45.000), 1 Mar 00:00 → Maret (40.000)', feb.totals.net === 45000 && feb.by_day[0].date === '2026-02-28' && mar.totals.net === 40000 && mar.by_day[0].date === '2026-03-01', JSON.stringify([feb.totals, mar.totals]))
const empty = await fin(U.KEU, 2026, 5)
t('bulan kosong: semua nol/daftar kosong', empty.totals.net === 0 && empty.by_method.length === 0 && empty.by_day.length === 0 && empty.margin.lines === 0)
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
