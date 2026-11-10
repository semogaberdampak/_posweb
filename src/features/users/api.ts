import { supabase } from '../../lib/supabase'

export type UserRow = { id: string; email: string; full_name: string; branch_id: string | null; role_id: string | null; is_active: boolean }
export type Role = { id: string; name: string; description: string | null; all_branches: boolean; is_system: boolean }
export type Branch = { id: string; code: string; name: string; is_pusat: boolean; short_name: string | null }
export type Feature = { key: string; label: string }
export type RolePerm = { feature_key: string; can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean }
export type UserPerm = { feature_key: string; can_create: boolean | null; can_read: boolean | null; can_update: boolean | null; can_delete: boolean | null }
export const EMAIL_DOMAIN = 'takom.id' // semua akun baru: <username>@takom.id (dijaga juga di DB: migrasi 006)
export type Tri = boolean | null // null = ikut role

const fail = (m: string): never => { throw new Error(m === 'forbidden' ? 'Anda tidak punya izin untuk tindakan ini.' : m || 'Gagal menyimpan.') }
async function rpc(fn: string, args: Record<string, unknown>) { const { error } = await supabase.rpc(fn, args); if (error) fail(error.message) }

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase.rpc('list_users'); if (error) fail('Gagal memuat pengguna'); return (data ?? []) as UserRow[]
}
export async function listRoles(): Promise<Role[]> {
  const { data } = await supabase.from('roles').select('id,name,description,all_branches,is_system').order('name'); return (data ?? []) as Role[]
}
export async function listBranches(): Promise<Branch[]> {
  const { data } = await supabase.from('branches').select('id,code,name,is_pusat,short_name').eq('is_active', true).order('name'); return (data ?? []) as Branch[]
}
export async function listFeatures(): Promise<Feature[]> {
  const { data } = await supabase.from('features').select('key,label').order('label'); return (data ?? []) as Feature[]
}
export async function rolePerms(roleId: string): Promise<RolePerm[]> {
  const { data } = await supabase.from('role_permissions').select('feature_key,can_create,can_read,can_update,can_delete').eq('role_id', roleId); return (data ?? []) as RolePerm[]
}
export async function userPerms(userId: string): Promise<UserPerm[]> {
  const { data } = await supabase.from('user_permissions').select('feature_key,can_create,can_read,can_update,can_delete').eq('user_id', userId); return (data ?? []) as UserPerm[]
}

export const setRolePerm = (role: string, feature: string, c: boolean, r: boolean, u: boolean, d: boolean) =>
  rpc('set_role_permission', { p_role: role, p_feature: feature, p_c: c, p_r: r, p_u: u, p_d: d })
export const setUserPerm = (user: string, feature: string, c: Tri, r: Tri, u: Tri, d: Tri) =>
  rpc('set_user_permission', { p_user: user, p_feature: feature, p_c: c, p_r: r, p_u: u, p_d: d })
export const setUserRole = (user: string, role: string, branch: string) => rpc('set_user_role', { p_user: user, p_role: role, p_branch: branch })
export const setUserActive = (user: string, active: boolean) => rpc('set_user_active', { p_user: user, p_active: active })
export const createRole = (name: string, desc: string, allBranches: boolean) => rpc('create_role', { p_name: name, p_desc: desc, p_all_branches: allBranches })

/**
 * Memanggil Edge Function dan menyusun pesan galat yang bisa ditindaklanjuti.
 * - Ada balasan server (4xx/5xx): pakai pesan JSON dari fungsi + kode HTTP.
 * - Tanpa balasan (CORS/jaringan/fungsi belum dipasang): jelaskan kemungkinan sebabnya.
 */
async function invokeFn(name: string, body: Record<string, unknown>, fallback: string) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  console.error(`[${name}]`, error)
  const res = (error as { context?: Response }).context
  let detail = '', status: number | null = null
  if (res && typeof res.text === 'function' && typeof res.status === 'number') {
    status = res.status
    try {
      const txt = await res.text()
      try {
        const j = JSON.parse(txt) as { error?: string; message?: string; msg?: string }
        detail = String(j.error ?? j.message ?? j.msg ?? '')
      } catch { detail = txt.trim().slice(0, 200) }
    } catch { /* abaikan, pakai pesan umum */ }
  }
  if (status === 404) throw new Error(`Fungsi \`${name}\` belum dipasang di Supabase (HTTP 404).`)
  if (status === null) {
    throw new Error(
      `${fallback} Server tidak menjawab sama sekali — biasanya karena secret ALLOWED_ORIGIN belum berisi alamat web ini ` +
        '(CORS menolak) atau fungsinya belum di-deploy. Lihat detail di Console browser (F12).'
    )
  }
  throw new Error(`${detail || fallback} (HTTP ${status})`)
}

/** Membuat akun login butuh kunci rahasia, jadi dikerjakan Edge Function `create-user` (lihat supabase/functions). */
export const createUser = (body: { full_name: string; username: string; password: string; role_id: string; branch_id: string }) =>
  invokeFn('create-user', body, 'Gagal membuat pengguna. Pastikan fungsi create-user sudah dipasang di Supabase.')

/** Hanya superadmin (dicek di Edge Function `reset-password`). */
export const resetPassword = (userId: string, password: string) =>
  invokeFn('reset-password', { user_id: userId, password }, 'Gagal mereset kata sandi. Pastikan fungsi reset-password sudah dipasang di Supabase.')
