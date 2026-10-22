import { supabase } from '../../lib/supabase'

export type ProfileRow = {
  id: string
  full_name: string
  branch_id: string | null
  role_id: string | null
  is_active: boolean
  branch_name?: string | null
  role_name?: string | null
}

export type RoleRow = {
  id: string
  name: string
  description: string | null
  all_branches: boolean
  is_system: boolean
}

export type FeatureRow = { key: string; label: string }

export type PermRow = {
  feature_key: string
  can_create: boolean
  can_read: boolean
  can_update: boolean
  can_delete: boolean
}

export type RoleInput = {
  id?: string
  name: string
  description?: string | null
  all_branches?: boolean
}

export async function listUsers(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,branch_id,role_id,is_active,branches(name),roles(name)')
    .order('full_name')
  if (error) throw new Error('Gagal memuat daftar pengguna')
  const rows = (data ?? []) as unknown as ProfileRow[]
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    branch_id: r.branch_id,
    role_id: r.role_id,
    is_active: r.is_active,
    branch_name: (r as any).branches?.name ?? null,
    role_name: (r as any).roles?.name ?? null,
  }))
}

export async function updateUser(
  id: string,
  changes: { role_id?: string | null; branch_id?: string | null; is_active?: boolean },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(changes).eq('id', id)
  if (error) throw new Error('Gagal memperbarui pengguna')
}

export async function listRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('id,name,description,all_branches,is_system')
    .order('name')
  if (error) throw new Error('Gagal memuat daftar role')
  return (data ?? []) as RoleRow[]
}

export async function saveRole(role: RoleInput): Promise<void> {
  if (role.id) {
    const { error } = await supabase
      .from('roles')
      .update({
        name: role.name.trim(),
        description: role.description ?? null,
        all_branches: role.all_branches ?? false,
      })
      .eq('id', role.id)
    if (error) throw new Error('Gagal memperbarui role')
  } else {
    const { error } = await supabase.from('roles').insert({
      name: role.name.trim(),
      description: role.description ?? null,
      all_branches: role.all_branches ?? false,
      is_system: false,
    })
    if (error) throw new Error('Gagal membuat role')
  }
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw new Error('Gagal menghapus role')
}

export async function listFeatures(): Promise<FeatureRow[]> {
  const { data, error } = await supabase.from('features').select('key,label').order('key')
  if (error) throw new Error('Gagal memuat daftar fitur')
  return (data ?? []) as FeatureRow[]
}

export async function listRolePermissions(roleId: string): Promise<PermRow[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('feature_key,can_create,can_read,can_update,can_delete')
    .eq('role_id', roleId)
  if (error) throw new Error('Gagal memuat hak akses role')
  return (data ?? []) as PermRow[]
}

export async function saveRolePermissions(
  roleId: string,
  perms: { feature_key: string; can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean }[],
): Promise<void> {
  const rows = perms.map((p) => ({
    role_id: roleId,
    feature_key: p.feature_key,
    can_create: p.can_create,
    can_read: p.can_read,
    can_update: p.can_update,
    can_delete: p.can_delete,
  }))
  const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role_id,feature_key' as any })
  if (error) throw new Error('Gagal menyimpan hak akses role')
}