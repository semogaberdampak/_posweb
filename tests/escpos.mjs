// Uji struk ESC/POS (mengikuti Format Nota) dan alur WebUSB dengan perangkat tiruan. Jalankan: npm run test:escpos
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cache = path.join(ROOT, 'node_modules', '.cache'); fs.mkdirSync(cache, { recursive: true })
const entry = path.join(cache, 'escpos-entry.ts'), out = path.join(cache, 'escpos-test.cjs')
const imp = (p) => JSON.stringify(p.replace(/\\/g, '/')) // aman untuk path Windows
fs.writeFileSync(entry, `export * from ${imp(path.join(ROOT, 'src/lib/escpos'))}; export * from ${imp(path.join(ROOT, 'src/lib/webusb-printer'))}; export { DEFAULT_RECEIPT, SAMPLE } from ${imp(path.join(ROOT, 'src/features/print/templates'))}`)
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, external: ['react'], logLevel: 'silent',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://x.supabase.co"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"x"' } })
const M = createRequire(path.join(ROOT, 'package.json'))(out)
let ok = 0, bad = 0
const t = (n, c, d = '') => { c ? ok++ : bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`) }
const store = new Map(); globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)) }

// ----- ESC/POS -----
const cfg = M.DEFAULT_RECEIPT, data = { ...M.SAMPLE, at: new Date('2026-11-07T15:37:00') }
const bytes = M.buildReceipt(data, cfg)
const asText = (b) => Buffer.from(b).toString('latin1')
const printable = (b) => { const s = []; for (let i = 0; i < b.length; i++) { if (b[i] === 0x1b) { i += b[i + 1] === 0x40 ? 1 : 2; continue } if (b[i] === 0x1d) { i += 3; continue } s.push(b[i]) } return Buffer.from(s).toString('latin1') }
const txt = printable(bytes), lines = txt.split('\n')
t('diawali reset printer (ESC @) dan diakhiri perintah potong (GS V)', bytes[0] === 0x1b && bytes[1] === 0x40 && bytes[bytes.length - 4] === 0x1d && bytes[bytes.length - 3] === 0x56)
t('isi mengikuti Format Nota: kepala, label, kaki', ['PT KANISIUS TAMAN KOMUNIKASI', 'Toko Rohani - TAKOM ANTONIUS', 'No.', 'Tgl.', 'Kasir', 'Nama Kasir', 'Cust.', 'UMUM', 'Total', 'Bayar', 'Kembali', 'CASH', 'Terima Kasih Atas Kunjungan Anda', 'tidak dapat ditukar/dikembalikan'].every((x) => txt.includes(x)))
t('baris barang: kode, nama, qty, harga, diskon %, subtotal (90.000 total 89.600)', ['1000011013', 'Suatu Hari Di Surga', '1116TK0007', '10%', '89.600', '100.000', '10.400'].every((x) => txt.includes(x)))
t('lebar 72mm = 48 kolom: tidak ada baris >48', lines.every((l) => l.length <= 48), String(Math.max(...lines.map((l) => l.length))))
const c58 = M.buildReceipt(data, { ...cfg, widthMm: 48 }); const l58 = printable(c58).split('\n')
t('lebar 48mm (58mm) = 32 kolom: tidak ada baris >32', l58.every((l) => l.length <= 32), String(Math.max(...l58.map((l) => l.length))))
const edited = printable(M.buildReceipt(data, { ...cfg, showCashier: false, headerLines: ['TOKO BARU {CABANG}'], footerLines: ['Sampai jumpa'], labels: { ...cfg.labels, cust: 'Pelanggan' } }))
t('perubahan admin ikut tercetak: kasir disembunyikan, kepala/kaki/label baru, token {CABANG}', !edited.includes('Nama Kasir') && edited.includes('TOKO BARU TAKOM ANTONIUS') && edited.includes('Sampai jumpa') && edited.includes('Pelanggan') && !edited.includes('PT KANISIUS'))
const odd = printable(M.buildReceipt({ ...data, lines: [{ code: 'X1', name: 'Café “Rosário” 日本 ✝', price: 5000, qty: 1, disc: 0 }] }, cfg))
t('karakter non-ASCII aman: aksen dibuang (Cafe Rosario), simbol lain jadi "?"', odd.includes('Cafe') && odd.includes('Rosario') && !/[^\x00-\x7f]/.test(odd) && odd.includes('?'))
const long = printable(M.buildReceipt({ ...data, lines: [{ code: 'K', name: 'Nama produk yang sangat panjang sekali untuk menguji pemotongan baris otomatis pada struk', price: 1234567, qty: 12, disc: 25 }] }, cfg)).split('\n')
t('nama panjang dipecah ke beberapa baris, angka besar tetap terbaca', long.every((l) => l.length <= 48) && long.some((l) => l.includes('1.234.567')) && long.filter((l) => /produk|panjang|struk/.test(l)).length >= 1)
t('metode lain: QRIS tercetak', printable(M.buildReceipt({ ...data, method: 'qris' }, cfg)).includes('QRIS'))
t('kode barang tidak diubah (alfanumerik utuh)', printable(M.buildReceipt({ ...data, lines: [{ code: '1115AX0126', name: 'R', price: 1, qty: 1, disc: 0 }] }, cfg)).includes('1115AX0126'))

// ----- WebUSB dengan perangkat tiruan -----
const iface = (n, cls, withOut = true, claimed = false) => ({ interfaceNumber: n, claimed, alternate: { interfaceClass: cls, endpoints: withOut ? [{ direction: 'out', endpointNumber: 2 }, { direction: 'in', endpointNumber: 1 }] : [{ direction: 'in', endpointNumber: 1 }] }, alternates: [{ interfaceClass: cls, endpoints: withOut ? [{ direction: 'out', endpointNumber: 2 }, { direction: 'in', endpointNumber: 1 }] : [{ direction: 'in', endpointNumber: 1 }] }] })
const mkDev = (o = {}) => { const log = { open: 0, claim: [], out: [], close: 0, selectCfg: 0 }
  const d = { vendorId: 0x04b8, productId: 0x0e15, productName: 'TM-T82', manufacturerName: 'EPSON', opened: false, configuration: { interfaces: o.interfaces ?? [iface(0, 7)] }, configurations: [{ interfaces: o.interfaces ?? [iface(0, 7)] }],
    open: async () => { if (o.failOpen) { const e = new Error('Access denied.'); e.name = 'SecurityError'; throw e } log.open++; d.opened = true }, close: async () => { log.close++; d.opened = false },
    selectConfiguration: async () => { log.selectCfg++ }, claimInterface: async (n) => { if (o.failClaim) throw new Error('claim gagal'); log.claim.push(n) },
    transferOut: async (ep, buf) => { log.out.push({ ep, n: buf.byteLength }); return { status: o.status ?? 'ok', bytesWritten: buf.byteLength } } }
  return { d, log } }
const usbOf = (devs, reqResult) => ({ getDevices: async () => devs, requestDevice: async (opt) => { usbOf.lastOpt = opt; if (reqResult instanceof Error) throw reqResult; return reqResult } })

let r = await M.printDirect(data, cfg, usbOf([]))
t('belum ada printer terhubung → gagal dengan alasan jelas (cadangan: cetak browser)', !r.ok && /Belum ada printer/.test(r.reason), JSON.stringify(r))
r = await M.printDirect(data, cfg, undefined)
t('tanpa WebUSB (bukan Chrome / bukan HTTPS) → gagal tanpa crash', !r.ok && /WebUSB/.test(r.reason), JSON.stringify(r))
let { d, log } = mkDev(); r = await M.printDirect(data, cfg, usbOf([d]))
t('printer tiruan: terbuka, interface printer (0) di-claim, data terkirim ke endpoint OUT 2', r.ok && log.open === 1 && log.claim[0] === 0 && log.out.length === 1 && log.out[0].ep === 2 && log.out[0].n === bytes.length, JSON.stringify({ r, log }))
;({ d, log } = mkDev({ interfaces: [iface(0, 3), iface(1, 7)] })); r = await M.printDirect(data, cfg, usbOf([d]))
t('memilih interface berkelas PRINTER (bukan interface pertama) bila ada beberapa', r.ok && log.claim[0] === 1)
;({ d, log } = mkDev()); const big = { ...data, lines: Array.from({ length: 400 }, (_, i) => ({ code: 'K' + i, name: 'Barang ' + i, price: 1000, qty: 1, disc: 0 })) }
r = await M.printDirect(big, cfg, usbOf([d]))
t('struk panjang dikirim bertahap (≤4096 byte per paket), total utuh', r.ok && log.out.length > 1 && log.out.every((x) => x.n <= 4096) && log.out.reduce((a, x) => a + x.n, 0) === M.buildReceipt(big, cfg).length)
;({ d, log } = mkDev({ failOpen: true })); r = await M.printDirect(data, cfg, usbOf([d]))
t('Windows menolak ("Access denied", bukan driver WinUSB) → gagal rapi, tidak melempar galat', !r.ok && /Access denied/.test(r.reason), JSON.stringify(r))
;({ d, log } = mkDev({ failClaim: true })); r = await M.printDirect(data, cfg, usbOf([d]))
t('claim gagal → gagal rapi & koneksi ditutup agar percobaan berikut bersih', !r.ok && log.close === 1)
;({ d, log } = mkDev({ status: 'stall' })); r = await M.printDirect(data, cfg, usbOf([d]))
t('printer menolak data (stall) → dianggap gagal (agar cadangan cetak browser jalan)', !r.ok && /stall/.test(r.reason))
;({ d, log } = mkDev({ interfaces: [iface(0, 3)] })); r = await M.printDirect(data, cfg, usbOf([d]))
t('perangkat bukan printer (mouse/flashdisk yang pernah diizinkan) TIDAK dipakai', !r.ok && log.out.length === 0 && log.open === 0)
const a = mkDev(), b = mkDev(); b.d.vendorId = 0x0483; b.d.productId = 0x5743
store.set('pos.usbPrinter', JSON.stringify({ v: 0x0483, p: 0x5743 })); await M.printDirect(data, cfg, usbOf([a.d, b.d]))
t('beberapa printer: yang dipilih saat pairing (tersimpan) yang dipakai', b.log.out.length === 1 && a.log.out.length === 0)
const p = await M.pairUsbPrinter(usbOf([], b.d))
t('pairing hanya menampilkan perangkat kelas printer (filter classCode 7) & menyimpan pilihan', p.device === b.d && usbOf.lastOpt.filters[0].classCode === 7 && JSON.parse(store.get('pos.usbPrinter')).v === 0x0483)
const nf = new Error('x'); nf.name = 'NotFoundError'
t('pairing dibatalkan pengguna → pesan jelas, tidak crash', (await M.pairUsbPrinter(usbOf([], nf))).reason.includes('Tidak ada printer'))
console.log(`\nHASIL: ${ok} lulus, ${bad} gagal`); process.exit(bad ? 1 : 0)
