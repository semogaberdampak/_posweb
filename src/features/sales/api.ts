import { supabase } from '../../lib/supabase'
import type { Method } from '../pos/types'

export type RecapRow = {
  id: string; invoice_no: string; created_at: string; branch_name: string; cashier_name: string
  payment_method: Method; subtotal: number; discount_amount: number; total: number
  status: 'completed' | 'void'; member_label: string | null; items_count: number
}
export type Recap = {
  total_rows: number; page: number; page_size: number
  summary: { count: number; total: number; discount: number; void_count: number; void_total: number }
  by_method: Partial<Record<Method, number>>; rows: RecapRow[]
}
export type SaleDetail = {
  id: string; invoice_no: string; created_at: string; status: 'completed' | 'void'; void_reason: string | null
  branch_name: string; cashier_name: string; payment_method: Method; subtotal: number; discount_amount: number; total: number
  cash_received: number | null; change_amount: number | null; member_label: string | null
  items: { code: string; name: string; unit_price: number; qty: number; discount_pct: number; discount_amount: number; line_total: number }[]
}
export const PAGE_SIZE = 20
const msg = (m: string) => (m === 'forbidden' ? 'Anda tidak punya akses untuk ini.' : m)

/** branchId null = semua cabang yang boleh dilihat user. Bulan 1-12. */
export async function fetchRecap(year: number, month: number, branchId: string | null, page: number): Promise<Recap> {
  const { data, error } = await supabase.rpc('sales_recap', { p_year: year, p_month: month, p_branch: branchId, p_page: page, p_page_size: PAGE_SIZE })
  if (error) throw new Error(msg(error.message))
  return data as Recap
}
export async function fetchSaleDetail(id: string): Promise<SaleDetail> {
  const { data, error } = await supabase.rpc('sale_detail', { p_sale: id })
  if (error) throw new Error(msg(error.message))
  return data as SaleDetail
}
export async function voidSale(id: string, reason: string) {
  const { error } = await supabase.rpc('void_sale', { p_sale: id, p_reason: reason.trim() })
  if (error) throw new Error(msg(error.message))
}

export type ExportSale = {
  id: string; invoice_no: string; created_at: string; branch_name: string; cashier_name: string; payment_method: Method
  subtotal: number; discount_amount: number; total: number; cash_received: number | null; change_amount: number | null
  member_label: string | null; status: 'completed' | 'void'; void_reason: string | null
}
export type ExportItem = { sale_id: string; created_at: string; invoice_no: string; code: string; name: string; unit_price: number; qty: number; discount_pct: number; discount_amount: number; line_total: number }
export type ExportData = { sales: ExportSale[]; items: ExportItem[] }

/** Seluruh transaksi + rincian barang bulan itu (bukan hanya satu halaman). */
export async function fetchExport(year: number, month: number, branchId: string | null): Promise<ExportData> {
  const { data, error } = await supabase.rpc('sales_export', { p_year: year, p_month: month, p_branch: branchId, p_limit: 20000 })
  if (error) throw new Error(msg(error.message))
  return data as ExportData
}
