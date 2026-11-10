import { supabase } from '../../lib/supabase'
import { cleanSearch } from '../../shared/search'

const COLS = 'id,member_no,name,is_active,institution,address,city,province,phone,mobile,segment,segment_detail,balance,active_from,active_until'

/** Data member yang dipakai di kasir (hasil RPC find_member). */
export type MemberLookup = {
  id: string; member_no: string; name: string; is_active: boolean
  institution: string | null; city: string | null; segment: string | null; segment_detail: string | null; balance: number
  active_from: string | null; active_until: string | null
}
/** Data member lengkap (halaman Membership), kolomnya mengikuti CSV pemilik. */
export type Member = MemberLookup & {
  address: string | null; province: string | null; phone: string | null; mobile: string | null
}
export type MemberDraft = {
  id: string | null; member_no: string; name: string; is_active: boolean
  institution: string; address: string; city: string; province: string; phone: string
  mobile: string; segment: string; segment_detail: string; balance: string
  active_from: string; active_until: string
}
export type MemberRowIn = {
  member_no: string; name: string; is_active: boolean
  lembaga?: string; alamat?: string; kota?: string; propinsi?: string; telp?: string
  sellular?: string; segment?: string; segment_detail?: string; saldo?: string
}

const msg = (m: string) => {
  if (m === 'forbidden') return 'Anda tidak punya izin untuk tindakan ini.'
  if (/duplicate key|sudah dipakai/i.test(m)) return 'Nomor member itu sudah dipakai member lain.'
  return m || 'Gagal menyimpan data member.'
}

/** Daftar member (untuk halaman Membership). Pencarian di server; maks. 200 baris, persempit dengan kata kunci. */
export async function listMembers(q: string, onlyActive: boolean): Promise<Member[]> {
  const s = cleanSearch(q)
  let query = supabase.from('members').select(COLS).order('member_no').limit(200)
  if (s) query = query.or(`member_no.ilike.%${s}%,name.ilike.%${s}%,city.ilike.%${s}%,institution.ilike.%${s}%`)
  if (onlyActive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error('Gagal memuat data member.')
  return (data ?? []) as Member[]
}

/** Cari member untuk kasir (nomor ID diawali / nama mengandung). RPC membatasi hasil 20 baris. */
export async function findMember(q: string): Promise<MemberLookup[]> {
  const s = q.trim().slice(0, 60)
  if (!s) return []
  const { data, error } = await supabase.rpc('find_member', { p_query: s })
  if (error) throw new Error(error.message === 'forbidden' ? 'Anda tidak punya izin mencari member.' : 'Gagal mencari member.')
  return (data ?? []) as MemberLookup[]
}

/** Kolom tambahan dikirim terpisah (p_data) supaya tanda tangan RPC tetap ringkas. */
const dataOf = (m: Pick<MemberDraft, 'institution' | 'address' | 'city' | 'province' | 'phone' | 'mobile' | 'segment' | 'segment_detail' | 'balance' | 'active_from' | 'active_until'>) => ({
  lembaga: m.institution, alamat: m.address, kota: m.city, propinsi: m.province,
  telp: m.phone, sellular: m.mobile, segment: m.segment, segment_detail: m.segment_detail, saldo: m.balance,
  masa_mulai: m.active_from, masa_sampai: m.active_until,
})

export async function saveMember(m: MemberDraft): Promise<string> {
  const { data, error } = await supabase.rpc('member_save', {
    p_id: m.id, p_no: m.member_no, p_name: m.name, p_active: m.is_active, p_data: dataOf(m),
  })
  if (error) throw new Error(msg(error.message))
  return data as string
}

/** Ubah status aktif saja, kolom lain dipertahankan dari baris yang sudah dimuat. */
export function draftOf(m: Member): MemberDraft {
  return {
    id: m.id, member_no: m.member_no, name: m.name, is_active: m.is_active,
    institution: m.institution ?? '', address: m.address ?? '', city: m.city ?? '',
    province: m.province ?? '', phone: m.phone ?? '', mobile: m.mobile ?? '',
    segment: m.segment ?? '', segment_detail: m.segment_detail ?? '',
    balance: m.balance === null || m.balance === undefined ? '' : String(m.balance),
    active_from: m.active_from ?? '', active_until: m.active_until ?? '',
  }
}

export async function deleteMember(id: string) {
  const { error } = await supabase.rpc('member_delete', { p_id: id })
  if (error) throw new Error(msg(error.message))
}

/** Ubah / perpanjang masa aktif member. Tanggal format YYYY-MM-DD; null/kosong = tanpa batas. */
export async function setActivePeriod(id: string, from: string | null, until: string | null) {
  const { error } = await supabase.rpc('member_set_active_period', {
    p_id: id, p_from: from && from.trim() ? from.trim() : null,
    p_until: until && until.trim() ? until.trim() : null,
  })
  if (error) throw new Error(msg(error.message))
}

export type MemberImportResult = { inserted: number; updated: number; skipped: number; invalid: number; invalid_sample: string[] }

/** mode timpa = perbarui nama/status/kolom lain yang ada di file (butuh hak Ubah). */
export async function importMembers(rows: MemberRowIn[], overwrite: boolean): Promise<MemberImportResult> {
  const { data, error } = await supabase.rpc('import_members', { p_rows: rows, p_overwrite: overwrite })
  if (error) throw new Error(msg(error.message))
  return data as MemberImportResult
}
