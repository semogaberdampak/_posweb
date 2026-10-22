import { supabase } from '../../lib/supabase'
import { cleanSearch } from '../../shared/search'

export type Attr = { k: string; v: unknown }
export type ProductRow = {
  id: string; code: string; name: string; price: number
  author: string | null; is_active: boolean; attributes: Attr[]
}
export type StatusFilter = 'active' | 'inactive' | 'all'
export const PAGE_SIZE = 50

export async function listProducts(q: string, status: StatusFilter, page: number) {
  const s = cleanSearch(q)
  let query = supabase.from('products')
    .select('id,code,name,price,author,is_active,attributes')
    .order('code')
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) // PAGE_SIZE+1 baris: kelebihan satu = ada halaman berikut
  if (status !== 'all') query = query.eq('is_active', status === 'active')
  if (s) query = query.or(`code.ilike.%${s}%,name.ilike.%${s}%,author.ilike.%${s}%`)
  const { data, error } = await query
  if (error) throw new Error('Gagal memuat produk')
  const all = (data ?? []) as ProductRow[]
  return { rows: all.slice(0, PAGE_SIZE), hasNext: all.length > PAGE_SIZE }
}

export type ProductInput = { id?: string; code: string; name: string; price: number; author: string; is_active: boolean }

export async function saveProduct(p: ProductInput): Promise<void> {
  const base = { name: p.name.trim(), price: p.price, author: p.author.trim() || null, is_active: p.is_active }
  if (p.id) {
    const { data, error } = await supabase.from('products').update(base).eq('id', p.id).select('id')
    if (error) throw new Error(mapError(error.code))
    if (!data?.length) throw new Error('Anda tidak punya izin mengubah produk ini.')
  } else {
    const { error } = await supabase.from('products').insert({ ...base, code: p.code.trim() })
    if (error) throw new Error(mapError(error.code))
  }
}

function mapError(code?: string) {
  if (code === '23505') return 'Kode produk sudah dipakai.'
  if (code === '23514') return 'Produk aktif harus berharga lebih dari 0.'
  if (code === '42501') return 'Anda tidak punya izin untuk tindakan ini.'
  return 'Gagal menyimpan. Coba lagi.'
}

/** Harga beli: RLS hanya mengizinkan role dengan hak cost_prices; selain itu hasilnya kosong. */
export async function getProductCosts(productId: string): Promise<Attr[]> {
  const { data, error } = await supabase.from('product_costs').select('attributes').eq('product_id', productId).maybeSingle()
  if (error) return []
  return ((data?.attributes ?? []) as Attr[])
}
