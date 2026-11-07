import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type Kind = 'receipt' | 'invoice'
export type Method = 'cash' | 'qris' | 'debit' | 'credit_card'

export type ReceiptCfg = {
  widthMm: number; fontPx: number
  headerLines: string[]
  labels: { no: string; date: string; cashier: string; cust: string; total: string; paid: string; change: string }
  showCashier: boolean; showCust: boolean; defaultCust: string
  methodLabels: Record<Method, string>
  footerLines: string[]
}
export type InvoiceCfg = {
  title: string; companyName: string; headerLines: string[]
  labels: { no: string; date: string; to: string }
  defaultCust: string; infoLine: string
  cols: { code: string; name: string; price: string; qty: string; disc: string; ppn: string; sub: string }
  showPpn: boolean; ppnPercent: number; ppnEffective: number
  totals: { total: string; paid: string; change: string }
  footerLines: string[]
}

// Bawaan = meniru nota lama TAKOM. Token yang bisa dipakai di teks: {kasir} {cabang} {CABANG} {waktu} {tanggal} {no} {pelanggan}
export const DEFAULT_RECEIPT: ReceiptCfg = {
  widthMm: 72, fontPx: 12,
  headerLines: ['PT KANISIUS TAMAN KOMUNIKASI', 'office@takomkanisius.id', 'www.takomkanisius.id', 'Toko Rohani - {CABANG}', 'Jl. Arifin No. 1, Surakarta 57111,', 'Jawa Tengah', 'WA : 082337641713'],
  labels: { no: 'No.', date: 'Tgl.', cashier: 'Kasir', cust: 'Cust.', total: 'Total', paid: 'Bayar', change: 'Kembali' },
  showCashier: true, showCust: true, defaultCust: 'UMUM',
  methodLabels: { cash: 'CASH', qris: 'QRIS', debit: 'DEBIT', credit_card: 'KARTU KREDIT' },
  footerLines: ['Terima Kasih Atas Kunjungan Anda', 'Barang yang sudah dibeli', 'tidak dapat ditukar/dikembalikan'],
}
export const DEFAULT_INVOICE: InvoiceCfg = {
  title: 'NOTA PENJUALAN', companyName: 'PT KANISIUS TAMAN KOMUNIKASI',
  headerLines: ['Jl. Arifin No. 1, Surakarta 57111, Jawa Tengah', 'Telp. 082337641713', 'Email : office@takomkanisius.id | Web : www.takomkanisius.id'],
  labels: { no: 'Nomor', date: 'Tanggal', to: 'Kepada' },
  defaultCust: 'UMUM', infoLine: '{kasir} / Divisi Penjualan TAKOM / {waktu}',
  cols: { code: 'Kode', name: 'Barang', price: 'Harga', qty: 'Qty', disc: 'Disc.', ppn: 'PPn', sub: 'Sub Total' },
  showPpn: true, ppnPercent: 12, ppnEffective: 11,
  totals: { total: 'Total', paid: 'Pembayaran', change: 'Kembalian' },
  footerLines: ['Barang yang sudah dibeli, tidak dapat dikembalikan', 'Terima Kasih Atas Kunjungan Anda'],
}

/** Gabungkan isi tersimpan ke bawaan; hanya kunci & tipe yang dikenal yang diambil (isi rusak diabaikan). */
export function merge<T>(def: T, saved: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(saved) && saved.every((x) => typeof x === 'string') ? saved.slice(0, 30) : def) as T
  if (def && typeof def === 'object') {
    const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
    return Object.fromEntries(Object.entries(def as Record<string, unknown>).map(([k, v]) => [k, merge(v, s[k])])) as T
  }
  return (typeof saved === typeof def ? saved : def) as T
}

export function fill(text: string, v: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m)
}

export type PrintData = {
  invoiceNo: string; at: Date; cashier: string; branch: string; customer: string
  lines: { code: string; name: string; price: number; qty: number; disc: number }[]
  subtotal: number; discount: number; total: number; method: Method; paid: number; change: number
}
export const tokens = (d: PrintData, defaultCust: string): Record<string, string> => ({
  kasir: d.cashier, cabang: d.branch, CABANG: d.branch.toUpperCase(), no: d.invoiceNo,
  waktu: d.at.toLocaleString('sv-SE').replace('T', ' '), tanggal: d.at.toLocaleDateString('id-ID').replace(/\//g, '-'),
  pelanggan: d.customer || defaultCust,
})
export const num = (n: number) => Math.round(n).toLocaleString('id-ID')
export const lineDisc = (l: PrintData['lines'][number]) => Math.round((l.price * l.qty * l.disc) / 100)

export const SAMPLE: PrintData = {
  invoiceNo: 'INV-CONTOH-0001', at: new Date(), cashier: 'Nama Kasir', branch: 'Takom Antonius', customer: '',
  lines: [
    { code: '1000011013', name: 'Suatu Hari Di Surga', price: 20000, qty: 2, disc: 0 },
    { code: '1116TK0007', name: 'LD Ros Bsr', price: 4000, qty: 1, disc: 10 },
    { code: '1326CT0128', name: 'Kalung Titanium Liontin Salib', price: 46000, qty: 1, disc: 0 },
  ],
  subtotal: 90000, discount: 400, total: 89600, method: 'cash', paid: 100000, change: 10400,
}

async function fetchCfg(kind: Kind): Promise<unknown> {
  const { data, error } = await supabase.from('print_templates').select('config').eq('kind', kind).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.config ?? {}
}
export function useReceiptCfg(): ReceiptCfg {
  const { data } = useQuery({ queryKey: ['print-template', 'receipt'], queryFn: () => fetchCfg('receipt'), staleTime: 5 * 60_000 })
  return merge(DEFAULT_RECEIPT, data)
}
export function useInvoiceCfg(): InvoiceCfg {
  const { data } = useQuery({ queryKey: ['print-template', 'invoice'], queryFn: () => fetchCfg('invoice'), staleTime: 5 * 60_000 })
  return merge(DEFAULT_INVOICE, data)
}
export async function saveTemplate(kind: Kind, config: ReceiptCfg | InvoiceCfg) {
  const { error } = await supabase.rpc('save_print_template', { p_kind: kind, p_config: config })
  if (error) throw new Error(error.message === 'forbidden' ? 'Hanya admin yang boleh mengubah format.' : error.message)
}
