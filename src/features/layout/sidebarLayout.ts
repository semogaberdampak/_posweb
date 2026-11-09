// Pembagian tinggi sidebar antara MENU dan kartu "Produk Terlaris" (murni hitungan, diuji di tests/sidebar-layout.mjs).
// Semua ukuran dalam piksel; konstanta dalam rem agar ikut skala huruf. Menu yang tidak muat disembunyikan (tersedia lewat tombol burger),
// minimal MIN_VISIBLE menu tetap terlihat.
export const ITEM_REM = 2.75        // satu tombol menu: py-2.5 + teks 1.25rem + jarak 0.25rem
export const NAV_PAD_REM = 1.5      // padding atas+bawah daftar menu (p-3)
export const HANDLE_REM = 0.75      // pegangan tarik
export const WIDGET_MIN_REM = 7.5   // 7rem isi kartu (batas tampil TopProducts) + 0.5rem padding bawah pembungkus
export const MIN_VISIBLE = 2

export type SidebarInput = {
  H: number            // tinggi total sidebar
  L: number            // tinggi blok logo (header)
  U: number            // tinggi blok pengguna (bawah)
  rem: number          // ukuran 1rem dalam px
  n: number            // jumlah menu yang boleh dilihat pengguna
  topRem: number | null // tinggi kartu pilihan pengguna (rem); null = otomatis (isi ruang sisa)
  hasWidget: boolean   // pengguna berhak melihat kartu terlaris
}
export type SidebarLayout = { navH: number; visible: number; widgetH: number; maxWidgetH: number; minWidgetH: number; hasHandle: boolean }

export function computeSidebarLayout(i: SidebarInput): SidebarLayout {
  const item = ITEM_REM * i.rem, pad = NAV_PAD_REM * i.rem, handle = HANDLE_REM * i.rem, wMin = WIDGET_MIN_REM * i.rem
  const A = Math.max(0, i.H - i.L - i.U)
  const keep = Math.min(MIN_VISIBLE, i.n)
  const maxW = Math.max(0, A - (pad + keep * item) - handle)
  let W = 0
  if (i.hasWidget && maxW >= wMin) {
    if (i.topRem == null) { const rest = A - (pad + i.n * item) - handle; W = rest >= wMin ? rest : 0 }
    else W = Math.min(Math.max(i.topRem * i.rem, wMin), maxW)
  }
  const navH = W > 0 ? A - W - handle : A
  const visible = i.n === 0 ? 0 : Math.min(i.n, Math.max(keep, Math.floor((navH - pad) / item)))
  return { navH, visible, widgetH: W, maxWidgetH: maxW, minWidgetH: wMin, hasHandle: W > 0 }
}
export const clampRem = (rem: number, bounds: { minRem: number; maxRem: number }) => Math.min(Math.max(rem, bounds.minRem), bounds.maxRem)
