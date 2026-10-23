import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { createUser, type Branch, type Role } from './api'

export function NewUserModal({ roles, branches, onClose }: { roles: Role[]; branches: Branch[]; onClose: () => void }) {
  const qc = useQueryClient()
  const allowed = roles.filter((r) => r.name !== 'superadmin') // superadmin dibuat manual lewat SQL
  const [f, setF] = useState({ full_name: '', email: '', password: '', role_id: allowed[0]?.id ?? '', branch_id: branches[0]?.id ?? '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (f.password.length < 12) return setErr('Kata sandi minimal 12 karakter.')
    setBusy(true); setErr('')
    try { await createUser({ ...f, email: f.email.trim() }); await qc.invalidateQueries({ queryKey: ['users'] }); onClose() }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal.') } finally { setBusy(false) }
  }
  return (
    <Modal title="Tambah pengguna" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" placeholder="Nama lengkap" value={f.full_name} onChange={set('full_name')} maxLength={100} required autoFocus />
        <input className="input" type="email" placeholder="Email (untuk login)" value={f.email} onChange={set('email')} required autoComplete="off" />
        <input className="input" type="password" placeholder="Kata sandi (min. 12 karakter)" value={f.password} onChange={set('password')} required autoComplete="new-password" />
        <label className="block text-sm">Role<select className="input mt-1" value={f.role_id} onChange={set('role_id')}>{allowed.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="block text-sm">Cabang<select className="input mt-1" value={f.branch_id} onChange={set('branch_id')}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" disabled={busy || !f.role_id || !f.branch_id}>{busy ? 'Membuat…' : 'Buat pengguna'}</button></div>
      </form>
    </Modal>
  )
}
