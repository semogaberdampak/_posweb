import { useState } from 'react'
import { Modal } from '../../shared/Modal'
import { saveMember, type Member } from './api'

/** Tambah / ubah satu member. Nomor disimpan KAPITAL di server; tidak boleh sama dengan member lain. */
export function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
  const [no, setNo] = useState(member?.member_no ?? '')
  const [name, setName] = useState(member?.name ?? '')
  const [active, setActive] = useState(member?.is_active ?? true)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await saveMember({ id: member?.id ?? null, member_no: no, name, is_active: active }); onSaved(); onClose() }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan member.') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={member ? 'Ubah member' : 'Tambah member'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">Nomor ID member
          <input className="input mt-1" value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} maxLength={40}
            placeholder="mis. M0001" required autoFocus />
        </label>
        <label className="block text-sm">Nama member
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Aktif (boleh dipakai di kasir)
        </label>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy || !no.trim() || !name.trim()}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}
