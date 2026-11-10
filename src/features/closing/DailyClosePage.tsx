import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { rupiah } from '../../shared/format'
import { Modal } from '../../shared/Modal'
import { todayWib, fmtDate } from '../../shared/period'
import { useAuth } from '../auth/AuthProvider'
import { listBranches } from '../users/api'
import { closeDay, fetchDaySummary, listClosings, type DaySummary } from './api'

const METHOD: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }

const fmtClock = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB'
const isCashValid = (s: string) => /^\d+$/.test(s.trim())

export default function DailyClosePage() {
  const { allBranches, activeBranchId, can } = useAuth()
  const qc = useQueryClient()
  const [picked, setPicked] = useState('')                 // '' = ikut "Cabang aktif" di header
  const branchId = picked || activeBranchId || ''
  const [date, setDate] = useState(() => todayWib())
  const [cash, setCash] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const canClose = can('daily_close', 'c')

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })
  const { data, error, isFetching } = useQuery({
    queryKey: ['daily-close-summary', branchId, date],
    queryFn: () => fetchDaySummary(branchId, date),
    placeholderData: keepPreviousData,
    enabled: !!branchId,
  })
  const { data: history = [] } = useQuery({
    queryKey: ['daily-closings', branchId],
    queryFn: () => listClosings(branchId),
    enabled: !!branchId,
  })

  // ganti cabang/tanggal: kosongkan isian supaya tidak ikut terbawa
  useEffect(() => { setCash(''); setNote(''); setConfirming(false) }, [branchId, date])

  const mutation = useMutation({
    mutationFn: () => closeDay(branchId, date, Number(cash), note),
    onSuccess: (d) => {
      qc.setQueryData(['daily-close-summary', branchId, date], d)
      qc.invalidateQueries({ queryKey: ['daily-closings', branchId] })
      setConfirming(false); setCash(''); setNote('')
    },
  })

  const branchLabel = allBranches
    ? (branches.find((b) => b.id === branchId)?.name ?? data?.branch_name ?? '')
    : (data?.branch_name ?? '')
  const closed = !!data?.closing
  const cashNum = isCashValid(cash) ? Number(cash) : null
  const difference = cashNum !== null && data ? cashNum - data.cash_expected : null
  const empty = !!data && data.totals.count + data.totals.void_count === 0
  const canSubmit = canClose && !!data && !closed && !empty && cashNum !== null && !mutation.isPending

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Tutup Transaksi Harian</h1>
        <label className="text-sm">Tanggal
          <input type="date" className="input mt-1" value={date} max={todayWib()} onChange={(e) => setDate(e.target.value)} />
        </label>
        {allBranches && (
          <label className="text-sm">Cabang
            <select className="input mt-1" value={branchId} onChange={(e) => setPicked(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="mb-3 text-sm text-text-muted">{fmtDate(date)} · {branchLabel || '—'} · waktu WIB · transaksi void tidak masuk total</p>

      {error && <p role="alert" className="mb-3 text-danger">{error instanceof Error ? error.message : 'Gagal memuat.'}</p>}
      {!data && !error && <p className="text-text-muted">Memuat…</p>}
      {mutation.error && <p role="alert" className="mb-3 text-danger">{mutation.error instanceof Error ? mutation.error.message : 'Gagal menutup.'}</p>}

      {data && (
        <div className={isFetching ? 'opacity-70' : ''}>
          {closed ? (
            <div className="mb-4 rounded-2xl bg-bg-light p-4 shadow">
              <h2 className="flex items-center gap-2 font-medium text-success"><Lock className="h-4 w-4" /> Hari ini sudah ditutup</h2>
              <p className="mt-1 text-sm text-text-muted">
                Ditutup {fmtClock(data.closing!.closed_at)} oleh {data.closing!.closed_by_name}.
              </p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Detail k="Uang tunai seharusnya" v={rupiah(data.closing!.cash_expected)} />
                <Detail k="Uang tunai dihitung" v={data.closing!.cash_counted === null ? '-' : rupiah(data.closing!.cash_counted)} />
                <Detail k="Selisih" v={selisihText(data.closing!.cash_difference)} tone={toneOf(data.closing!.cash_difference)} />
              </dl>
              {data.closing!.note && <p className="mt-3 whitespace-pre-wrap text-sm">Catatan: {data.closing!.note}</p>}
              {data.changed_after_close && (
                <p role="status" className="mt-3 text-sm text-warning">
                  Ada transaksi baru atau void setelah hari ini ditutup, jadi angka di bawah berbeda dari snapshot penutupan.
                  Angka penutupan yang tercatat tidak berubah.
                </p>
              )}
            </div>
          ) : empty ? (
            <p role="status" className="mb-4 rounded-2xl bg-bg-light p-4 text-sm text-text-muted shadow">
              Belum ada transaksi {branchLabel ? `di ${branchLabel} ` : ''}pada {fmtDate(date)}. Hari tanpa transaksi tidak perlu ditutup.
            </p>
          ) : null}

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card k="Transaksi selesai" v={data.totals.count.toLocaleString('id-ID')} />
            <Card k="Total penjualan" v={rupiah(data.totals.net)} />
            <Card k="Total diskon" v={rupiah(data.totals.discount)} />
            <Card k="Dibatalkan (void)" v={`${data.totals.void_count} · ${rupiah(data.totals.void_total)}`} />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl bg-bg-light p-4 shadow">
              <h2 className="mb-2 font-medium">Per metode bayar</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-text-muted"><tr><th className="py-1">Metode</th><th className="text-right">Transaksi</th><th className="text-right">Nilai</th></tr></thead>
                <tbody>
                  {data.by_method.map((m) => (
                    <tr key={m.method} className="border-t border-border-muted">
                      <td className="py-1">{METHOD[m.method] ?? m.method}</td>
                      <td className="text-right">{m.count}</td>
                      <td className="text-right font-medium">{rupiah(m.net)}</td>
                    </tr>
                  ))}
                  {data.by_method.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-text-muted">Belum ada transaksi.</td></tr>}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-text-muted">Tunai = uang di laci kas. QRIS / debit / kartu kredit = dana masuk lewat bank/EDC.</p>
            </section>

            <section className="rounded-2xl bg-bg-light p-4 shadow">
              <h2 className="mb-2 font-medium">Tutup kas</h2>
              {closed ? (
                <p className="text-sm text-text-muted">Penutupan hanya bisa dilakukan sekali per cabang per tanggal; tidak ada pembukaan ulang. Bila ada kekeliruan, catat pada laporan manual dan hubungi superadmin.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm">Uang tunai seharusnya di laci: <b>{rupiah(data.cash_expected)}</b></p>
                  <label className="block text-sm">Uang tunai hasil hitung
                    <input type="number" inputMode="numeric" min={0} step={1} className="input mt-1 w-full" placeholder="mis. 1500000"
                      value={cash} onChange={(e) => setCash(e.target.value)} disabled={!canClose || empty} />
                  </label>
                  {difference !== null && (
                    <p className={toneClass(toneOf(difference))}>Selisih: {selisihText(difference)}</p>
                  )}
                  <label className="block text-sm">Catatan (boleh kosong)
                    <textarea className="input mt-1 w-full" rows={2} maxLength={500} value={note}
                      onChange={(e) => setNote(e.target.value)} disabled={!canClose || empty} />
                  </label>
                  {!canClose && <p className="text-sm text-text-muted">Anda hanya bisa melihat; hak menutup kas tidak dimiliki.</p>}
                  <button className="btn-primary w-full" disabled={!canSubmit} onClick={() => setConfirming(true)}>
                    {empty ? 'Belum ada transaksi' : 'Tutup transaksi hari ini'}
                  </button>
                  <p className="text-xs text-text-muted">Setelah ditutup, angka hari ini dikunci sebagai snapshot dan tidak bisa dibuka ulang.</p>
                </div>
              )}
            </section>
          </div>

          <section className="rounded-2xl bg-bg-light p-4 shadow">
            <h2 className="mb-2 font-medium">Riwayat penutupan (30 terakhir)</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-dark text-left text-text-muted">
                  <tr><th className="p-2">Tanggal</th><th className="p-2">Ditutup pada</th><th className="p-2 text-right">Transaksi</th><th className="p-2 text-right">Penjualan</th><th className="p-2 text-right">Tunai seharusnya</th><th className="p-2 text-right">Tunai dihitung</th><th className="p-2 text-right">Selisih</th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-border-muted">
                      <td className="p-2 font-medium">{fmtDate(h.close_date)}</td>
                      <td className="p-2">{fmtClock(h.closed_at)}</td>
                      <td className="p-2 text-right">{h.total_count}</td>
                      <td className="p-2 text-right">{rupiah(h.net)}</td>
                      <td className="p-2 text-right">{rupiah(h.cash_expected)}</td>
                      <td className="p-2 text-right">{h.cash_counted === null ? '-' : rupiah(h.cash_counted)}</td>
                      <td className={`p-2 text-right ${toneClass(toneOf(h.cash_difference))}`}>{selisihText(h.cash_difference)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-text-muted">Belum ada penutupan untuk cabang ini.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {confirming && data && cashNum !== null && (
        <ConfirmModal summary={data} cash={cashNum} note={note} pending={mutation.isPending}
          onCancel={() => setConfirming(false)} onConfirm={() => mutation.mutate()} />
      )}
    </div>
  )
}

type Tone = 'ok' | 'over' | 'short'
const toneOf = (d: number | null | undefined): Tone | undefined => (d === null || d === undefined ? undefined : d === 0 ? 'ok' : d < 0 ? 'short' : 'over')
const toneClass = (t: Tone | undefined) => (t === 'short' ? 'text-danger' : t === 'over' ? 'text-warning' : 'text-success')
const selisihText = (d: number | null | undefined) =>
  d === null || d === undefined ? '-' : d === 0 ? 'Pas (Rp 0)' : `${d < 0 ? 'Kurang ' : 'Lebih '}${rupiah(Math.abs(d))}`

function ConfirmModal({ summary, cash, note, pending, onCancel, onConfirm }:
  { summary: DaySummary; cash: number; note: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Konfirmasi tutup transaksi" onClose={onCancel}>
      <div className="space-y-2 text-sm">
        <p><span className="text-text-muted">Cabang:</span> <b>{summary.branch_name}</b></p>
        <p><span className="text-text-muted">Tanggal:</span> <b>{fmtDate(summary.date)}</b></p>
        <p><span className="text-text-muted">Transaksi selesai:</span> <b>{summary.totals.count}</b> · <span className="text-text-muted">void:</span> <b>{summary.totals.void_count}</b></p>
        <p><span className="text-text-muted">Total penjualan:</span> <b>{rupiah(summary.totals.net)}</b></p>
        <p><span className="text-text-muted">Tunai seharusnya:</span> <b>{rupiah(summary.cash_expected)}</b></p>
        <p><span className="text-text-muted">Tunai dihitung:</span> <b>{rupiah(cash)}</b></p>
        <p className={toneClass(toneOf(cash - summary.cash_expected))}>Selisih: {selisihText(cash - summary.cash_expected)}</p>
        {note.trim() && <p className="whitespace-pre-wrap"><span className="text-text-muted">Catatan:</span> {note.trim()}</p>}
        <p className="pt-2 text-warning">Setelah ditutup, hari ini tidak bisa dibuka ulang.</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel} disabled={pending}>Batal</button>
        <button className="btn-primary" onClick={onConfirm} disabled={pending}>{pending ? 'Menyimpan…' : 'Ya, tutup sekarang'}</button>
      </div>
    </Modal>
  )
}

const Card = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-2xl bg-bg-light p-4 shadow"><div className="text-sm text-text-muted">{k}</div><div className="mt-1 text-xl font-semibold">{v}</div></div>
)
const Detail = ({ k, v, tone }: { k: string; v: string; tone?: Tone }) => (
  <div><dt className="text-sm text-text-muted">{k}</dt><dd className={`text-lg font-semibold ${tone ? toneClass(tone) : ''}`}>{v}</dd></div>
)
