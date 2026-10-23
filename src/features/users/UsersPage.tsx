import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Modal } from '../../shared/Modal'
import { PermMatrix, type Cell } from './PermMatrix'
import { NewUserModal } from './NewUserModal'
import * as api from './api'

const fromRole = (p?: api.RolePerm): Cell => ({ c: !!p?.can_create, r: !!p?.can_read, u: !!p?.can_update, d: !!p?.can_delete })
const fromUser = (p?: api.UserPerm): Cell => ({ c: p?.can_create ?? null, r: p?.can_read ?? null, u: p?.can_update ?? null, d: p?.can_delete ?? null })

export default function UsersPage() {
  const { can, session } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  const [userId, setUserId] = useState<string | null>(null)
  const [roleId, setRoleId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [newUser, setNewUser] = useState(false)
  const [newRole, setNewRole] = useState(false)

  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers })
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.listRoles })
  const branches = useQuery({ queryKey: ['branches'], queryFn: api.listBranches })
  const features = useQuery({ queryKey: ['features'], queryFn: api.listFeatures })
  const user = users.data?.find((u) => u.id === userId)
  const role = roles.data?.find((r) => r.id === roleId)
  const roleName = (id: string | null) => roles.data?.find((r) => r.id === id)?.name ?? '-'
  const branchName = (id: string | null) => branches.data?.find((b) => b.id === id)?.name ?? '-'

  const rp = useQuery({ queryKey: ['role-perms', roleId], queryFn: () => api.rolePerms(roleId!), enabled: !!roleId && tab === 'roles' })
  const urp = useQuery({ queryKey: ['role-perms', user?.role_id], queryFn: () => api.rolePerms(user!.role_id!), enabled: !!user?.role_id && tab === 'users' })
  const up = useQuery({ queryKey: ['user-perms', userId], queryFn: () => api.userPerms(userId!), enabled: !!userId && tab === 'users' })

  async function run(fn: () => Promise<void>, keys: unknown[][]) {
    setMsg('')
    try { await fn(); await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal menyimpan.'); await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))) }
  }

  const isSuper = (r?: api.Role) => r?.name === 'superadmin'
  const lockedUser = !user || user.id === session?.user.id || isSuper(roles.data?.find((r) => r.id === user.role_id)) || !can('users', 'u')

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-semibold">Pengguna & Hak Akses</h1>
        <button className={tab === 'users' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('users')}>Pengguna</button>
        <button className={tab === 'roles' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('roles')}>Role</button>
        {tab === 'users' && can('users', 'c') && <button className="btn-primary ml-auto flex items-center gap-1" onClick={() => setNewUser(true)}><Plus className="h-4 w-4" />Tambah pengguna</button>}
        {tab === 'roles' && can('roles', 'c') && <button className="btn-primary ml-auto flex items-center gap-1" onClick={() => setNewRole(true)}><Plus className="h-4 w-4" />Buat role</button>}
      </div>
      {msg && <p role="alert" className="rounded-2xl bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-100">{msg}</p>}

      {tab === 'users' && (
        <div className="grid min-h-0 flex-1 grid-cols-[22rem_1fr] gap-4">
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            {(users.data ?? []).map((u) => (
              <button key={u.id} onClick={() => setUserId(u.id)} className={`block w-full border-b border-slate-100 px-4 py-2 text-left dark:border-slate-700 ${u.id === userId ? 'bg-brand-100 dark:bg-brand-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}>
                <div className="font-medium">{u.full_name}{!u.is_active && <span className="ml-2 rounded-full bg-amber-100 px-2 text-[11px] text-amber-800">Nonaktif</span>}</div>
                <div className="truncate text-xs text-slate-500">{u.email} · {roleName(u.role_id)} · {branchName(u.branch_id)}</div>
              </button>
            ))}
            {users.data?.length === 0 && <p className="p-4 text-slate-500">Belum ada pengguna.</p>}
          </div>
          <div className="min-h-0 space-y-4 overflow-auto rounded-2xl bg-white p-4 shadow dark:bg-slate-800">
            {!user ? <p className="text-slate-500">Pilih pengguna di kiri.</p> : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="mr-auto"><div className="text-lg font-semibold">{user.full_name}</div><div className="text-sm text-slate-500">{user.email}</div></div>
                  <label className="text-sm">Role<select className="input mt-1" disabled={lockedUser} value={user.role_id ?? ''} onChange={(e) => run(() => api.setUserRole(user.id, e.target.value, user.branch_id!), [['users']])}>
                    {(roles.data ?? []).filter((r) => r.name !== 'superadmin' || r.id === user.role_id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                  <label className="text-sm">Cabang<select className="input mt-1" disabled={lockedUser} value={user.branch_id ?? ''} onChange={(e) => run(() => api.setUserRole(user.id, user.role_id!, e.target.value), [['users']])}>
                    {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                  <button className="btn-ghost" disabled={lockedUser} onClick={() => run(() => api.setUserActive(user.id, !user.is_active), [['users']])}>{user.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </div>
                {lockedUser && <p className="text-sm text-slate-500">Akun Anda sendiri dan akun superadmin tidak bisa diubah dari sini (pengaman agar tidak terkunci).</p>}
                <div>
                  <h3 className="mb-1 font-semibold">Hak khusus untuk pengguna ini</h3>
                  <p className="mb-2 text-sm text-slate-500">Biarkan "Ikut role" bila tidak ada pengecualian. Pilihan "Ya"/"Tidak" menimpa hak dari role {roleName(user.role_id)}. Tersimpan langsung.</p>
                  <PermMatrix features={features.data ?? []} disabled={lockedUser}
                    value={(f) => fromUser(up.data?.find((x) => x.feature_key === f))}
                    inherited={(f) => fromRole(urp.data?.find((x) => x.feature_key === f))}
                    onChange={(f, n) => run(() => api.setUserPerm(user.id, f, n.c, n.r, n.u, n.d), [['user-perms', userId]])} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="grid min-h-0 flex-1 grid-cols-[18rem_1fr] gap-4">
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            {(roles.data ?? []).map((r) => (
              <button key={r.id} onClick={() => setRoleId(r.id)} className={`block w-full border-b border-slate-100 px-4 py-2 text-left dark:border-slate-700 ${r.id === roleId ? 'bg-brand-100 dark:bg-brand-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}>
                <div className="font-medium capitalize">{r.name}</div><div className="truncate text-xs text-slate-500">{r.description ?? ''}{r.all_branches ? ' · semua cabang' : ' · cabang sendiri'}</div>
              </button>
            ))}
          </div>
          <div className="min-h-0 space-y-3 overflow-auto rounded-2xl bg-white p-4 shadow dark:bg-slate-800">
            {!role ? <p className="text-slate-500">Pilih role di kiri.</p> : (
              <>
                <h3 className="text-lg font-semibold capitalize">{role.name}</h3>
                <p className="text-sm text-slate-500">{isSuper(role) ? 'Hak superadmin tetap penuh dan tidak bisa diubah.' : 'Perubahan tersimpan langsung. Fitur baru otomatis muncul di daftar ini. Mencentang Tambah/Ubah/Hapus otomatis mencentang Lihat.'}</p>
                <PermMatrix features={features.data ?? []} disabled={isSuper(role) || !can('roles', 'u')}
                  value={(f) => fromRole(rp.data?.find((x) => x.feature_key === f))}
                  onChange={(f, n) => run(() => api.setRolePerm(role.id, f, !!n.c, !!n.r, !!n.u, !!n.d), [['role-perms', roleId]])} />
              </>
            )}
          </div>
        </div>
      )}

      {newUser && roles.data && branches.data && <NewUserModal roles={roles.data} branches={branches.data} onClose={() => setNewUser(false)} />}
      {newRole && <NewRoleModal onClose={() => setNewRole(false)} onDone={() => qc.invalidateQueries({ queryKey: ['roles'] })} />}
    </div>
  )
}

function NewRoleModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [all, setAll] = useState(false); const [err, setErr] = useState('')
  return (
    <Modal title="Buat role baru" onClose={onClose}>
      <div className="space-y-3">
        <input className="input" placeholder="Nama role (huruf kecil)" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />
        <input className="input" placeholder="Keterangan (opsional)" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Boleh melihat semua cabang (hanya superadmin yang bisa memberi)</label>
        <p className="text-sm text-slate-500">Hak awal role baru kosong; atur lewat matriks setelah dibuat.</p>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" onClick={async () => { try { await api.createRole(name, desc, all); onDone(); onClose() } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal.') } }}>Buat role</button></div>
      </div>
    </Modal>
  )
}
