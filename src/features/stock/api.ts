import { supabase } from '../../lib/supabase'

export type BranchStock = { branch_id: string; branch_code: string; branch_name: string; is_pusat: boolean; qty: number }

/** Stok satu produk di SEMUA toko (nama cabang + jumlah saja). */
export async function stockByBranch(productId: string): Promise<BranchStock[]> {
  const { data, error } = await supabase.rpc('stock_by_branch', { p_product: productId })
  if (error) throw new Error('Gagal memuat stok')
  return (data ?? []) as BranchStock[]
}

const msg = (m: string) => (m === 'forbidden' ? 'Anda tidak punya izin untuk cabang/tindakan ini.' : m || 'Gagal menyimpan stok.')

export async function receiveStock(branchId: string, productId: string, qty: number) {
  const { error } = await supabase.rpc('adjust_stock', { p_branch: branchId, p_product: productId, p_delta: qty, p_reason: 'receive' })
  if (error) throw new Error(msg(error.message))
}

export async function setStock(branchId: string, productId: string, qty: number, note: string) {
  const { error } = await supabase.rpc('set_stock', { p_branch: branchId, p_product: productId, p_qty: qty, p_note: note.trim() || null })
  if (error) throw new Error(msg(error.message))
}
