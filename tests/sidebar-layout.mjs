// Uji hitungan pembagian tinggi sidebar (menu vs kartu Produk Terlaris). Jalankan: npm run test:sidebar
import { transformSync } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/features/layout/sidebarLayout.ts'), 'utf8')
const S = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'))
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const rem = 16, item = 2.75 * rem, pad = 1.5 * rem, handle = 0.75 * rem
const base = { H: 963, L: 90, U: 150, rem, n: 9, topRem: null, hasWidget: true }
let r = S.computeSidebarLayout(base)
t('OTOMATIS (layar tinggi): semua 9 menu terlihat, kartu mengisi sisa ruang', r.visible === 9 && r.widgetH >= 7.5 * rem && Math.abs(r.navH + r.widgetH + handle + base.L + base.U - base.H) < 1, JSON.stringify(r))
t('nav + pegangan + kartu + logo + pengguna = tinggi sidebar (tidak ada celah/tumpang tindih)', Math.abs(r.navH + handle + r.widgetH + base.L + base.U - base.H) < 0.01)
const auto = S.computeSidebarLayout(base)
r = S.computeSidebarLayout({ ...base, topRem: 15 })
t('TARIK lebih KECIL dari otomatis (15rem < ' + (auto.widgetH / rem).toFixed(1) + 'rem): tepat 15rem, semua menu tetap terlihat', Math.abs(r.widgetH - 15 * rem) < 0.01 && r.visible === 9, JSON.stringify(r))
r = S.computeSidebarLayout({ ...base, topRem: 28 })
t('TARIK lebih BESAR (28rem): tepat 28rem, menu berkurang tapi ≥ 2', Math.abs(r.widgetH - 28 * rem) < 0.01 && r.visible < 9 && r.visible >= 2 && Math.abs(r.navH + handle + r.widgetH + base.L + base.U - base.H) < 0.01, JSON.stringify(r))
const maxR = S.computeSidebarLayout({ ...base, topRem: 999 })
t('TARIK MAKSIMAL: kartu dibatasi, tepat 2 menu tersisa', maxR.visible === 2 && Math.abs(maxR.widgetH - maxR.maxWidgetH) < 0.01 && Math.abs(maxR.navH - (pad + 2 * item)) < 0.01, JSON.stringify(maxR))
const minR = S.computeSidebarLayout({ ...base, topRem: 0.5 })
t('TARIK MINIMAL: kartu tidak lebih kecil dari 7,5rem (7rem isi + padding; di bawah itu kartu menghilang), semua menu terlihat', Math.abs(minR.widgetH - 7.5 * rem) < 0.01 && minR.visible === 9, JSON.stringify(minR))
let prev = 99; let mono = true
for (let h = 8; h <= 40; h += 2) { const v = S.computeSidebarLayout({ ...base, topRem: h }).visible; if (v > prev) mono = false; prev = v }
t('semakin tinggi kartu, menu terlihat tidak pernah bertambah (monoton)', mono)
t('batas bawah: pada ukuran berapa pun menu terlihat ≥ 2', [0.5, 5, 10, 20, 30, 50, 999].every((x) => S.computeSidebarLayout({ ...base, topRem: x }).visible >= 2))
r = S.computeSidebarLayout({ ...base, H: 430 })
t('LAYAR PENDEK (otomatis): kartu disembunyikan, menu mengisi tinggi; yang tak muat → burger (≥2 terlihat)', r.widgetH === 0 && !r.hasHandle && r.visible >= 2 && r.visible < 9, JSON.stringify(r))
t('layar pendek: tinggi nav = seluruh ruang tersisa (tidak ada ruang terbuang)', Math.abs(r.navH - (430 - base.L - base.U)) < 0.01)
r = S.computeSidebarLayout({ ...base, H: 300, topRem: 12 })
t('layar sangat pendek walau pengguna pernah menarik: kartu hilang, tetap ≥ 2 menu', r.widgetH === 0 && r.visible >= 2, JSON.stringify(r))
r = S.computeSidebarLayout({ ...base, hasWidget: false })
t('tanpa hak melihat terlaris: tidak ada kartu & pegangan, menu semua', r.widgetH === 0 && !r.hasHandle && r.visible === 9)
r = S.computeSidebarLayout({ ...base, n: 1 })
t('hanya 1 menu (kasir sederhana): tampil 1, tidak error', r.visible === 1 && r.navH > 0)
t('0 menu: tidak error', S.computeSidebarLayout({ ...base, n: 0 }).visible === 0)
t('tinggi belum terukur (0): semua nol, tidak NaN', (() => { const x = S.computeSidebarLayout({ ...base, H: 0, L: 0, U: 0 }); return [x.navH, x.widgetH, x.visible].every(Number.isFinite) && x.widgetH === 0 })())
const r20 = S.computeSidebarLayout({ ...base, rem: 20, topRem: 15 }), r20i = 2.75 * 20
t('skala huruf (rem=20px): kartu 15rem = 300px; tinggi menu per tombol ikut membesar (55px)', r20.widgetH === 300 && Math.abs(S.computeSidebarLayout({ ...base, rem: 20 }).navH - (1.5 * 20 + 9 * r20i)) < 0.01)
t('menu sedikit (4) pada layar tinggi: kartu mengisi lebih banyak ruang daripada saat 9 menu', S.computeSidebarLayout({ ...base, n: 4 }).widgetH > S.computeSidebarLayout(base).widgetH)
t('clampRem', S.clampRem(50, { minRem: 7, maxRem: 20 }) === 20 && S.clampRem(1, { minRem: 7, maxRem: 20 }) === 7 && S.clampRem(10, { minRem: 7, maxRem: 20 }) === 10)
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
