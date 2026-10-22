import { supabase } from '../../lib/supabase'
import type { ProductRow } from '../products/api'

export type { ProductRow }
export type TransferLine = { product_id: string; product_code: string; product_name: string; qty: number }

export async function getStockMoveEligibleProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id,code,name,price,is_active')
    .eq('is_active', true)
    .order('code')
  if (error) throw new Error('Gagal memuat produk.')
  return (data ?? []) as ProductRow[]
}

/** Ambil stok saat ini produk di PUSAT (sumber) dan semua cabang yang bisa dilihat */
export async function stockByBranch(productId: string): Promise<{ branch_id: string; branch_code: string; branch_name: string; qty: number }[]> {
  const { data, error } = await supabase.rpc('stock_by_branch', { p_product: productId })
  if (error) throw new Error('Gagal memuat stok.')
  return (data ?? []).map((b: any) => ({ branch_id: b.branch_id, branch_code: b.branch_code, branch_name: b.branch_name, qty: b.qty })) as any
}

export async function transferStock(payload: { product_id: string; qty: number; note: string; dst_branch: string }) {
  const { error } = await supabase.rpc('transfer_stock', {
    p_branch: payload.dst_branch,
    p_product: payload.product_id,
    p_qty: payload.qty,
    p_note: payload.note,
  })
  if (error) throw new Error(error.message || 'Transaksi gagal.')
}
