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
 create role anon nologin; create role authenticated nologin; create role service_role nologin;
 create schema auth; create table auth.users(id uuid primary key, email text); create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema public to anon, authenticated; grant usage on schema auth to authenticated;
 grant execute on function auth.uid() to anon, authenticated;`)
await run('schema.sql', sql('supabase/schema.sql'))
await run('002', sql('supabase/manual_migrations/002_products_import.sql'))
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
await run('003', sql('supabase/manual_migrations/003_costs_and_line_discount.sql'))
await run('003 ulang (idempoten)', sql('supabase/manual_migrations/003_costs_and_line_discount.sql'))

await run('004', sql('supabase/manual_migrations/004_stock_views.sql'))
await run('004 ulang', sql('supabase/manual_migrations/004_stock_views.sql'))
await run('005', sql('supabase/manual_migrations/005_user_permissions.sql'))
await run('005 ulang', sql('supabase/manual_migrations/005_user_permissions.sql'))
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

// ===== uji 005: hak granular =====
await run('seed superadmin', `
 insert into auth.users values ('00000000-0000-0000-0000-000000000005','sa@x.id');
 insert into profiles(id,full_name,branch_id,role_id) select '00000000-0000-0000-0000-000000000005','Super',(select id from branches where code='PUSAT'),(select id from roles where name='superadmin');`)
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`
const kasirRole = (await q(`select id from roles where name='kasir'`))[0].id, pusat = (await q(`select id from branches where code='PUSAT'`))[0].id
const hp = async (n, f, a) => (await as(n, `select has_perm('${f}','${a}') as v`))[0].v
console.log('kasir ubah hak role -> forbidden        :', await call(1, `select set_role_permission('${kasirRole}','products',false,true,false,false)`))
console.log('superadmin beri kasir products.read     :', await call(5, `select set_role_permission('${kasirRole}','products',false,true,false,false)`), '| kasir has_perm products.r =', await hp(1,'products','r'))
console.log('superadmin ubah role superadmin ditolak :', await call(5, `select set_role_permission((select id from roles where name='superadmin'),'pos',false,false,false,false)`))
console.log('c/u/d tanpa read otomatis dapat read    :', await call(5, `select set_role_permission('${kasirRole}','members',true,false,false,false)`), '| members.r =', await hp(1,'members','r'))
console.log('override kasir pos.create=false         :', await call(5, `select set_user_permission('${U(1)}','pos',false,null,null,null)`), '| kasir pos.c =', await hp(1,'pos','c'), '(harus false)')
console.log('kasir jual saat dilarang                :', await sale(1,[{product_id:A,qty:1,discount_pct:0}],null,'qris'))
console.log('hapus override (semua null)             :', await call(5, `select set_user_permission('${U(1)}','pos',null,null,null,null)`), '| kasir pos.c =', await hp(1,'pos','c'), '(harus true)')
console.log('ubah hak diri sendiri ditolak           :', await call(5, `select set_user_permission('${U(5)}','pos',false,false,false,false)`))
console.log('ganti role diri sendiri ditolak         :', await call(5, `select set_user_role('${U(5)}','${kasirRole}','${pusat}')`))
console.log('pindah role kasir -> pengadaan          :', await call(5, `select set_user_role('${U(1)}',(select id from roles where name='pengadaan'),'${pusat}')`))
console.log('nonaktifkan user -> has_perm false      :', await call(5, `select set_user_active('${U(1)}',false)`), '| pos.r =', await hp(1,'pos','r'), '(harus false)')
console.log('tulis langsung role_permissions ditolak :', await call(5, `update role_permissions set can_delete=true`))
console.log('list_users superadmin / kasir           :', (await as(5,'select * from list_users()')).length, '/', (await as(3,'select * from list_users()')).length, '(kedua bukan 0 / harus 0)')
console.log('buat role baru oleh superadmin          :', await call(5, `select create_role('supervisor kasir','approve void',false)`), '| role sama lagi:', await call(5, `select create_role('supervisor kasir','x',false)`))

// ===== uji 006: domain email =====
await run('006', sql('supabase/manual_migrations/006_email_domain.sql'))
await run('006 ulang', sql('supabase/manual_migrations/006_email_domain.sql'))
const ins = async (email) => { try { await db.exec(`insert into auth.users(id,email) values (gen_random_uuid(), ${email===null?'null':`'${email}'`})`); return 'DITERIMA' } catch (e) { return 'DITOLAK: ' + e.message } }
console.log('siti@takom.id            :', await ins('siti@takom.id'))
console.log('SITI.K@TAKOM.ID (kapital):', await ins('SITI.K@TAKOM.ID'))
console.log('budi@gmail.com           :', await ins('budi@gmail.com'))
console.log('x@takom.id.evil.com      :', await ins('x@takom.id.evil.com'))
console.log('x@sub.takom.id           :', await ins('x@sub.takom.id'))
console.log('tanpa email (null)       :', await ins(null))

// ===== uji 007: keluarkan sesi =====
await run('007', sql('supabase/manual_migrations/007_revoke_sessions.sql'))
await run('007 ulang', sql('supabase/manual_migrations/007_revoke_sessions.sql'))
await run('seed sesi', `insert into auth.sessions(user_id) values ('${U(1)}'),('${U(1)}'),('${U(2)}');`)
console.log('user biasa memanggil revoke_user_sessions:', await call(1, `select revoke_user_sessions('${U(1)}')`))
await db.exec(`set role service_role`)
let r7 = 'OK'; try { await db.exec(`select revoke_user_sessions('${U(1)}')`) } catch (e) { r7 = 'ERR: ' + e.message }
await db.exec(`reset role`)
console.log('service_role memanggil                    :', r7, '| sesi tersisa:', JSON.stringify(await q(`select user_id from auth.sessions`)), '(harus hanya user 2)')

// ===== uji 008: cabang aktif =====
await run('008', sql('supabase/manual_migrations/008_active_branch.sql'))
await run('008 ulang', sql('supabase/manual_migrations/008_active_branch.sql'))
await db.exec(`update profiles set is_active = true where id = '${U(1)}'; update user_permissions set can_create = null where user_id = '${U(1)}'; update profiles set role_id = '${kasirRole}' where id = '${U(1)}'`)
const cab1 = (await q(`select id from branches where code='CAB1'`))[0].id
const stockAt = async (code, br) => (await q(`select s.qty from stock s join products p on p.id=s.product_id join branches b on b.id=s.branch_id where p.code='${code}' and b.code='${br}'`))[0]?.qty
const sale5 = async (n, branch) => { try { return JSON.stringify((await as(n, `select create_sale('${items([{product_id:A,qty:2,discount_pct:0}])}'::jsonb, null, 'qris', null, ${branch?`'${branch}'`:'null'}) as r`))[0].r.invoice_no) } catch (e) { return 'ERR: ' + e.message } }
console.log('my_scope superadmin / kasir          :', JSON.stringify(await as(5,'select * from my_scope()')), JSON.stringify(await as(1,'select * from my_scope()')))
const before = await stockAt('A1','CAB1')
console.log('superadmin jual atas nama CAB1       :', await sale5(5, cab1), '| stok CAB1', before, '->', await stockAt('A1','CAB1'), '(harus turun 2)')
console.log('kasir jual cabang lain (CAB1) ditolak:', await sale5(1, cab1))
console.log('kasir jual cabangnya sendiri (null)  :', await sale5(1, null))
console.log('cabang tidak valid ditolak           :', await sale5(5, '00000000-0000-0000-0000-0000000000aa'))
console.log('sales tercatat di cabang?            :', JSON.stringify(await q(`select b.code, count(*)::int n from sales s join branches b on b.id=s.branch_id group by 1 order by 1`)))
// ===== uji 017: idempotensi create_sale =====
await run('017', sql('supabase/manual_migrations/017_sale_idempotency.sql'))
await run('017 ulang', sql('supabase/manual_migrations/017_sale_idempotency.sql'))
const rid = '11111111-1111-4111-8111-111111111111'
const saleIdem = async (n, key) => {
  try { return JSON.stringify((await as(n, `select create_sale('${items([{product_id:A,qty:1,discount_pct:0}])}'::jsonb, null, 'qris', null, null, ${key ? `'${key}'` : 'null'}) as r`))[0].r) }
  catch (e) { return 'ERR: ' + e.message }
}
const pusat0 = await stockAt('A1','PUSAT')
const idem1 = await saleIdem(5, rid), pusat1 = await stockAt('A1','PUSAT')
const idem2 = await saleIdem(5, rid), pusat2 = await stockAt('A1','PUSAT')
console.log('idem kirim ulang kunci sama       :', idem1 === idem2, '| stok PUSAT', pusat0, '->', pusat1, '->', pusat2, '(harus turun 1 saja)')
console.log('idem baris bertanda kunci itu     :', JSON.stringify(await q(`select count(*)::int n from sales where request_id = '${rid}'`)), '(harus 1)')
console.log('idem kunci sama oleh kasir lain   :', await saleIdem(1, rid))
console.log('idem tanpa kunci tetap bisa       :', (await saleIdem(5, null)).slice(0, 26) + '…')

// ===== uji 018: tutup transaksi harian =====
await run('018', sql('supabase/manual_migrations/018_daily_close.sql'))
await run('018 ulang (idempoten)', sql('supabase/manual_migrations/018_daily_close.sql'))
const today = (await q(`select (now() at time zone 'Asia/Jakarta')::date::text d`))[0].d
const pusatDay = (await q(`select count(*) filter (where status='completed')::int c,
  coalesce(sum(total) filter (where status='completed'),0)::int net,
  coalesce(sum(total) filter (where status='completed' and payment_method='cash'),0)::int cash
  from sales where branch_id='${pusat}' and created_at >= '${today}'::date::timestamp at time zone 'Asia/Jakarta'
   and created_at < ('${today}'::date + 1)::timestamp at time zone 'Asia/Jakarta'`))[0]
const dsum = async (n, br, d = today) => { try { return (await as(n, `select daily_close_summary(${br ? `'${br}'` : 'null'}, '${d}') as r`))[0].r } catch (e) { return 'ERR: ' + e.message } }
const kSum = await dsum(1, null)
console.log('TUTUP: ringkasan kasir = hitungan langsung tabel sales :', kSum.totals.count, '/', pusatDay.c, '| total', kSum.totals.net, '/', pusatDay.net, '| tunai', kSum.cash_expected, '/', pusatDay.cash)
console.log('TUTUP: keuangan boleh melihat ringkasan             :', (await dsum(3, null)).branch_name)
console.log('TUTUP: pengadaan (tanpa hak daily_close) ditolak     :', await dsum(2, null))
const cashPlus = pusatDay.cash + 1500
console.log('TUTUP: kasir menutup hari ini                        :', JSON.stringify((await as(1, `select close_day(null, '${today}', ${cashPlus}, 'uji tutup') as r`))[0].r.closing))
console.log('TUTUP: menutup ulang ditolak                        :', await call(1, `select close_day(null, '${today}', 0, null)`))
console.log('TUTUP: tanggal tanpa transaksi ditolak              :', await call(1, `select close_day(null, '2001-01-01', 0, null)`))
console.log('TUTUP: tanggal yang belum terjadi ditolak           :', await call(1, `select close_day(null, '2100-01-01', 0, null)`))
console.log('TUTUP: keuangan TIDAK boleh menutup                :', await call(3, `select close_day(null, '${today}', 0, null)`))
console.log('TUTUP: superadmin boleh melihat cabang lain         :', await call(5, `select daily_close_summary('${cab1}', '${today}')`))
console.log('TUTUP: kasir cabang lain ditolak                    :', await call(1, `select close_day('${cab1}', '${today}', 0, null)`))
console.log('TUTUP: baca tabel: kasir PUSAT / CAB1               :', (await as(1, 'select * from daily_closings')).length, '/', (await as(4, 'select * from daily_closings')).length, '(harus 1 / 0)')
console.log('TUTUP: tulis langsung ke tabel ditolak              :', await call(1, `insert into daily_closings(branch_id, close_date, closed_by) values ('${pusat}', '2001-01-01', '${U(1)}')`))
console.log('TUTUP: tercatat di audit log                        :', (await q(`select count(*)::int n from audit_log where action='daily.close'`))[0].n >= 1)

// ===== uji 019: status tutup kasir per hari (halaman Rekap) =====
await run('019', sql('supabase/manual_migrations/019_closing_status.sql'))
await run('019 ulang (idempoten)', sql('supabase/manual_migrations/019_closing_status.sql'))
const cstat = async (n, br) => { try { return (await as(n, `select closing_status('${today}', '${today}', ${br ? `'${br}'` : 'null'}) as r`))[0].r } catch (e) { return 'ERR: ' + e.message } }
const cAll = await cstat(3, null)
const cPusat = cAll.days.find((d) => d.branch_id === pusat), cCab1 = cAll.days.find((d) => d.branch_id === cab1)
console.log('STATUS-TUTUP: keuangan lihat semua cabang           :', cAll.totals.days, 'hari |', cAll.totals.closed, 'tertutup |', cAll.totals.open, 'belum (harus 2/1/1)')
console.log('STATUS-TUTUP: hari PUSAT tertutup + snapshot cocok   :', cPusat.closed, '|', cPusat.count, 'trx |', cPusat.net, '| penutup:', cPusat.closed_by_name)
console.log('STATUS-TUTUP: hari CAB1 belum tertutup              :', cCab1.closed, '|', cCab1.count, 'trx (harus false)')
console.log('STATUS-TUTUP: kasir hanya cabangnya                 :', (await cstat(1, null)).days.map((d) => d.branch_name).join(','), '(harus PUSAT saja)')
console.log('STATUS-TUTUP: pengadaan ditolak                     :', (await cstat(2, null)))
console.log('STATUS-TUTUP: kasir lihat cabang lain ditolak       :', (await cstat(1, cab1)))
console.log('STATUS-TUTUP: rentang terbalik ditolak              :', await call(3, `select closing_status('${today}', '2001-01-01', null)`))
const cSnap = (await q(`select coalesce(sum(total_count),0)::int c, coalesce(sum(net),0)::int n from daily_closings where branch_id = '${pusat}' and close_date = '${today}'`))[0]
console.log('STATUS-TUTUP: angka = snapshot penutupan            :', cPusat.count === cSnap.c && Number(cPusat.net) === cSnap.n)

// ===== uji 020: tutup kasir HANYA role kasir + cabang Global =====
await run('020', sql('supabase/manual_migrations/020_kasir_only_global_branch.sql'))
await run('020 ulang (idempoten)', sql('supabase/manual_migrations/020_kasir_only_global_branch.sql'))
const keuanganRole = (await q(`select id from roles where name='keuangan'`))[0].id
const roleCan = async (name) => (await q(`select can_create from role_permissions rp join roles r on r.id=rp.role_id
  where r.name='${name}' and rp.feature_key='daily_close'`))[0]?.can_create
console.log('KASIR-ONLY: hak menutup kasir / keuangan             :', await roleCan('kasir'), '/', await roleCan('keuangan'), '(harus true / false)')
console.log('KASIR-ONLY: superadmin menutup ditolak              :', await call(5, `select close_day('${cab1}', '${today}', 0, null)`))
console.log('KASIR-ONLY: keuangan menutup ditolak                :', await call(3, `select close_day(null, '${today}', 0, null)`))
await q(`delete from daily_closings where branch_id='${pusat}' and close_date='${today}'`)
console.log('KASIR-ONLY: kasir tetap bisa menutup                :', await call(1, `select close_day(null, '${today}', ${cashPlus}, 'uji 020')`))
console.log('GLOBAL: akun keuangan lama jadi tanpa cabang        :', (await q(`select branch_id from profiles where id='${U(3)}'`))[0].branch_id === null)
console.log('GLOBAL: kasir tetap punya cabang                    :', (await q(`select branch_id from profiles where id='${U(1)}'`))[0].branch_id === pusat)
console.log('GLOBAL: role lintas cabang boleh tanpa cabang       :', await call(5, `select set_user_role('${U(3)}','${keuanganRole}', null)`))
console.log('GLOBAL: role kasir tanpa cabang ditolak             :', await call(5, `select set_user_role('${U(4)}','${kasirRole}', null)`))

// ===== uji 021: membership =====
await run('021', sql('supabase/manual_migrations/021_membership.sql'))
await run('021 ulang (idempoten)', sql('supabase/manual_migrations/021_membership.sql'))
const agen = (await q(`select r.id, r.all_branches from roles r where r.name = 'Agen Member'`))[0]
const agenPerm = (await q(`select feature_key, can_create, can_read, can_update, can_delete from role_permissions where role_id='${agen?.id}'`))
console.log('MEMBER: role Agen Member ada & Global             :', !!agen && agen.all_branches === true)
console.log('MEMBER: Agen Member CRUD members, fitur lain baca  :',
  JSON.stringify(agenPerm.find((p) => p.feature_key === 'members')) === '{"feature_key":"members","can_create":true,"can_read":true,"can_update":true,"can_delete":true}' &&
  agenPerm.filter((p) => p.feature_key !== 'members').every((p) => p.can_read && !p.can_create && !p.can_update && !p.can_delete) &&
  agenPerm.length === (await q(`select count(*)::int n from features`))[0].n)
const findm = async (n, s) => { try { return JSON.stringify(await as(n, `select * from find_member(${s === null ? 'null' : `'${s}'`})`)) } catch (e) { return 'ERR: ' + e.message } }
console.log('MEMBER: superadmin tambah member                  :', await call(5, `select member_save(null,'M-100','Budi Santoso',true)`))
console.log('MEMBER: nomor ganda (beda kapital) ditolak        :', await call(5, `select member_save(null,'m-100','Orang Lain',true)`))
console.log('MEMBER: nomor tidak valid ditolak                 :', await call(5, `select member_save(null,'M 100!','X',true)`))
console.log('MEMBER: nama kosong ditolak                       :', await call(5, `select member_save(null,'M-101','   ',true)`))
console.log('MEMBER: kasir mencari lewat nomor / nama          :', (await findm(1, 'M-100')).includes('Budi Santoso'), '/', (await findm(1, 'budi')).includes('M-100'))
console.log('MEMBER: pencarian kosong tidak mengembalikan apa pun:', await findm(1, '   '), '(harus [])')
console.log('MEMBER: pengadaan (tanpa hak member/pos) ditolak  :', await findm(2, 'budi'))
console.log('MEMBER: kasir tidak bisa menulis langsung ke tabel:', await call(1, `insert into members(member_no,name) values ('M-999','Kasir')`))
console.log('MEMBER: kasir tidak bisa mengubah/menghapus member:', await call(1, `select member_save((select id from members where member_no='M-100'),'M-100','Diubah Kasir',true)`), '/', await call(1, `select member_delete((select id from members where member_no='M-100'))`))
const impM = async (obj, ow) => { try { return JSON.stringify((await as(5, `select import_members('${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb, ${ow}) as r`))[0].r) } catch (e) { return 'ERR: ' + e.message } }
console.log('MEMBER: impor 3 baris (1 ganda, 1 rusak)          :', await impM([{ member_no: 'M-101', name: 'Siti', is_active: true }, { member_no: 'M-100', name: 'Nama Lain', is_active: true }, { member_no: '', name: 'Tanpa Nomor' }], false))
console.log('MEMBER: impor dengan timpa memperbarui nama       :', await impM([{ member_no: 'm-100', name: 'Budi Baru', is_active: true }], true), '| baris sekarang:', (await q(`select name from members where member_no='M-100'`))[0].name)
const disc = (mem) => (mem === null
  ? sale(1, [{ product_id: A, qty: 1, discount_pct: 5 }], null, 'qris')
  : sale(1, [{ product_id: A, qty: 1, discount_pct: 5 }], mem, 'qris'))
console.log('MEMBER: diskon tanpa member ditolak               :', (await disc(null)).includes('member wajib'))
console.log('MEMBER: diskon dengan member tak terdaftar ditolak:', (await disc('M-404')).includes('tidak terdaftar'))
console.log('MEMBER: diskon dengan member aktif diterima       :', !!(await disc('M-100'))[0]?.r?.invoice_no)
console.log('MEMBER: nama member tercatat di transaksi         :', (await q(`select member_label from sales where discount_amount > 0 order by created_at desc limit 1`))[0].member_label)
console.log('MEMBER: member yang dipakai transaksi tak dihapus  :', await call(5, `select member_delete((select id from members where member_no='M-100'))`))
console.log('MEMBER: member tanpa transaksi bisa dihapus       :', await call(5, `select member_delete((select id from members where member_no='M-101'))`), '| sisa:', (await q(`select count(*)::int n from members`))[0].n)
console.log('MEMBER: impor tercatat di audit log               :', (await q(`select count(*)::int n from audit_log where action like 'member.%'`))[0].n >= 4)

// status migrasi (dipakai juga untuk panduan pemilik)
console.log('STATUS:', JSON.stringify(await q(`
 select '002' as migrasi, exists(select 1 from information_schema.columns where table_name='products' and column_name='author') as sudah
 union all select '003', to_regclass('public.product_costs') is not null
 union all select '004', to_regprocedure('public.stock_by_branch(uuid)') is not null
 union all select '005', to_regclass('public.user_permissions') is not null
 union all select '006', exists(select 1 from pg_trigger where tgname='enforce_email_domain')
 union all select '007', to_regprocedure('public.revoke_user_sessions(uuid)') is not null
 union all select '008', to_regprocedure('public.my_scope()') is not null
 union all select '017', exists(select 1 from information_schema.columns where table_name='sales' and column_name='request_id')
 union all select '018', to_regclass('public.daily_closings') is not null
 union all select '019', to_regprocedure('public.closing_status(date,date,uuid)') is not null
 union all select '020', to_regprocedure('public._is_kasir(uuid)') is not null
 union all select '021', to_regprocedure('public.member_save(uuid,text,text,boolean)') is not null`)))
