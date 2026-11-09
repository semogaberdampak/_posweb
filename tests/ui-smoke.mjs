// Uji antarmuka di browser sungguhan (Chromium) dengan Supabase TIRUAN: sidebar Produk Terlaris, chip stok, zoom 75/100/125%.
// Opsional (butuh `npm i --no-save playwright` + `npx playwright install chromium`). Jalankan:
//   VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=anon npx vite --port 3100 --host 127.0.0.1   (terminal 1)
//   node tests/ui-smoke.mjs                                                                                     (terminal 2)
// Variabel: CHROME (jalur chrome bila perlu), BASE_URL, SHOTS (folder tangkapan layar).
import { chromium } from 'playwright'
import fs from 'node:fs'
fs.mkdirSync((process.env.SHOTS || 'tests/shots') + '', { recursive: true })
const B = [['b1','ANTONIUS','Takom Antonius','TKSAP'],['b2','PAULUS','Takom Paulus','TKSP'],['b3','KRANGGAN','Takom Kranggan','Kranggan'],['b4','KATEDRAL','Takom Katedral','Katedral'],['b5','SANTAMARIA','Takom Santa Maria','TKSM'],['b6','ATHANASIUS','Takom Athanasius','TKSAA'],['b0','PUSAT','Takom Pusat','PUSAT']]
const names = ['Suatu Hari Di Surga','Yesus Disalib','Kisah Sengsara','Menghias Pohon Natal','Natal Di Negeri Dongeng','Menyambut Natal','GBPP: Pendidikan Religiositas Cawu 1 SLTP & SM','GBPP: Pendidikan Religiositas Cawu 2 SLTP & SM','PAHARGYAN BOJANA KURBAN TAHUN A','PAHARGYAN BOJANA KURBAN TAHUN B','MENCARI TEMA MISA, Masa Biasa Tahun C','Rosario Kayu Cokelat Besar']
const products = names.map((n, i) => ({ id: 'p' + i, code: String(1000011013 + i * 7), name: n, price: 20000 + i * 1000 }))
const top = names.slice(0, 10).map((n, i) => ({ product_id: 'p' + i, code: products[i].code, name: n, qty: 120 - i * 9, trx: 60 - i * 4 }))
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(body) })
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] })
const jwt = () => { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: 'u1', role: 'authenticated', exp: 4102444800 })}.sig` }
let ok = 0, bad = 0; const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
async function open(w, h, { empty = false, allBranches = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript((s) => localStorage.setItem('sb-mock-auth-token', s), JSON.stringify({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'e@takom.id', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
  const page = await ctx.newPage(); const calls = []; const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(), url = req.url()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: H })
    if (url.includes('/rest/v1/profiles')) return json(route, { full_name: 'edward', branch_id: 'b1', role_id: 'r1', is_active: true, branches: { name: 'Takom Antonius' } })
    if (url.includes('/rest/v1/role_permissions')) return json(route, [{ feature_key: 'pos', can_create: true, can_read: true, can_update: false, can_delete: false }, { feature_key: 'sales_recap', can_read: true, can_create: false, can_update: false, can_delete: false }])
    if (url.includes('/rpc/my_scope')) return json(route, [{ role_name: allBranches ? 'superadmin' : 'kasir', all_branches: allBranches }])
    if (url.includes('/rpc/stock_by_branch')) return json(route, B.map(([id, code, name, short]) => ({ branch_id: id, branch_code: code, branch_name: name, branch_short: short, is_pusat: code === 'PUSAT', qty: id === 'b3' ? 0 : 1000 })))
    if (url.includes('/rpc/top_products')) { calls.push(JSON.parse(req.postData() || '{}')); return json(route, empty ? [] : top) }
    if (url.includes('/rest/v1/products')) return json(route, products)
    if (url.includes('/rest/v1/branches')) return json(route, B.map(([id, code, name, short]) => ({ id, code, name, short_name: short, is_pusat: code === 'PUSAT' })))
    return json(route, [])
  })
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:3100') + '/pos'); await page.waitForSelector('text=Suatu Hari Di Surga', { timeout: 15000 }); await page.waitForTimeout(700)
  return { page, calls, errs, ctx }
}
const wibToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
const [ty, tm] = wibToday.split('-').map(Number)
const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate()

// 1) zoom 75%
let s = await open(1821, 963); await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/z75.png' })
t('tanpa galat JavaScript saat memuat', s.errs.length === 0, s.errs.join('|'))
t('widget "Produk Terlaris" tampil dengan 10 baris', (await s.page.locator('section[aria-label="Produk terlaris"] ol li').count()) === 10)
t('PARAMETER awal: harian = hari ini WIB (dari = sampai), limit 10, cabang null untuk kasir', s.calls.length >= 1 && s.calls[0].p_from === wibToday && s.calls[0].p_to === wibToday && s.calls[0].p_limit === 10 && s.calls[0].p_branch === null, JSON.stringify(s.calls[0]))
t('chip stok berurutan tetap: TKSAP, TKSP, Kranggan, Katedral, TKSM, TKSAA, PUSAT, Total; satu baris, tidak terpotong', await (async () => { const txt = (await s.page.locator('[aria-label="Stok per cabang"]').innerText()).replace(/\s+/g, ' ').trim(); const h = await s.page.locator('[aria-label="Stok per cabang"]').evaluate((e) => e.getBoundingClientRect().height); return txt === 'TKSAP 1.000 TKSP 1.000 Kranggan 0 Katedral 1.000 TKSM 1.000 TKSAA 1.000 PUSAT 1.000 Total 6.000' && h < 40 })())
// bulanan
await s.page.getByRole('tab', { name: 'Bulanan' }).click(); await s.page.waitForTimeout(500)
let c = s.calls.at(-1)
t('BULANAN: 1 s/d akhir bulan berjalan', c.p_from === `${ty}-${String(tm).padStart(2, '0')}-01` && c.p_to === `${ty}-${String(tm).padStart(2, '0')}-${lastDay}`, JSON.stringify(c))
await s.page.locator('select[aria-label="Bulan"]').selectOption('2'); await s.page.waitForTimeout(500); c = s.calls.at(-1)
t('BULANAN: pilih Februari → 1–(28/29) Feb', c.p_from === `${ty}-02-01` && c.p_to === `${ty}-02-${new Date(Date.UTC(ty, 2, 0)).getUTCDate()}`, JSON.stringify(c))
// tahunan
await s.page.getByRole('tab', { name: 'Tahunan' }).click(); await s.page.waitForTimeout(500); c = s.calls.at(-1)
t('TAHUNAN: 1 Jan s/d 31 Des', c.p_from === `${ty}-01-01` && c.p_to === `${ty}-12-31`, JSON.stringify(c))
await s.page.locator('select[aria-label="Tahun"]').selectOption('2025'); await s.page.waitForTimeout(500); c = s.calls.at(-1)
t('TAHUNAN: pilih 2025 → 2025-01-01..2025-12-31', c.p_from === '2025-01-01' && c.p_to === '2025-12-31', JSON.stringify(c))
// harian rentang
await s.page.getByRole('tab', { name: 'Harian' }).click(); await s.page.waitForTimeout(400)
await s.page.locator('input[type=date]').nth(0).fill('2026-11-01'); await s.page.locator('input[type=date]').nth(1).fill('2026-11-07'); await s.page.waitForTimeout(600); c = s.calls.at(-1)
t('HARIAN rentang: 1–7 Nov 2026 dikirim apa adanya', c.p_from === '2026-11-01' && c.p_to === '2026-11-07', JSON.stringify(c))
const before = s.calls.length
await s.page.locator('input[type=date]').nth(1).fill('2026-10-01'); await s.page.waitForTimeout(600)
t('rentang terbalik: pesan galat tampil & TIDAK mengirim permintaan', (await s.page.locator('section[aria-label="Produk terlaris"] [role=alert]').count()) === 1 && s.calls.length === before)
t('pilihan mode (Tahunan) diingat di komputer ini', await (async () => { await s.page.getByRole('tab', { name: 'Tahunan' }).click(); return (await s.page.evaluate(() => localStorage.getItem('pos.topMode'))) === 'year' })())
await s.ctx.close()
// 2) zoom 100%, 125%, tinggi sangat pendek, kosong, semua cabang
s = await open(1366, 722); await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/z100.png' }); await s.ctx.close()
s = await open(1093, 578); await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/z125.png' })
t('125% zoom: harga tidak terpecah dua baris ("Rp" / "20.000")', (await s.page.locator('tbody tr').first().locator('td').last().evaluate((el) => el.getBoundingClientRect().height)) < 60)
await s.ctx.close()
s = await open(1366, 430); await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/short.png' })
t('layar sangat pendek: widget disembunyikan (menu & kartu pengguna tetap utuh)', (await s.page.locator('section[aria-label="Produk terlaris"]').count()) === 0 && (await s.page.getByText('Keluar').isVisible()))
await s.ctx.close()
s = await open(1821, 963, { empty: true }); await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/empty.png' })
t('periode tanpa penjualan: pesan "Belum ada penjualan"', (await s.page.getByText('Belum ada penjualan pada periode ini.').count()) === 1); await s.ctx.close()
s = await open(1821, 963, { allBranches: true }); await s.page.waitForTimeout(500)
t('role lintas cabang: cabang aktif dikirim ke terlaris (p_branch = b1)', s.calls.some((x) => x.p_branch === 'b1'), JSON.stringify(s.calls.map((x) => x.p_branch)))
t('role lintas cabang: label memakai singkatan cabang (TKSAP)', (await s.page.locator('section[aria-label="Produk terlaris"]').innerText()).includes('TKSAP')); await s.ctx.close()
await browser.close(); console.log(`\nHASIL UI: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
