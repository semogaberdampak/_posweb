import { useState } from 'react'
import { Modal } from '../../shared/Modal'
import { draftOf, saveMember, type Member, type MemberDraft } from './api'

/** Tambah / ubah satu member. Kolom mengikuti CSV pemilik (Cust ID, Nama, Lembaga, Alamat, Kota, …). */
export function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<MemberDraft>(member ? draftOf(member) : {
    id: null, member_no: '', name: '', is_active: true, institution: '', address: '', city: '',
    province: '', phone: '', mobile: '', segment: '', segment_detail: '', balance: '',
  })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const set = (k: keyof MemberDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await saveMember(d); onSaved(); onClose() }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan member.') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={member ? 'Ubah member' : 'Tambah member'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Nomor ID (Cust ID)
            <input className="input mt-1" value={d.member_no} onChange={(e) => setD((p) => ({ ...p, member_no: e.target.value.toUpperCase() }))}
              maxLength={40} placeholder="mis. 21600001" required autoFocus />
          </label>
          <label className="block text-sm">Nama member
            <input className="input mt-1" value={d.name} onChange={set('name')} maxLength={100} required />
          </label>
          <label className="block text-sm">Lembaga
            <input className="input mt-1" value={d.institution} onChange={set('institution')} maxLength={100} placeholder="mis. Pastoran Katolik Hayam Wuruk" />
          </label>
          <label className="block text-sm">Kota
            <input className="input mt-1" value={d.city} onChange={set('city')} maxLength={100} />
          </label>
          <label className="block text-sm">Propinsi
            <input className="input mt-1" value={d.province} onChange={set('province')} maxLength={100} />
          </label>
          <label className="block text-sm">Segment
            <input className="input mt-1" value={d.segment} onChange={set('segment')} maxLength={100} placeholder="mis. Member / Lembaga Gereja" />
          </label>
          <label className="block text-sm">Telp.
            <input className="input mt-1" value={d.phone} onChange={set('phone')} maxLength={50} />
          </label>
          <label className="block text-sm">Sellular
            <input className="input mt-1" value={d.mobile} onChange={set('mobile')} maxLength={50} />
          </label>
          <label className="block text-sm">Segment detail
            <input className="input mt-1" value={d.segment_detail} onChange={set('segment_detail')} maxLength={100} placeholder="mis. Personal / Pastor / Guru/Dosen" />
          </label>
          <label className="block text-sm">Saldo (Balance)
            <input className="input mt-1" value={d.balance} onChange={set('balance')} inputMode="numeric" placeholder="0" />
          </label>
        </div>
        <label className="block text-sm">Alamat
          <textarea className="input mt-1" rows={2} value={d.address} onChange={set('address')} maxLength={300} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.is_active} onChange={(e) => setD((p) => ({ ...p, is_active: e.target.checked }))} />
          Aktif (boleh dipakai di kasir)
        </label>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy || !d.member_no.trim() || !d.name.trim()}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}
