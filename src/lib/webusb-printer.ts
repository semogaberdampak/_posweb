import type { PrintData, ReceiptCfg } from '../features/print/templates'
import { buildReceipt } from './escpos'

// Cetak langsung ke printer thermal USB lewat WebUSB (Chrome/Edge/Brave; hanya di HTTPS atau 127.0.0.1/localhost).
// PENTING (Windows): WebUSB hanya bisa membuka perangkat yang memakai driver WinUSB. Printer yang terpasang dengan driver bawaan pabrikan
// biasanya ditolak ("Access denied") -> aplikasi otomatis kembali ke cetak browser/kiosk. Mengganti driver ke WinUSB (mis. Zadig)
// membuat printer TIDAK bisa lagi dipakai sebagai printer Windows biasa.
const K_ID = 'pos.usbPrinter'
const PRINTER_CLASS = 7
export type PrintResult = { ok: boolean; reason?: string }
type UsbApi = Pick<USB, 'getDevices' | 'requestDevice'>

export const usbSupported = (nav: { usb?: unknown } = typeof navigator === 'undefined' ? {} : navigator) => !!nav.usb
const apiOf = (usb?: UsbApi) => usb ?? (typeof navigator !== 'undefined' && 'usb' in navigator ? navigator.usb : undefined)

function printerEndpoint(d: USBDevice): { iface: number; ep: number } | null {
  const cfg = d.configuration ?? d.configurations[0]
  for (const i of cfg?.interfaces ?? []) {
    for (const alt of i.alternates?.length ? i.alternates : [i.alternate]) {
      const out = alt.endpoints.find((e) => e.direction === 'out')
      if (alt.interfaceClass === PRINTER_CLASS && out) return { iface: i.interfaceNumber, ep: out.endpointNumber }
    }
  }
  return null
}
export const deviceLabel = (d: USBDevice) => [d.manufacturerName, d.productName].filter(Boolean).join(' ') || `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`

/** HARUS dipanggil dari klik pengguna (aturan browser). Hanya menampilkan perangkat kelas printer. */
export async function pairUsbPrinter(usb?: UsbApi): Promise<{ device: USBDevice | null; reason?: string }> {
  const api = apiOf(usb)
  if (!api) return { device: null, reason: 'Browser ini tidak mendukung WebUSB (gunakan Chrome/Edge/Brave lewat HTTPS).' }
  try {
    const device = await api.requestDevice({ filters: [{ classCode: PRINTER_CLASS }] })
    try { localStorage.setItem(K_ID, JSON.stringify({ v: device.vendorId, p: device.productId })) } catch { /* abaikan */ }
    return { device }
  } catch (e) {
    return { device: null, reason: e instanceof Error && e.name === 'NotFoundError' ? 'Tidak ada printer dipilih / tidak ditemukan.' : `Gagal menghubungkan: ${e instanceof Error ? e.message : e}` }
  }
}

/** Printer yang sudah pernah diizinkan (pilih yang tersimpan, kalau tidak yang pertama berkelas printer). */
export async function pairedPrinter(usb?: UsbApi): Promise<USBDevice | null> {
  const api = apiOf(usb); if (!api) return null
  let saved: { v: number; p: number } | null = null
  try { saved = JSON.parse(localStorage.getItem(K_ID) ?? 'null') } catch { /* abaikan */ }
  const list = (await api.getDevices()).filter((d) => !!printerEndpoint(d) || d.configurations.length === 0)
  return list.find((d) => saved && d.vendorId === saved.v && d.productId === saved.p) ?? list[0] ?? null
}

/** Mencetak struk ESC/POS (mengikuti format admin). TIDAK memanggil window.print; pemanggil yang memutuskan cadangan. */
export async function printDirect(data: PrintData, cfg: ReceiptCfg, usb?: UsbApi): Promise<PrintResult> {
  const api = apiOf(usb)
  if (!api) return { ok: false, reason: 'WebUSB tidak didukung' }
  let device: USBDevice | null = null
  try {
    device = await pairedPrinter(api)
    if (!device) return { ok: false, reason: 'Belum ada printer USB yang dihubungkan' }
    if (!device.opened) await device.open()
    if (device.configuration === null) await device.selectConfiguration(1)
    const target = printerEndpoint(device)
    if (!target) return { ok: false, reason: 'Perangkat ini tidak punya jalur cetak (bukan printer)' }
    const iface = device.configuration?.interfaces.find((i) => i.interfaceNumber === target.iface)
    if (!iface?.claimed) await device.claimInterface(target.iface)
    const bytes = buildReceipt(data, cfg)
    for (let i = 0; i < bytes.length; i += 4096) {
      const r = await device.transferOut(target.ep, bytes.slice(i, i + 4096))
      if (r.status !== 'ok') return { ok: false, reason: `Printer menolak data (${r.status})` }
    }
    return { ok: true }
  } catch (e) {
    try { if (device?.opened) await device.close() } catch { /* abaikan */ } // supaya percobaan berikutnya mulai bersih
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
