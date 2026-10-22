import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { receiveStock, setStock, type BranchStock } from './api'

export type EditTarget = { mode: 'in' | 'set'; branch: BranchStock; productId: string; productName: string }

export function StockEdit({ t, onClose }: { t: EditTarget; onClose: () => void }) {
  const qc = useQueryClient()
  const [val, setVal] = useState(t.mode === 'set' ? String(t.branch.qty) : '')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(val)
    if (!Number.isInteger(n) || (t.mode === 'in' ? n <= 0 : n < 0)) return setErr(t.mode === 'in' ? 'Jumlah masuk harus angka bulat lebih dari 0.' : 'Jumlah harus angka bulat 0 atau lebih.')
    setBusy(true); setErr('')
    try {
      if (t.mode === 'in') await receiveStock(t.branch.branch_id, t.productId, n)
      else await setStock(t.branch.branch_id, t.productId, n, note)
      await qc.invalidateQueries({ queryKey: ['stock-branches'] })
      onClose()
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal menyimpan.') } finally { setBusy(false) }
  }

  return (
    <Modal title={t.mode === 'in' ? 'Barang masuk' : 'Stok aktual (hasil hitung)'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.productName}<br />Cabang: <b>{t.branch.branch_name}</b> · stok sekarang: <b>{t.branch.qty}</b></p>
        <label className="block text-sm">{t.mode === 'in' ? 'Jumlah barang masuk' : 'Jumlah stok aktual'}
          <input className="input mt-1" inputMode="numeric" value={val} autoFocus onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))} />
        </label>
        {t.mode === 'set' && (
          <label className="block text-sm">Catatan (opsional)
            <input className="input mt-1" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="mis. stok opname Oktober" />
          </label>
        )}
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}
