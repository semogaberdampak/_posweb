import { supabase } from '../../lib/supabase'
import { cleanSearch } from '../../shared/search'
import type { CartLine, Method, Product, SaleResult } from './types'

export async function searchProducts(q: string): Promise<Product[]> {
  const s = cleanSearch(q)
  let query = supabase.from('products').select('id,code,name,price')
    .eq('is_active', true).order('code').limit(50)
  if (s) query = query.or(`code.ilike.%${s}%,name.ilike.%${s}%`)
  const { data, error } = await query
  if (error) throw new Error('Gagal memuat produk')
  return (data ?? []) as Product[]
}

/** Harga, diskon & cabang DIHITUNG ULANG di server; klien hanya kirim id, qty, dan persen diskon per baris. */
export async function createSale(
  lines: CartLine[], member: string, method: Method, cash?: number,
): Promise<SaleResult> {
  const { data, error } = await supabase.rpc('create_sale', {
    p_items: lines.map((l) => ({ product_id: l.id, qty: l.qty, discount_pct: l.disc })),
    p_member: member.trim(),
    p_method: method,
    p_cash_received: cash ?? null,
  })
  if (error) throw new Error(error.message || 'Transaksi gagal')
  return data as SaleResult
}
