import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { rupiah } from '../../shared/format'
import { useAuth } from '../auth/AuthProvider'
import { PrintSheet } from '../print/views'
import { triggerPrint, usePrintPrefs } from '../print/printing'
import { useInvoiceCfg, useReceiptCfg, type PrintData } from '../print/templates'
import { fetchSaleDetail, voidSale, type SaleDetail } from './api'

const METHOD: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }
export const fmtTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })

const toPrint = (d: SaleDetail): PrintData => ({
  invoiceNo: d.invoice_no, at: new Date(d.created_at), cashier: d.cashier_name, branch: d.branch_name, customer: d.member_label ?? '',
  lines: d.items.map((i) => ({ code: i.code, name: i.name, price: i.unit_price, qty: i.qty, disc: i.discount_pct })),
  subtotal: d.subtotal, discount: d.discount_amount, total: d.total, method: d.payment_method,
  paid: d.cash_received ?? d.total, change: d.change_amount ?? 0,
})

export function SaleDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const { data: d, error, isLoading } = useQuery({ queryKey: ['sale-detail', id], queryFn: () => fetchSaleDetail(id) })
  const receipt = useReceiptCfg(), invoice = useInvoiceCfg()
  const [kind, setKind] = useState<'receipt' | 'invoice'>('receipt')
  const { thermalOnly } = usePrintPrefs()
  const [voiding, setVoiding] = useState(false); const [reason, setReason] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  const printNow = (k: 'receipt' | 'invoice') => { setKind(k); triggerPrint() }
  async function doVoid() {
    if (!reason.trim()) return setErr('Alasan wajib diisi.')
    setBusy(true); setErr('')
    try {
      await voidSale(id, reason)
      await Promise.all([qc.invalidateQueries({ queryKey: ['sales-recap'] }), qc.invalidateQueries({ queryKey: ['sale-detail', id] }), qc.invalidateQueries({ queryKey: ['stock-branches'] })])
      setVoiding(false); setReason('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal membatalkan.') } finally { setBusy(false) }
  }

  return (
    <>
      <Modal title={d ? `Transaksi ${d.invoice_no}` : 'Transaksi'} onClose={onClose} wide>
        {isLoading && <p>Memuat…</p>}
        {error && <p role="alert" className="text-danger">{error instanceof Error ? error.message : 'Gagal memuat.'}</p>}
        {d && (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>Tanggal: <b>{fmtTime(d.created_at)}</b></div><div>Cabang: <b>{d.branch_name}</b></div>
              <div>Kasir: <b>{d.cashier_name}</b></div><div>Metode: <b>{METHOD[d.payment_method]}</b></div>
              <div>Member: <b>{d.member_label || '-'}</b></div>
              <div>Status: <b className={d.status === 'void' ? 'text-danger' : 'text-success'}>{d.status === 'void' ? 'DIBATALKAN' : 'Selesai'}</b></div>
              {d.status === 'void' && <div className="sm:col-span-2 text-danger">Alasan: {d.void_reason}</div>}
            </div>
            <div className="overflow-auto rounded-2xl border border-border-muted">
              <table className="w-full text-sm">
                <thead className="bg-bg-dark text-left text-text-muted"><tr><th className="p-2">Kode</th><th className="p-2">Barang</th><th className="p-2 text-right">Harga</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Diskon</th><th className="p-2 text-right">Sub total</th></tr></thead>
                <tbody>{d.items.map((i, n) => (
                  <tr key={n} className="border-t border-border-muted"><td className="p-2">{i.code}</td><td className="p-2">{i.name}</td><td className="p-2 text-right">{rupiah(i.unit_price)}</td><td className="p-2 text-right">{i.qty}</td><td className="p-2 text-right">{i.discount_pct ? `${i.discount_pct}%` : '-'}</td><td className="p-2 text-right">{rupiah(i.line_total)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(d.subtotal)}</span></div>
              <div className="flex justify-between"><span>Diskon</span><span>-{rupiah(d.discount_amount)}</span></div>
              <div className="flex justify-between text-lg font-semibold"><span>Total</span><span>{rupiah(d.total)}</span></div>
              {d.payment_method === 'cash' && <><div className="flex justify-between"><span>Diterima</span><span>{rupiah(d.cash_received ?? 0)}</span></div><div className="flex justify-between"><span>Kembalian</span><span>{rupiah(d.change_amount ?? 0)}</span></div></>}
            </div>
            {voiding ? (
              <div className="space-y-2 rounded-2xl border border-danger p-3">
                <p className="text-sm">Transaksi dibatalkan dan stok dikembalikan ke {d.branch_name}. Tindakan ini tidak bisa diurungkan.</p>
                <input className="input" autoFocus placeholder="Alasan pembatalan (wajib)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
                {err && <p role="alert" className="text-sm text-danger">{err}</p>}
                <div className="flex gap-2"><button className="btn-ghost" onClick={() => { setVoiding(false); setErr('') }}>Batal</button><button className="btn-primary" disabled={busy} onClick={doVoid}>{busy ? 'Memproses…' : 'Ya, batalkan transaksi'}</button></div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => printNow('receipt')}>Cetak ulang struk (thermal)</button>
                {!thermalOnly && <button className="btn-ghost" onClick={() => printNow('invoice')}>Cetak nota A4</button>}
                {d.status === 'completed' && can('sales_void', 'u') && <button className="btn-ghost ml-auto text-danger" onClick={() => setVoiding(true)}>Batalkan transaksi (void)</button>}
              </div>
            )}
          </div>
        )}
      </Modal>
      {d && <PrintSheet kind={kind} data={toPrint(d)} receipt={receipt} invoice={invoice} />}
    </>
  )
}
