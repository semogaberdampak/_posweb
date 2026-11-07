import { supabase } from '../../lib/supabase'

export type UserRow = { id: string; email: string; full_name: string; branch_id: string | null; role_id: string | null; is_active: boolean }
export type Role = { id: string; name: string; description: string | null; all_branches: boolean; is_system: boolean }
export type Branch = { id: string; code: string; name: string; is_pusat: boolean }
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
  const { data } = await supabase.from('branches').select('id,code,name,is_pusat').eq('is_active', true).order('name'); return (data ?? []) as Branch[]
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

async function invokeFn(name: string, body: Record<string, unknown>, fallback: string) {
  const { error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let m = fallback
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) m = j.error } catch { /* pakai pesan umum */ }
    throw new Error(m)
  }
}

/** Membuat akun login butuh kunci rahasia, jadi dikerjakan Edge Function `create-user` (lihat supabase/functions). */
export const createUser = (body: { full_name: string; username: string; password: string; role_id: string; branch_id: string }) =>
  invokeFn('create-user', body, 'Gagal membuat pengguna. Pastikan fungsi create-user sudah dipasang di Supabase.')

/** Hanya superadmin (dicek di Edge Function `reset-password`). */
export const resetPassword = (userId: string, password: string) =>
  invokeFn('reset-password', { user_id: userId, password }, 'Gagal mereset kata sandi. Pastikan fungsi reset-password sudah dipasang di Supabase.')
