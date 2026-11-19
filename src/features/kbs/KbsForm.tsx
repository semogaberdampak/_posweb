import { useState } from 'react'
import { Modal } from '../../shared/Modal'
import { saveKbsMember, type KbsDraft, type KbsMember } from './api'

export function KbsForm({ member, onClose, onSaved }: { member: KbsMember | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(member?.code ?? '')
  const [name, setName] = useState(member?.name ?? '')
  const [active, setActive] = useState(member?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const draft: KbsDraft = { id: member?.id ?? null, code: code.trim(), name: name.trim(), is_active: active }
    try { await saveKbsMember(draft); onSaved(); onClose() }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={member ? 'Ubah member KBS' : 'Tambah member KBS'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">Kode toko (Cust ID)</span>
          <input className="input font-mono uppercase" value={code} maxLength={40} required autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="mis. 11510001" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">Nama toko</span>
          <input className="input" value={name} maxLength={120} required
            onChange={(e) => setName(e.target.value)} placeholder="mis. KANTOR PEMASARAN JAKARTA" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> aktif (bisa dipilih di Pengaturan cabang)
        </label>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}
