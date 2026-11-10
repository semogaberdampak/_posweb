import { useState } from 'react'
import { Modal } from '../../shared/Modal'
import { setActivePeriod, type Member } from './api'

type Mode = 'range' | '1y' | '2y' | 'custom'

/** Perpanjang / atur masa aktif member. Pilihan durasi: rentang tanggal, 1 tahun, 2 tahun, custom. */
export function ExtendMemberModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState<Mode>('1y')
  const [start, setStart] = useState(member.active_until && member.active_until > today ? member.active_until : today)
  const [end, setEnd] = useState('')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<'days' | 'months' | 'years'>('months')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  function add(base: string, n: number, u: 'days' | 'months' | 'years') {
    const d = new Date(base)
    if (u === 'days') d.setDate(d.getDate() + n)
    else if (u === 'months') d.setMonth(d.getMonth() + n)
    else d.setFullYear(d.getFullYear() + n)
    return d.toISOString().slice(0, 10)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const base = start || today
      let until = ''
      if (mode === 'range') until = end
      else if (mode === '1y') until = add(base, 1, 'years')
      else if (mode === '2y') until = add(base, 2, 'years')
      else until = add(base, Math.max(1, Number(amount) || 1), unit)
      if (!until || until < base) { setErr('Tanggal selesai harus setelah tanggal mulai.'); return }
      await setActivePeriod(member.id, base, until)
      onSaved(); onClose()
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan masa aktif.') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`Perpanjang masa aktif — ${member.member_no}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">Pilihan durasi
          <select className="input mt-1" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="range">Rentang tanggal</option>
            <option value="1y">1 tahun</option>
            <option value="2y">2 tahun</option>
            <option value="custom">Custom (jumlah hari/bulan/tahun)</option>
          </select>
        </label>
        <label className="block text-sm">Mulai
          <input type="date" className="input mt-1" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        {mode === 'range' && (
          <label className="block text-sm">Sampai
            <input type="date" className="input mt-1" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        )}
        {mode === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Jumlah
              <input type="number" min={1} className="input mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block text-sm">Satuan
              <select className="input mt-1" value={unit} onChange={(e) => setUnit(e.target.value as 'days' | 'months' | 'years')}>
                <option value="days">Hari</option>
                <option value="months">Bulan</option>
                <option value="years">Tahun</option>
              </select>
            </label>
          </div>
        )}
        <p className="text-xs text-text-muted">
          Masa aktif sekarang: {member.active_until ? member.active_until : 'tanpa batas'}.
          Bila diperpanjang, tanggal mulai memakai nilai di atas (bisa diubah).
        </p>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}