// Uji keserasian penggabungan: bila migrasi 005_stock_movements LAMA (dari compare.zip) pernah dijalankan di database,
// migrasi 013 harus membersihkannya tanpa merusak apa pun. Jalankan: npm run test:merge
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const db = new PGlite({ extensions: { pg_trgm } })
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
 create schema auth; create table auth.users(id uuid primary key, email text); create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema public to anon, authenticated; grant usage on schema auth to authenticated; grant execute on function auth.uid() to anon, authenticated;`)
await db.exec(read('supabase/schema.sql'))
const migs = fs.readdirSync(path.join(ROOT, 'supabase/manual_migrations')).sort().filter((f) => f < '013')
for (const f of migs) await db.exec(read('supabase/manual_migrations/' + f))
await db.exec(read('tests/fixtures/legacy_005_stock_movements.sql')) // keadaan database pemilik bila migrasi lama sudah dijalankan
const q = async (s) => (await db.query(s)).rows
const fn4 = () => q(`select count(*)::int n from pg_proc where proname='transfer_stock' and pronargs=4`).then((r) => r[0].n)
const pol = (n) => q(`select count(*)::int n from pg_policies where tablename='stock_movements' and policyname='${n}'`).then((r) => r[0].n)
t('(prasyarat) migrasi lama terpasang: transfer_stock 4-arg + policy mov_i & mov_r ada', (await fn4()) === 1 && (await pol('mov_i')) === 1 && (await pol('mov_r')) === 1)
await db.exec(read('supabase/manual_migrations/013_stock_move.sql'))
t('013: versi transfer_stock 4-argumen lama dihapus', (await fn4()) === 0)
t('013: policy INSERT langsung ke buku stok (mov_i) dihapus', (await pol('mov_i')) === 0)
t('013: policy mov_r (tanpa batas cabang) dihapus; stockmov_r yang benar tetap ada', (await pol('mov_r')) === 0 && (await pol('stockmov_r')) === 1)
t('013: transfer_stock 5-arg + transfer_stock_batch tersedia', (await q(`select count(*)::int n from pg_proc where (proname='transfer_stock' and pronargs=5) or proname='transfer_stock_batch'`))[0].n === 2)
t('013: fitur stock_move terdaftar; hanya superadmin & pengadaan mendapat hak', JSON.stringify((await q(`select r.name from role_permissions rp join roles r on r.id=rp.role_id where rp.feature_key='stock_move' and rp.can_update order by 1`)).map((x) => x.name)) === JSON.stringify(['pengadaan', 'superadmin']))
t('constraint alasan stok memuat transfer_in & transfer_out', (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname='stock_movements_reason_check'`))[0].d.includes('transfer_out'))
let e = ''; try { await db.exec(read('supabase/manual_migrations/013_stock_move.sql')) } catch (x) { e = x.message }
t('013 aman dijalankan ulang (idempoten)', e === '', e)
t('role authenticated TIDAK punya hak INSERT langsung ke stock_movements', (await q(`select has_table_privilege('authenticated','stock_movements','INSERT') as p`))[0].p === false)
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
