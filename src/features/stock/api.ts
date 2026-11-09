import { supabase } from '../../lib/supabase'

export type BranchStock = { branch_id: string; branch_code: string; branch_name: string; branch_short: string; is_pusat: boolean; qty: number }

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

export type ImportResult = { inserted: number; updated: number; skipped: number; same: number; unknown_count: number; unknown: string[] }

/** mode 'fill' = hanya mengisi produk yang belum punya stok di cabang itu; 'set' = timpa dengan hasil hitung (opname). */
export async function importStock(branchId: string, rows: { code: string; qty: number }[], mode: 'fill' | 'set'): Promise<ImportResult> {
  const { data, error } = await supabase.rpc('import_stock', { p_branch: branchId, p_rows: rows, p_mode: mode })
  if (error) throw new Error(msg(error.message))
  return data as ImportResult
}

export async function transferStock(from: string, to: string, productId: string, qty: number, note: string) {
  const { error } = await supabase.rpc('transfer_stock', { p_from: from, p_to: to, p_product: productId, p_qty: qty, p_note: note.trim() || null })
  if (error) throw new Error(msg(error.message))
}

/** Pindahkan banyak produk sekaligus dari satu cabang ke cabang lain. Satu transaksi: gagal satu = batal semua. */
export async function transferBatch(from: string, to: string, lines: { product_id: string; qty: number }[], note: string): Promise<number> {
  const { data, error } = await supabase.rpc('transfer_stock_batch', { p_from: from, p_to: to, p_lines: lines, p_note: note.trim() || null })
  if (error) throw new Error(msg(error.message))
  return Number(data)
}
