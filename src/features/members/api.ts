import { supabase } from '../../lib/supabase'
import { cleanSearch } from '../../shared/search'

export type Member = { id: string; member_no: string; name: string; is_active: boolean }

const msg = (m: string) => (m === 'forbidden'
  ? 'Anda tidak punya izin untuk tindakan ini.'
  : m || 'Gagal menyimpan data member.')

/** Daftar member (untuk halaman Membership). Pencarian di server; maks. 200 baris, persempit dengan kata kunci. */
export async function listMembers(q: string, onlyActive: boolean): Promise<Member[]> {
  const s = cleanSearch(q)
  let query = supabase.from('members').select('id,member_no,name,is_active').order('member_no').limit(200)
  if (s) query = query.or(`member_no.ilike.%${s}%,name.ilike.%${s}%`)
  if (onlyActive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error('Gagal memuat data member.')
  return (data ?? []) as Member[]
}

/** Cari member untuk kasir (nomor ID diawali / nama mengandung). RPC membatasi hasil 20 baris. */
export async function findMember(q: string): Promise<Member[]> {
  const s = q.trim().slice(0, 60)
  if (!s) return []
  const { data, error } = await supabase.rpc('find_member', { p_query: s })
  if (error) throw new Error(error.message === 'forbidden' ? 'Anda tidak punya izin mencari member.' : 'Gagal mencari member.')
  return (data ?? []) as Member[]
}

export async function saveMember(m: { id: string | null; member_no: string; name: string; is_active: boolean }): Promise<string> {
  const { data, error } = await supabase.rpc('member_save', {
    p_id: m.id, p_no: m.member_no, p_name: m.name, p_active: m.is_active,
  })
  if (error) throw new Error(msg(error.message))
  return data as string
}

export async function deleteMember(id: string) {
  const { error } = await supabase.rpc('member_delete', { p_id: id })
  if (error) throw new Error(msg(error.message))
}

export type MemberImportResult = { inserted: number; updated: number; skipped: number; invalid: number; invalid_sample: string[] }

/** mode timpa = perbarui nama/status member yang nomornya sudah ada (butuh hak Ubah). */
export async function importMembers(rows: { member_no: string; name: string; is_active: boolean }[], overwrite: boolean): Promise<MemberImportResult> {
  const { data, error } = await supabase.rpc('import_members', { p_rows: rows, p_overwrite: overwrite })
  if (error) throw new Error(msg(error.message))
  return data as MemberImportResult
}
