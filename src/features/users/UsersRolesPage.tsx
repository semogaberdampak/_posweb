import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { listUsers, updateUser, listRoles, saveRole, deleteRole, listFeatures, listRolePermissions, saveRolePermissions } from './api'
import type { ProfileRow, RoleRow, PermRow } from './api'

function badge(variant: 'ok' | 'warn' | 'muted' | 'sys') {
  const base = 'px-2 py-0.5 rounded-full text-xs font-medium'
  const m: Record<string, string> = { 
    ok: 'bg-success-200 text-success-800 dark:bg-success-800 dark:text-success-100', 
    warn: 'bg-warning-200 text-warning-800 dark:bg-warning-800 dark:text-warning-100', 
    muted: 'bg-bg-200 text-fg-200', 
    sys: 'bg-bg-200 text-fg-200' 
  }
  return base + ' ' + m[variant]
}

function UsersTab({ canRoles }: { canRoles: (action: 'c' | 'r' | 'u' | 'd') => boolean }) {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: listUsers, enabled: canRoles('r') })
  const upd = useMutation({ mutationFn: ({ id, changes }: { id: string; changes: Partial<ProfileRow> }) => updateUser(id, changes), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }) })
  if (isLoading) return <div className="p-6 text-fg-200">Memuat daftar pengguna…</div>
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pengguna</h1>
        {canRoles('c') && <button className="btn-primary flex items-center gap-2"><span style={{display:'inline-flex'}}>+</span> Tambah Pengguna</button>}
      </div>
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border bg-bg-100"><th className="px-4 py-3 font-medium">Nama</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Cabang</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium text-center">Aktif</th><th className="px-4 py-3 font-medium text-center">Aksi</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border hover:bg-bg-100">
                <td className="px-4 py-3">{u.full_name}</td>
                <td className="px-4 py-3 text-fg-200">{u.id}</td>
                <td className="px-4 py-3">{'-'}</td>
                <td className="px-4 py-3">{'-'}</td>
                <td className="px-4 py-3 text-center"><button className={`rounded-full p-1 transition ${u.is_active ? 'bg-success-200 text-success-800 dark:bg-success-800 dark:text-success-100' : 'bg-bg-200 text-fg-200'}`} onClick={() => upd.mutate({ id: u.id, changes: { is_active: !u.is_active } })}>{u.is_active ? <span>ON</span> : <span>OFF</span>}</button></td>
                <td className="px-4 py-3 text-center">{canRoles('u') && <button className="rounded-full p-1.5 hover:bg-bg-200"><span>U</span></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RolesTab({ canRoles }: { canRoles: (action: 'c' | 'r' | 'u' | 'd') => boolean }) {
  const qc = useQueryClient()
  const { data: roles = [], isLoading } = useQuery({ queryKey: ['admin-roles'], queryFn: listRoles, enabled: canRoles('r') })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [form, setForm] = useState({ name: '', description: '', all_branches: false })
  const sav = useMutation({ mutationFn: (r: { id?: string; name: string; description?: string | null; all_branches?: boolean }) => saveRole(r), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-roles'] }); setOpen(false) } })
  const del = useMutation({ mutationFn: deleteRole, onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-roles'] }) })
  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', all_branches: false }); setOpen(true) }
  const openEdit = (r: RoleRow) => { setEditing(r); setForm({ name: r.name, description: r.description ?? '', all_branches: r.all_branches }); setOpen(true) }
  const handleDel = (id: string, name: string) => { if (window.confirm('Hapus role "' + name + '"?')) del.mutate(id) }
  const saveForm = () => { if (!form.name.trim()) return; sav.mutate({ id: editing?.id, name: form.name.trim(), description: form.description.trim() || null, all_branches: form.all_branches }) }
  if (isLoading) return <div className="p-6 text-fg-200">Memuat daftar role…</div>
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Role</h1>{canRoles('c') && <button className="btn-primary flex items-center gap-2" onClick={openCreate}><span style={{display:'inline-flex'}}>+</span> Tambah Role</button>}</div>
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border bg-bg-100"><th className="px-4 py-3 font-medium">Nama Role</th><th className="px-4 py-3 font-medium">Deskripsi</th><th className="px-4 py-3 font-medium text-center">Semua Cabang</th><th className="px-4 py-3 font-medium text-center">Sistem</th><th className="px-4 py-3 font-medium text-center">Aksi</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-b border-border hover:bg-bg-100">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-fg-200">{r.description ?? '-'}</td>
                <td className="px-4 py-3 text-center">{r.all_branches ? <span className="text-xs font-medium text-primary-400">Ya</span> : 'Tidak'}</td>
                <td className="px-4 py-3 text-center">{r.is_system ? <span className={badge('sys')}>Ya</span> : <span className={badge('muted')}>Tidak</span>}</td>
                <td className="px-4 py-3 text-center">
                  {!r.is_system && canRoles('u') && <button onClick={() => openEdit(r)} className="rounded-full p-1.5 hover:bg-bg-200"><span>U</span></button>}
                  {!r.is_system && canRoles('d') && <button onClick={() => handleDel(r.id, r.name)} className="rounded-full p-1.5 hover:bg-bg-200 text-red-500"><span>H</span></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <Modal title={editing ? 'Ubah Role' : 'Buat Role Baru'} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Nama Role</label><input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Deskripsi</label><input className="input w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.all_branches} onChange={(e) => setForm({ ...form, all_branches: e.target.checked })} /> Akses semua cabang</label>
          {editing?.is_system && <p className="text-xs text-warning-600 dark:text-warning-400">Role sistem tidak dapat diubah namanya.</p>}
          <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => setOpen(false)}>Batal</button><button className="btn-primary" onClick={saveForm} disabled={sav.isPending}>{sav.isPending ? 'Menyimpan…' : 'Simpan'}</button></div>
        </div>
      </Modal>}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 print:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full overflow-auto rounded-3xl bg-bg p-6 shadow-xl dark:bg-bg-200 max-w-md">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded-full p-1.5 hover:bg-bg-100 dark:hover:bg-bg-300" onClick={onClose}><span>X</span></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PermissionsTab({ canRoles }: { canRoles: (action: 'c' | 'r' | 'u' | 'd') => boolean }) {
  const qc = useQueryClient()
  const { data: roles = [], isLoading: rolesLoading } = useQuery({ queryKey: ['admin-roles-perm'], queryFn: listRoles, enabled: canRoles('r') })
  const { data: features = [], isLoading: featuresLoading } = useQuery({ queryKey: ['admin-features'], queryFn: listFeatures, enabled: canRoles('r') })
  const [selRoleId, setSelRoleId] = useState<string | null>(null)
  const [perms, setPerms] = useState<Record<string, PermRow>>({})
  useEffect(() => { if (!selRoleId) return; listRolePermissions(selRoleId).then((rows) => { const m: Record<string, PermRow> = {}; rows.forEach((r) => { m[r.feature_key] = r }); setPerms(m) }) }, [selRoleId])
  if (rolesLoading || featuresLoading) return <div className="p-6 text-fg-200">Memuat…</div>
  const saveAll = useCallback(async () => { if (!selRoleId) return; await saveRolePermissions(selRoleId, perms); qc.invalidateQueries({ queryKey: ['admin-role-perms'] }) }, [selRoleId, perms, qc])
  const ensurePerm = useCallback((key: string): PermRow => { if (perms[key]) return perms[key]; return { feature_key: key, can_create: false, can_read: false, can_update: false, can_delete: false } }, [perms])
  if (!selRoleId) {
    return (<div className="flex h-full flex-col gap-3 p-4"><h1 className="text-xl font-semibold">Matriks Hak Akses per Role</h1><p className="text-sm text-fg-200">Pilih role di bawah untuk mengatur izin C/R/U/D pada setiap fitur.</p><div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-bg p-4"><table className="w-full text-left text-sm"><thead><tr><th className="px-4 py-2">Role</th></tr></thead><tbody>{roles.map((r) => (<tr key={r.id} onClick={() => setSelRoleId(r.id)} className="cursor-pointer border-t border-border hover:bg-bg-100"><td className="px-4 py-2">{r.name} {r.is_system && <span className="ml-2 text-xs text-warning-600 dark:text-warning-400">(sistem)</span>}</td></tr>))}</tbody></table></div></div>)
  }
  const role = roles.find((r) => r.id === selRoleId)!
  const cols = ['c', 'r', 'u', 'd']
  const cl: Record<string, string> = { c: 'Buat', r: 'Baca', u: 'Ubah', d: 'Hapus' }
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Matriks Hak Akses: {role.name}</h1><button className="btn-primary flex items-center gap-2" onClick={() => { saveAll().then(() => alert('Hak akses disimpan.')) }}><span style={{display:'inline-flex'}}>S</span> Simpan Semua</button></div>
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border bg-bg-100"><th className="px-4 py-3 font-medium">Fitur</th>{cols.map((c) => (<th key={c} className="px-4 py-3 font-medium text-center">{cl[c]}</th>))}<th className="px-4 py-3 font-medium text-center">Sistem</th><th className="px-4 py-3 font-medium text-right">Aksi</th></tr></thead>
          <tbody>
            {features.map((f) => {
              const p = ensurePerm(f.key)
              return (<tr key={f.key} className="border-b border-border"><td className="px-4 py-3">{f.label}</td>{cols.map((c) => { const v = c === 'c' ? p.can_create : c === 'r' ? p.can_read : c === 'u' ? p.can_update : p.can_delete; return (<td key={c} className="px-4 py-3 text-center"><input type="checkbox" checked={v} onChange={(e) => { const np = { ...p }; if (c === 'c') np.can_create = e.target.checked; if (c === 'r') np.can_read = e.target.checked; if (c === 'u') np.can_update = e.target.checked; if (c === 'd') np.can_delete = e.target.checked; setPerms({ ...perms, [f.key]: np }) }} className="rounded" /></td>) })}<td className="px-4 py-3 text-center">{role.is_system ? <span className={badge('sys')}>Ya</span> : <span className={badge('muted')}>Tidak</span>}</td><td className="px-4 py-3 text-right"><button className="btn-ghost text-xs px-2 py-1 hover:bg-bg-200" onClick={() => { const np: PermRow = { feature_key: f.key, can_create: true, can_read: true, can_update: true, can_delete: true }; setPerms({ ...perms, [f.key]: np }) }}>Semua</button></td></tr>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function UsersRolesPage() {
  const { can } = useAuth()
  const canRoles = (action: 'c' | 'r' | 'u' | 'd') => can('users', action)
  const [tab, setTab] = useState<'users' | 'roles' | 'perms'>('users')
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'users' ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' : 'text-fg-200 hover:bg-bg-200'}`}><span style={{display:'inline-flex'}}>U</span> Pengguna</button>
        <button onClick={() => setTab('roles')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'roles' ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' : 'text-fg-200 hover:bg-bg-200'}`}><span style={{display:'inline-flex'}}>R</span> Role</button>
        <button onClick={() => setTab('perms')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'perms' ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20' : 'text-fg-200 hover:bg-bg-200'}`}><span style={{display:'inline-flex'}}>P</span> Hak Akses</button>
      </div>
      {tab === 'users' && <UsersTab canRoles={canRoles} />}
      {tab === 'roles' && <RolesTab canRoles={canRoles} />}
      {tab === 'perms' && <PermissionsTab canRoles={canRoles} />}
    </div>
  )
}
