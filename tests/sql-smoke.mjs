// Uji asap (smoke test) semua SQL di Postgres tiruan (PGlite): migrasi, RLS, create_sale, stok.
// Jalankan: npm run test:sql   (tidak butuh Supabase / internet)
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sql = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const db = new PGlite({ extensions: { pg_trgm } })
const run = async (label, sql) => { try { await db.exec(sql); console.log('OK  ', label) } catch (e) { console.log('FAIL', label, '->', e.message); process.exit(1) } }
await run('stub supabase', `
 create role anon nologin; create role authenticated nologin;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema public to anon, authenticated; grant usage on schema auth to authenticated;
 grant execute on function auth.uid() to anon, authenticated;`)
await run('schema.sql', sql('supabase/schema.sql'))
await run('002', sql('supabase/migrations/002_products_import.sql'))
// data lama seperti hasil impor 002 (masih ada Price1 di attributes)
await run('seed', `
 insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
 insert into profiles(id,full_name,branch_id,role_id) select '00000000-0000-0000-0000-000000000001','Kasir',(select id from branches where code='PUSAT'),(select id from roles where name='kasir');
 insert into profiles(id,full_name,branch_id,role_id) select '00000000-0000-0000-0000-000000000002','Pengadaan',(select id from branches where code='PUSAT'),(select id from roles where name='pengadaan');
 insert into profiles(id,full_name,branch_id,role_id) select '00000000-0000-0000-0000-000000000003','Keuangan',(select id from branches where code='PUSAT'),(select id from roles where name='keuangan');
 insert into products(code,name,price,author,attributes) values
  ('A1','Buku A',10000,'X','[{"k":"Divisi Id","v":1},{"k":"Price1","v":6000},{"k":"lastCost","v":5000},{"k":"prod ISBN","v":"979"}]'),
  ('B2','Buku B',5000,null,'[{"k":"prod ISBN","v":"978"}]');
 insert into stock select (select id from branches where code='PUSAT'), id, 10 from products;`)
await run('003', sql('supabase/migrations/003_costs_and_line_discount.sql'))
await run('003 ulang (idempoten)', sql('supabase/migrations/003_costs_and_line_discount.sql'))

await run('004', sql('supabase/migrations/004_stock_views.sql'))
await run('004 ulang', sql('supabase/migrations/004_stock_views.sql'))
const q = async (sql) => (await db.query(sql)).rows
console.log('A1 attributes setelah migrasi:', JSON.stringify((await q(`select attributes from products where code='A1'`))[0].attributes))
console.log('costs A1:', JSON.stringify((await q(`select c.attributes from product_costs c join products p on p.id=c.product_id where p.code='A1'`))[0].attributes))

const as = async (n, sql) => { await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000${n}'; set role authenticated;`); try { return await q(sql) } finally { await db.exec(`reset role;`) } }
console.log('kasir lihat product_costs  :', (await as(1,'select * from product_costs')).length, 'baris (harus 0)')
console.log('pengadaan lihat costs      :', (await as(2,'select * from product_costs')).length, 'baris (harus 1)')
console.log('keuangan lihat costs       :', (await as(3,'select * from product_costs')).length, 'baris (harus 1)')

const items = (arr) => JSON.stringify(arr).replace(/'/g,"''")
const A = (await q(`select id from products where code='A1'`))[0].id, B = (await q(`select id from products where code='B2'`))[0].id
const sale = async (n, arr, member, method, cash) => { try { return await as(n, `select create_sale('${items(arr)}'::jsonb, ${member===null?'null':`'${member}'`}, '${method}', ${cash??'null'}) as r`) } catch (e) { return 'ERR: ' + e.message } }
console.log('1) diskon per produk:', JSON.stringify((await sale(1,[{product_id:A,qty:2,discount_pct:10},{product_id:B,qty:1,discount_pct:0}],'M-001','cash',50000))[0]?.r))
console.log('2) diskon tanpa member:', await sale(1,[{product_id:A,qty:1,discount_pct:5}],'','qris'))
console.log('3) diskon 12% ditolak :', await sale(1,[{product_id:A,qty:1,discount_pct:12}],'M','qris'))
console.log('4) stok kurang        :', await sale(1,[{product_id:A,qty:99,discount_pct:0}],null,'qris'))
console.log('5) pengadaan tak boleh jual:', await sale(2,[{product_id:A,qty:1,discount_pct:0}],null,'qris'))
console.log('stok A1 sekarang (10-2=8):', (await q(`select qty from stock s join products p on p.id=s.product_id where p.code='A1'`))[0].qty)
console.log('sale_items:', JSON.stringify(await q(`select code,qty,unit_price,discount_pct,discount_amount,line_total from sale_items order by code`)))
console.log('sales:', JSON.stringify(await q(`select subtotal,discount_amount,total,cash_received,change_amount from sales`)))

// ===== uji 004 =====
await run('seed cabang', `
 insert into branches(code,name) values ('CAB1','Cabang Satu');
 insert into stock select (select id from branches where code='CAB1'), id, 7 from products where code='A1';
 insert into roles(name,all_branches) values ('gudang',false);
 insert into role_permissions select (select id from roles where name='gudang'),'stock',false,true,true,false;
 insert into auth.users values ('00000000-0000-0000-0000-000000000004');
 insert into profiles(id,full_name,branch_id,role_id) select '00000000-0000-0000-0000-000000000004','Gudang',(select id from branches where code='PUSAT'),(select id from roles where name='gudang');`)
console.log('A1 attributes (tanpa stok):', JSON.stringify((await q(`select attributes from products where code='A1'`))[0].attributes))
console.log('kasir lihat stok semua toko A1:', JSON.stringify(await as(1, `select branch_code, qty from stock_by_branch('${A}')`)))
console.log('kasir baca tabel stock langsung (hanya cabangnya):', JSON.stringify(await as(1, `select qty from stock`)))
const call = async (n, sql) => { try { await as(n, sql); return 'OK' } catch (e) { return 'ERR: ' + e.message } }
console.log('pengadaan set_stock A1 PUSAT=20 :', await call(2, `select set_stock((select id from branches where code='PUSAT'),'${A}',20,'hitung fisik')`))
console.log('pengadaan barang masuk +5 CAB1  :', await call(2, `select adjust_stock((select id from branches where code='CAB1'),'${A}',5,'receive')`))
console.log('barang masuk negatif ditolak     :', await call(2, `select adjust_stock((select id from branches where code='CAB1'),'${A}',-5,'receive')`))
console.log('kasir tak boleh set_stock        :', await call(1, `select set_stock((select id from branches where code='PUSAT'),'${A}',99,null)`))
console.log('gudang (cabang PUSAT) ke CAB1    :', await call(4, `select adjust_stock((select id from branches where code='CAB1'),'${A}',5,'receive')`))
console.log('gudang ke PUSAT (cabangnya)      :', await call(4, `select adjust_stock((select id from branches where code='PUSAT'),'${A}',1,'receive')`))
console.log('stok A1 per cabang:', JSON.stringify(await q(`select b.code, s.qty from stock s join branches b on b.id=s.branch_id join products p on p.id=s.product_id where p.code='A1' order by 1`)), '(harus PUSAT 21, CAB1 12)')
console.log('movements:', JSON.stringify(await q(`select reason, qty_change, note from stock_movements where reason in ('opname','receive') order by id`)))
