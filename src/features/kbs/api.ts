import { supabase } from '../../lib/supabase'
import { cleanSearch } from '../../shared/search'

export type KbsMember = {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}
export type KbsList = {
  rows: KbsMember[]
  matched: number
  total: number
  active: number
  inactive: number
}
export type KbsRowIn = { code: string; name: string; is_active?: boolean }
export type KbsImportResult = { rows: number; inserted: number; updated: number; invalid: number; invalid_sample: string[] }
export type KbsDraft = { id: string | null; code: string; name: string; is_active: boolean }

const msg = (m: string) => {
  if (m === 'forbidden') return 'Anda tidak punya izin untuk tindakan ini.'
  if (/duplicate key|sudah dipakai/i.test(m)) return 'Kode member toko itu sudah dipakai toko lain.'
  return m || 'Gagal menyimpan data member toko.'
}

/** Daftar member toko KBS (maks. 200 baris) + jumlah seluruh tabel. */
export async function listKbsMembers(q: string, onlyActive: boolean): Promise<KbsList> {
  const { data, error } = await supabase.rpc('kbs_member_list', {
    p_query: cleanSearch(q), p_only_active: onlyActive, p_limit: 200, p_offset: 0,
  })
  if (error) throw new Error(error.message === 'forbidden' ? 'Anda tidak punya izin melihat data member KBS.' : 'Gagal memuat data member KBS.')
  return data as KbsList
}

export async function saveKbsMember(m: KbsDraft): Promise<string> {
  const { data, error } = await supabase.rpc('kbs_member_save', {
    p_id: m.id, p_code: m.code, p_name: m.name, p_active: m.is_active,
  })
  if (error) throw new Error(msg(error.message))
  return data as string
}

export async function deleteKbsMember(id: string) {
  const { error } = await supabase.rpc('kbs_member_delete', { p_id: id })
  if (error) throw new Error(msg(error.message))
}

/**
 * Impor per 1.000 baris supaya satu permintaan tidak melewati batas waktu server.
 * Hasil tiap bagian dijumlahkan.
 */
export async function importKbsMembers(rows: KbsRowIn[]): Promise<KbsImportResult> {
  const out: KbsImportResult = { rows: 0, inserted: 0, updated: 0, invalid: 0, invalid_sample: [] }
  for (let i = 0; i < rows.length; i += 1000) {
    const part = rows.slice(i, i + 1000)
    const { data, error } = await supabase.rpc('import_kbs_members', { p_rows: part })
    if (error) throw new Error(msg(error.message))
    const r = data as KbsImportResult
    out.rows += r.rows; out.inserted += r.inserted; out.updated += r.updated; out.invalid += r.invalid
    if (out.invalid_sample.length < 5) out.invalid_sample.push(...r.invalid_sample.slice(0, 5 - out.invalid_sample.length))
  }
  return out
}
