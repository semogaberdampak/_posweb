import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type Kind = 'receipt' | 'invoice'
export type Method = 'cash' | 'qris' | 'debit' | 'credit_card'
export type Align = 'left' | 'center' | 'right'
export type SepStyle = 'dashed' | 'solid' | 'none'

export type ReceiptCfg = {
  widthMm: number; fontPx: number
  // kepala
  headerVisible: boolean; headerAlign: Align; headerBoldFirst: boolean; headerLines: string[]
  // baris nomor / tanggal / kasir / pelanggan
  metaVisible: boolean; metaAlign: Align; metaLabelWidthEm: number
  showNo: boolean; showDate: boolean
  labels: { no: string; date: string; cashier: string; cust: string; total: string; paid: string; change: string }
  showCashier: boolean; showCust: boolean; defaultCust: string
  // metode bayar
  methodLabels: Record<Method, string>
  showMethod: boolean; methodAlign: Align
  // baris barang
  itemShowCode: boolean; itemShowName: boolean
  itemShowQty: boolean; itemShowPrice: boolean; itemShowDisc: boolean; itemShowSub: boolean
  itemCodeAlign: Align; itemNameAlign: Align; itemNumbersAlign: Align
  // pemisah & total & kaki
  separator: SepStyle
  totalsVisible: boolean
  footerVisible: boolean; footerAlign: Align; footerLines: string[]
}
export type InvoiceCfg = {
  // kepala
  title: string; titleVisible: boolean; titleAlign: Align
  companyName: string; companyVisible: boolean; companyAlign: Align
  headerVisible: boolean; headerAlign: Align; headerLines: string[]
  labels: { no: string; date: string; to: string }
  showNo: boolean; showDate: boolean; showTo: boolean; metaAlign: Align
  defaultCust: string
  infoLine: string; infoVisible: boolean; infoAlign: Align
  // tabel barang
  cols: { code: string; name: string; price: string; qty: string; disc: string; ppn: string; sub: string }
  colVisible: { code: boolean; name: boolean; price: boolean; qty: boolean; disc: boolean; ppn: boolean; sub: boolean }
  colAlign: { code: Align; name: Align; price: Align; qty: Align; disc: Align; ppn: Align; sub: Align }
  tableBorder: boolean
  showPpn: boolean; ppnPercent: number; ppnEffective: number
  // total & kaki
  totals: { total: string; paid: string; change: string }
  totalsVisible: boolean; totalsAlign: Align
  separator: SepStyle
  footerVisible: boolean; footerAlign: Align; footerLines: string[]
}

// Bawaan = meniru nota lama TAKOM. Token yang bisa dipakai di teks: {kasir} {cabang} {CABANG} {waktu} {tanggal} {no} {pelanggan}
export const DEFAULT_RECEIPT: ReceiptCfg = {
  widthMm: 72, fontPx: 12,
  headerVisible: true, headerAlign: 'center', headerBoldFirst: true,
  headerLines: ['PT KANISIUS TAMAN KOMUNIKASI', 'office@takomkanisius.id', 'www.takomkanisius.id', 'Toko Rohani - {CABANG}', 'Jl. Arifin No. 1, Surakarta 57111,', 'Jawa Tengah', 'WA : 082337641713'],
  metaVisible: true, metaAlign: 'left', metaLabelWidthEm: 4.5,
  showNo: true, showDate: true,
  labels: { no: 'No.', date: 'Tgl.', cashier: 'Kasir', cust: 'Cust.', total: 'Total', paid: 'Bayar', change: 'Kembali' },
  showCashier: true, showCust: true, defaultCust: 'UMUM',
  methodLabels: { cash: 'CASH', qris: 'QRIS', debit: 'DEBIT', credit_card: 'KARTU KREDIT' },
  showMethod: true, methodAlign: 'left',
  itemShowCode: true, itemShowName: true,
  itemShowQty: true, itemShowPrice: true, itemShowDisc: true, itemShowSub: true,
  itemCodeAlign: 'left', itemNameAlign: 'left', itemNumbersAlign: 'right',
  separator: 'dashed', totalsVisible: true,
  footerVisible: true, footerAlign: 'center',
  footerLines: ['Terima Kasih Atas Kunjungan Anda', 'Barang yang sudah dibeli', 'tidak dapat ditukar/dikembalikan'],
}
export const DEFAULT_INVOICE: InvoiceCfg = {
  title: 'NOTA PENJUALAN', titleVisible: true, titleAlign: 'right',
  companyName: 'PT KANISIUS TAMAN KOMUNIKASI', companyVisible: true, companyAlign: 'left',
  headerVisible: true, headerAlign: 'left',
  headerLines: ['Jl. Arifin No. 1, Surakarta 57111, Jawa Tengah', 'Telp. 082337641713', 'Email : office@takomkanisius.id | Web : www.takomkanisius.id'],
  labels: { no: 'Nomor', date: 'Tanggal', to: 'Kepada' },
  showNo: true, showDate: true, showTo: true, metaAlign: 'left',
  defaultCust: 'UMUM', infoLine: '{kasir} / Divisi Penjualan TAKOM / {waktu}', infoVisible: true, infoAlign: 'right',
  cols: { code: 'Kode', name: 'Barang', price: 'Harga', qty: 'Qty', disc: 'Disc.', ppn: 'PPn', sub: 'Sub Total' },
  colVisible: { code: true, name: true, price: true, qty: true, disc: true, ppn: true, sub: true },
  colAlign: { code: 'left', name: 'left', price: 'right', qty: 'right', disc: 'right', ppn: 'right', sub: 'right' },
  tableBorder: true,
  showPpn: true, ppnPercent: 12, ppnEffective: 11,
  totals: { total: 'Total', paid: 'Pembayaran', change: 'Kembalian' },
  totalsVisible: true, totalsAlign: 'right',
  separator: 'dashed',
  footerVisible: true, footerAlign: 'center',
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

type Row = { branch_id: string | null; config: unknown }
/**
 * Format yang berlaku untuk sebuah cabang: format cabang itu bila ada, kalau tidak format global
 * (branch_id NULL), kalau tidak ada juga → bawaan aplikasi.
 */
async function fetchCfg(kind: Kind, branchId?: string | null): Promise<unknown> {
  const { data, error } = await supabase.from('print_templates').select('branch_id, config').eq('kind', kind)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]
  const own = branchId ? rows.find((r) => r.branch_id === branchId) : undefined
  const global = rows.find((r) => r.branch_id === null)
  return (own ?? global)?.config ?? {}
}
export function useReceiptCfg(branchId?: string | null): ReceiptCfg {
  const { data } = useQuery({
    queryKey: ['print-template', 'receipt', branchId ?? 'global'],
    queryFn: () => fetchCfg('receipt', branchId), staleTime: 5 * 60_000,
  })
  return useMemo(() => merge(DEFAULT_RECEIPT, data), [data])
}
export function useInvoiceCfg(branchId?: string | null): InvoiceCfg {
  const { data } = useQuery({
    queryKey: ['print-template', 'invoice', branchId ?? 'global'],
    queryFn: () => fetchCfg('invoice', branchId), staleTime: 5 * 60_000,
  })
  return useMemo(() => merge(DEFAULT_INVOICE, data), [data])
}
/** branchId null = format global/bawaan (hanya superadmin). Pengguna biasa menyimpan cabangnya sendiri. */
export async function saveTemplate(kind: Kind, config: ReceiptCfg | InvoiceCfg, branchId?: string | null) {
  const { error } = await supabase.rpc('save_print_template', { p_kind: kind, p_config: config, p_branch: branchId ?? null })
  if (error) throw new Error(error.message === 'forbidden' ? 'Anda tidak boleh mengubah format ini.' : error.message)
}
