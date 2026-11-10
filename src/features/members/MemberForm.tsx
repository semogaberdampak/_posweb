import { useState } from 'react'
import { Modal } from '../../shared/Modal'
import { draftOf, saveMember, type Member, type MemberDraft } from './api'

/** Tambah / ubah satu member. Kolom mengikuti CSV pemilik (Cust ID, Nama, Lembaga, Alamat, Kota, …). */
export function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<MemberDraft>(member ? draftOf(member) : {
    id: null, member_no: '', name: '', is_active: true, institution: '', address: '', city: '',
    province: '', phone: '', mobile: '', segment: '', segment_detail: '', balance: '',
    active_from: '', active_until: '',
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
        <div className="rounded-2xl border border-border-muted bg-bg-dark p-3">
          <p className="mb-2 text-sm font-medium">Masa aktif (opsional)</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Mulai
              <input type="date" className="input mt-1" value={d.active_from} onChange={set('active_from')} />
            </label>
            <label className="block text-sm">Sampai
              <input type="date" className="input mt-1" value={d.active_until} onChange={set('active_until')} />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button type="button" className="btn-ghost !px-3 !py-1" onClick={() => {
              const base = d.active_from || new Date().toISOString().slice(0, 10)
              const dt = new Date(base); dt.setFullYear(dt.getFullYear() + 1)
              setD((p) => ({ ...p, active_from: base, active_until: dt.toISOString().slice(0, 10) }))
            }}>+1 tahun</button>
            <button type="button" className="btn-ghost !px-3 !py-1" onClick={() => {
              const base = d.active_from || new Date().toISOString().slice(0, 10)
              const dt = new Date(base); dt.setFullYear(dt.getFullYear() + 2)
              setD((p) => ({ ...p, active_from: base, active_until: dt.toISOString().slice(0, 10) }))
            }}>+2 tahun</button>
            <button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setD((p) => ({ ...p, active_from: '', active_until: '' }))}>Tanpa batas</button>
          </div>
          <p className="mt-2 text-xs text-text-muted">Kosongkan kedua tanggal untuk member tanpa batas waktu. Rentang tanggal bisa diisi manual.</p>
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy || !d.member_no.trim() || !d.name.trim()}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}
