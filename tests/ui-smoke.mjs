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
async function open(w, h, { empty = false, allBranches = false, sale = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript((s) => localStorage.setItem('sb-mock-auth-token', s), JSON.stringify({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'e@takom.id', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
  const page = await ctx.newPage(); const calls = []; const errs = []; const saleCalls = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request(), url = req.url()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: H })
    if (url.includes('/rest/v1/profiles')) return json(route, { full_name: 'edward', branch_id: 'b1', role_id: 'r1', is_active: true, branches: { name: 'Takom Antonius' } })
    if (url.includes('/rest/v1/role_permissions')) return json(route, ['pos', 'products', 'stock', 'stock_move', 'sales_recap', 'finance', 'users', 'settings'].map((f) => ({ feature_key: f, can_create: f === 'pos', can_read: true, can_update: false, can_delete: false })))
    if (url.includes('/rpc/my_scope')) return json(route, [{ role_name: allBranches ? 'superadmin' : 'kasir', all_branches: allBranches }])
    if (url.includes('/rpc/stock_by_branch')) return json(route, B.map(([id, code, name, short]) => ({ branch_id: id, branch_code: code, branch_name: name, branch_short: short, is_pusat: code === 'PUSAT', qty: id === 'b3' ? 0 : 1000 })))
    if (url.includes('/rpc/create_sale')) { saleCalls.push(JSON.parse(req.postData() || '{}')); const r = sale ? sale(saleCalls.length) : { ok: true }; return r.ok ? json(route, { sale_id: 's' + saleCalls.length, invoice_no: 'INV-' + saleCalls.length, subtotal: 20000, discount: 0, total: 20000, change: 0 }) : route.fulfill({ status: 503, contentType: 'application/json', headers: H, body: JSON.stringify({ message: 'koneksi terputus', code: 'XX000' }) }) }
    if (url.includes('/rpc/top_products')) { calls.push(JSON.parse(req.postData() || '{}')); return json(route, empty ? [] : top) }
    if (url.includes('/rest/v1/products')) return json(route, products)
    if (url.includes('/rest/v1/branches')) return json(route, B.map(([id, code, name, short]) => ({ id, code, name, short_name: short, is_pusat: code === 'PUSAT' })))
    return json(route, [])
  })
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:3100') + '/pos'); await page.waitForSelector('text=Suatu Hari Di Surga', { timeout: 15000 }); await page.waitForTimeout(700)
  return { page, calls, errs, ctx, saleCalls }
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

// ---------- tinggi kartu bisa ditarik, menu tersembunyi → burger ----------
const links = (page) => page.locator('nav[aria-label="Menu utama"] a')
const card = (page) => page.locator('section[aria-label="Produk terlaris"]')
const hBox = async (page) => (await card(page).boundingBox())?.height ?? 0
const drag = async (page, dy) => { const hb = await page.locator('[role=separator]').boundingBox(); const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + dy, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(300) }
s = await open(1821, 963)
t('tab "Produk & Harga" kini bernama "Informasi Produk"', (await s.page.getByRole('link', { name: 'Informasi Produk' }).count()) === 1 && (await s.page.getByText('Produk & Harga').count()) === 0)
const total = await links(s.page).count(), h0 = await hBox(s.page), ol0 = await s.page.locator('section[aria-label="Produk terlaris"] ol').evaluate((e) => e.clientHeight)
t('OTOMATIS: semua 8 menu terlihat, kartu tampil, burger tanpa lencana', total === 8 && h0 > 100 && (await s.page.locator('button[aria-label="Semua menu"] span').count()) === 0, `${total} ${h0}`)
await drag(s.page, -250)
const h1 = await hBox(s.page), n1 = await links(s.page).count(), ol1 = await s.page.locator('section[aria-label="Produk terlaris"] ol').evaluate((e) => e.clientHeight)
t('TARIK KE ATAS 250px: kartu lebih tinggi, daftar produk lebih panjang, menu berkurang (≥2)', h1 > h0 + 100 && ol1 > ol0 + 100 && n1 < total && n1 >= 2, `h ${h0}->${h1} ol ${ol0}->${ol1} menu ${total}->${n1}`)
t('lencana burger = jumlah menu tersembunyi', (await s.page.locator('button[aria-label="Semua menu"] span').innerText()) === String(total - n1))
await drag(s.page, -2000)
const n2 = await links(s.page).count(), h2 = await hBox(s.page)
t('TARIK SEKUAT-KUATNYA: tersisa TEPAT 2 menu, kartu mentok (tidak mendorong keluar layar)', n2 === 2 && h2 >= h1, `${n2} ${h2}`)
const ub = await s.page.getByRole('button', { name: 'Keluar' }).boundingBox()
t('kartu pengguna & tombol Keluar tetap terlihat di dalam layar', ub.y + ub.height <= 963 && ub.y > 0)
// burger
await s.page.getByRole('button', { name: 'Semua menu' }).click()
t('BURGER: membuka daftar SEMUA 8 menu (yang tersembunyi + yang terlihat)', (await s.page.locator('[role=menu] a').count()) === 8)
await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(150)
t('BURGER: Escape menutup', (await s.page.locator('[role=menu]').count()) === 0)
await s.page.getByRole('button', { name: 'Semua menu' }).click(); await s.page.locator('[role=menu] a', { hasText: 'Keuangan' }).click(); await s.page.waitForTimeout(500)
t('BURGER: memilih menu tersembunyi (Keuangan) berpindah halaman & menutup menu', s.page.url().endsWith('/keuangan') && (await s.page.locator('[role=menu]').count()) === 0, s.page.url())
await s.page.goto((process.env.BASE_URL || 'http://127.0.0.1:3100') + '/pos'); await s.page.waitForSelector('text=Suatu Hari Di Surga'); await s.page.waitForTimeout(600)
t('TINGGI DIINGAT: setelah muat ulang, kartu tetap besar & menu tetap 2', (await links(s.page).count()) === 2 && Math.abs((await hBox(s.page)) - h2) < 3, `${await hBox(s.page)} vs ${h2}`)
await drag(s.page, 2000)
t('TARIK KE BAWAH sekuatnya: kartu mengecil ke batas minimum tapi TETAP TAMPIL, semua menu kembali', (await links(s.page).count()) === 8 && (await hBox(s.page)) < h0 && (await hBox(s.page)) > 80, `${await hBox(s.page)}`)
await s.page.locator('[role=separator]').dblclick(); await s.page.waitForTimeout(300)
t('KLIK GANDA: kembali otomatis (tinggi awal, simpanan dihapus)', Math.abs((await hBox(s.page)) - h0) < 3 && (await s.page.evaluate(() => localStorage.getItem('pos.topHeightRem'))) === null, `${await hBox(s.page)} vs ${h0}`)
await s.page.locator('[role=separator]').focus(); const hk0 = await hBox(s.page)
await s.page.keyboard.press('ArrowUp'); await s.page.keyboard.press('ArrowUp'); await s.page.waitForTimeout(200)
t('PAPAN KETIK: ↑ dua kali = kartu +2rem (32px)', Math.abs((await hBox(s.page)) - hk0 - 32) < 3 && (await s.page.evaluate(() => localStorage.getItem('pos.topHeightRem'))) !== null, `${await hBox(s.page)} vs ${hk0}`)
await s.ctx.close()
s = await open(1366, 430)
const nS = await links(s.page).count()
t('LAYAR PENDEK: kartu & pegangan hilang, menu ≥ 2 terlihat, sisanya lewat burger (ada lencana)', (await card(s.page).count()) === 0 && (await s.page.locator('[role=separator]').count()) === 0 && nS >= 2 && nS < 8 && (await s.page.locator('button[aria-label="Semua menu"] span').count()) === 1, `${nS}`)
await s.page.getByRole('button', { name: 'Semua menu' }).click()
t('LAYAR PENDEK: burger tetap menampilkan semua 8 menu & Keluar tetap terlihat', (await s.page.locator('[role=menu] a').count()) === 8 && (await s.page.getByRole('button', { name: 'Keluar' }).isVisible()))
await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/burger.png' }); await s.ctx.close()
s = await open(1821, 963); await drag(s.page, -250); await s.page.screenshot({ path: (process.env.SHOTS || 'tests/shots') + '/ditarik.png' }); await s.ctx.close()

// ---------- idempotensi bayar (kunci per percobaan) ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
async function bayarQris(page) { await page.locator('tbody tr').first().click(); await page.keyboard.press('F8'); await page.getByRole('button', { name: /Lanjut ke metode bayar/ }).click(); await page.keyboard.press('2'); await page.waitForTimeout(700) }
s = await open(1821, 963, { sale: (n) => ({ ok: n !== 1 }) })   // percobaan pertama gagal (koneksi putus), berikutnya berhasil
await bayarQris(s.page)
t('BAYAR GAGAL (koneksi putus): kunci idempotensi UUID v4 dikirim & pesan galat tampil', s.saleCalls.length === 1 && UUID.test(s.saleCalls[0].p_request_id) && (await s.page.getByText('koneksi terputus').count()) >= 1, JSON.stringify(s.saleCalls[0]))
await s.page.keyboard.press('2'); await s.page.waitForTimeout(700)
t('ULANGI bayar (keranjang & metode sama): memakai kunci YANG SAMA (server mengembalikan transaksi yang ada)', s.saleCalls.length === 2 && s.saleCalls[1].p_request_id === s.saleCalls[0].p_request_id, JSON.stringify(s.saleCalls.map((x) => x.p_request_id)))
t('setelah berhasil: banner transaksi selesai tampil', (await s.page.getByText('INV-2').count()) >= 1)
await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300)
await bayarQris(s.page)
t('TRANSAKSI BARU sesudah berhasil: kunci BARU (bukan kunci lama)', s.saleCalls.length === 3 && UUID.test(s.saleCalls[2].p_request_id) && s.saleCalls[2].p_request_id !== s.saleCalls[0].p_request_id, JSON.stringify(s.saleCalls.map((x) => x.p_request_id)))
await s.ctx.close()
s = await open(1821, 963, { sale: (n) => ({ ok: n >= 3 }) })   // dua kali gagal
await bayarQris(s.page); await s.page.keyboard.press('2'); await s.page.waitForTimeout(500)
await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(200); await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300) // mundur ke daftar produk
t('KERANJANG BERUBAH setelah gagal: kunci berganti (jangan membayar isi keranjang lain dengan kunci lama)', await (async () => { const before = s.saleCalls.at(-1).p_request_id; await s.page.locator('tbody tr').nth(1).click(); await s.page.keyboard.press('F8'); await s.page.getByRole('button', { name: /Lanjut ke metode bayar/ }).click(); await s.page.keyboard.press('2'); await s.page.waitForTimeout(600); return s.saleCalls.at(-1).p_request_id !== before })())
await s.ctx.close()
await browser.close(); console.log(`\nHASIL UI: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
