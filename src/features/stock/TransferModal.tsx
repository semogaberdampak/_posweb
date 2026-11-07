import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { transferStock, type BranchStock } from './api'

export function TransferModal({ productId, productName, stocks, defaultFrom, onClose }: { productId: string; productName: string; stocks: BranchStock[]; defaultFrom: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(stocks.find((s) => s.branch_id === defaultFrom)?.branch_id ?? stocks[0]?.branch_id ?? '')
  const [to, setTo] = useState(stocks.find((s) => s.branch_id !== from)?.branch_id ?? '')
  const [qty, setQty] = useState(''); const [note, setNote] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const avail = stocks.find((s) => s.branch_id === from)?.qty ?? 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(qty)
    if (!to || from === to) return setErr('Pilih cabang tujuan yang berbeda.')
    if (!Number.isInteger(n) || n <= 0) return setErr('Jumlah harus angka bulat lebih dari 0.')
    if (n > avail) return setErr(`Stok di cabang asal hanya ${avail}.`)
    setBusy(true); setErr('')
    try { await transferStock(from, to, productId, n, note); await qc.invalidateQueries({ queryKey: ['stock-branches'] }); onClose() }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal.') } finally { setBusy(false) }
  }
  return (
    <Modal title="Pindah stok antar cabang" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-text-muted">{productName}</p>
        <label className="block text-sm">Dari<select className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)}>{stocks.map((s) => <option key={s.branch_id} value={s.branch_id}>{s.branch_name} (stok {s.qty})</option>)}</select></label>
        <label className="block text-sm">Ke<select className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)}><option value="">— pilih —</option>{stocks.filter((s) => s.branch_id !== from).map((s) => <option key={s.branch_id} value={s.branch_id}>{s.branch_name} (stok {s.qty})</option>)}</select></label>
        <input className="input" inputMode="numeric" placeholder="Jumlah" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} autoFocus />
        <input className="input" placeholder="Catatan (opsional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" disabled={busy}>{busy ? 'Memindahkan…' : 'Pindahkan'}</button></div>
      </form>
    </Modal>
  )
}
