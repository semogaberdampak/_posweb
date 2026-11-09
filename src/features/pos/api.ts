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

/** Kunci idempotensi per percobaan bayar: retry/klik ganda dengan kunci sama tidak membuat transaksi kedua. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80 // UUID v4
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Harga, diskon & cabang DIHITUNG ULANG di server; klien hanya kirim id, qty, dan persen diskon per baris. */
export async function createSale(
  lines: CartLine[], member: string, method: Method, cash?: number, branchId?: string, requestId?: string,
): Promise<SaleResult> {
  const { data, error } = await supabase.rpc('create_sale', {
    p_items: lines.map((l) => ({ product_id: l.id, qty: l.qty, discount_pct: l.disc })),
    p_member: member.trim(),
    p_method: method,
    p_cash_received: cash ?? null,
    p_branch: branchId ?? null, // hanya diterima server bila role boleh lintas cabang
    p_request_id: requestId ?? null, // kunci idempotensi; server mengembalikan transaksi yang sama bila diulang
  })
  if (error) throw new Error(error.message || 'Transaksi gagal')
  return data as SaleResult
}
