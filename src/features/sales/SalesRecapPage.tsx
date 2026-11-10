import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { rupiah } from '../../shared/format'
import { useAuth } from '../auth/AuthProvider'
import { listBranches } from '../users/api'
import { fetchClosingStatus } from '../closing/api'
import { fetchExport, fetchRecap, PAGE_SIZE } from './api'
import { fmtTime, SaleDetailModal } from './SaleDetailModal'
import { PeriodPicker } from '../../shared/PeriodPicker'
import { defaultPeriod, labelOf, rangeOf, tagOf, validate, type Period } from '../../shared/period'

const METHOD: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }

/** Tanggal kalender WIB ('YYYY-MM-DD') dari waktu transaksi. */
const wibDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const dayLabel = (d: string) => new Date(d + 'T00:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })

export default function SalesRecapPage() {
  const { allBranches, activeBranchId, profile, can } = useAuth()
  const [period, setPeriod] = useState<Period>(() => defaultPeriod())
  const periodErr = validate(period)
  const rg = rangeOf(period)
  const [branch, setBranch] = useState<string>(allBranches ? (activeBranchId ?? 'all') : 'all') // 'all' = semua cabang yang boleh dilihat
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false); const [exportErr, setExportErr] = useState('')
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })
  const branchArg = allBranches && branch !== 'all' ? branch : null

  const { data: rawData, isFetching, error } = useQuery({
    queryKey: ['sales-recap', rg.from, rg.to, branchArg, page],
    queryFn: () => fetchRecap(rg.from, rg.to, branchArg, page),
    placeholderData: keepPreviousData,
    enabled: !periodErr, // periode tidak sah (mis. tanggal terbalik) tidak dikirim ke server
  })
  const data = periodErr ? undefined : rawData // periode tidak sah: jangan tampilkan angka periode lama

  // Status tutup kasir: hanya untuk yang berhak (kasir, kabag, keuangan, superadmin).
  const seeClosing = can('daily_close', 'r')
  const { data: closing } = useQuery({
    queryKey: ['closing-status', rg.from, rg.to, branchArg],
    queryFn: () => fetchClosingStatus(rg.from, rg.to, branchArg),
    enabled: seeClosing && !periodErr,
  })
  const closedKeys = new Set((closing?.days ?? []).filter((d) => d.closed).map((d) => `${d.branch_name}|${d.date}`))
  const openDays = (closing?.days ?? []).filter((d) => !d.closed)
  const pages = Math.max(1, Math.ceil((data?.total_rows ?? 0) / PAGE_SIZE))
  useEffect(() => { if (data && page > pages) setPage(pages) }, [data, page, pages])
  const pick = (fn: () => void) => { fn(); setPage(1) } // ganti bulan/tahun/cabang = kembali ke halaman 1

  const from = data && data.total_rows ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * PAGE_SIZE, data.total_rows) : 0
  const showBranch = allBranches && branch === 'all'
  const branchLabel = allBranches ? (branch === 'all' ? 'Semua cabang' : branches.find((b) => b.id === branch)?.name ?? '') : profile?.branch_name ?? ''

  async function exportXlsx() {
    setExporting(true); setExportErr('')
    try {
      const [d, x] = await Promise.all([fetchExport(rg.from, rg.to, branchArg), import('./exportXlsx')]) // library Excel baru dimuat saat tombol ditekan
      const buf = await x.buildRecapWorkbook(d, { periodLabel: labelOf(period), branchLabel, generatedBy: profile?.full_name ?? 'POS' })
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a'); a.href = url; a.download = x.exportFileName(tagOf(period), branchLabel); a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { setExportErr(e instanceof Error ? e.message : 'Gagal membuat file Excel.') } finally { setExporting(false) }
  }

  return (
    <>
    <div className="h-full overflow-auto p-6 print:hidden">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Rekap Penjualan</h1>
        <PeriodPicker value={period} onChange={(p) => pick(() => setPeriod(p))} />
        {allBranches && (
          <label className="text-sm">Cabang
            <select className="input mt-1" value={branch} onChange={(e) => pick(() => setBranch(e.target.value))}>
              <option value="all">Semua cabang</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn-ghost" disabled={exporting || !data || data.total_rows === 0 || !!periodErr} onClick={exportXlsx}>{exporting ? 'Menyiapkan…' : 'Unduh Excel'}</button>
      </div>
      {exportErr && <p role="alert" className="mb-3 text-danger">{exportErr}</p>}
      <p className="mb-3 text-sm text-text-muted">{labelOf(period)} · {branchLabel} · waktu WIB</p>
      {periodErr && <p role="alert" className="mb-3 text-danger">{periodErr}</p>}
      {error && !periodErr && <p role="alert" className="mb-3 text-danger">{error instanceof Error ? error.message : 'Gagal memuat rekap.'}</p>}

      {data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card k="Transaksi selesai" v={data.summary.count.toLocaleString('id-ID')} />
          <Card k="Total penjualan" v={rupiah(data.summary.total)} />
          <Card k="Total diskon" v={rupiah(data.summary.discount)} />
          <Card k="Dibatalkan (void)" v={`${data.summary.void_count} · ${rupiah(data.summary.void_total)}`} />
        </div>
      )}
      {data && data.summary.count > 0 && (
        <p className="mb-3 text-sm text-text-muted">Per metode: {Object.entries(data.by_method).map(([m, t]) => `${METHOD[m] ?? m} ${rupiah(t ?? 0)}`).join(' · ')}</p>
      )}

      {seeClosing && closing && closing.totals.days > 0 && (
        openDays.length === 0 ? (
          <p role="status" className="mb-4 rounded-2xl bg-bg-light p-4 text-sm text-success shadow">
            Semua transaksi harian pada {labelOf(period)} sudah ditutup ({closing.totals.closed} hari).
          </p>
        ) : (
          <div role="status" className="mb-4 rounded-2xl bg-bg-light p-4 text-sm shadow">
            <p className="font-medium text-warning">
              {openDays.length} dari {closing.totals.days} hari transaksi BELUM ditutup
            </p>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {openDays.slice(0, 12).map((d) => (
                <li key={`${d.branch_id}-${d.date}`} className="rounded-full bg-warning/20 px-2.5 py-1 text-warning">
                  {dayLabel(d.date)}{showBranch ? ` · ${d.branch_name}` : ''} · {d.count} trx · {rupiah(d.net)}
                </li>
              ))}
              {openDays.length > 12 && <li className="px-1 py-1 text-text-muted">+{openDays.length - 12} hari lainnya</li>}
            </ul>
          </div>
        )
      )}

      <div className={`overflow-auto rounded-2xl border border-border-muted ${isFetching ? 'opacity-70' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-bg-dark text-left text-text-muted">
            <tr><th className="p-2">No. nota</th><th className="p-2">Waktu</th>{showBranch && <th className="p-2">Cabang</th>}<th className="p-2">Kasir</th><th className="p-2">Metode</th><th className="p-2">Member</th><th className="p-2 text-right">Diskon</th><th className="p-2 text-right">Total</th><th className="p-2">Status</th>{seeClosing && <th className="p-2">Tutup kasir</th>}</tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} tabIndex={0} className="cursor-pointer border-t border-border-muted hover:bg-highlight/20 focus:bg-highlight/20 focus:outline-none"
                onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id) }}>
                <td className="p-2 font-medium">{r.invoice_no}</td><td className="p-2">{fmtTime(r.created_at)}</td>{showBranch && <td className="p-2">{r.branch_name}</td>}
                <td className="p-2">{r.cashier_name}</td><td className="p-2">{METHOD[r.payment_method]}</td><td className="p-2">{r.member_label || '-'}</td>
                <td className="p-2 text-right">{r.discount_amount ? rupiah(r.discount_amount) : '-'}</td>
                <td className={`p-2 text-right font-medium ${r.status === 'void' ? 'text-danger line-through' : ''}`}>{rupiah(r.total)}</td>
                <td className="p-2">{r.status === 'void' ? <span className="text-danger">Void</span> : <span className="text-success">Selesai</span>}</td>
                {seeClosing && (
                  <td className="p-2">
                    {closedKeys.has(`${r.branch_name}|${wibDate(r.created_at)}`)
                      ? <span className="text-success">Sudah ditutup</span>
                      : <span className="text-warning">Belum ditutup</span>}
                  </td>
                )}
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={seeClosing ? 10 : 9} className="p-8 text-center text-text-muted">Tidak ada transaksi pada {labelOf(period)}.</td></tr>}
            {!data && !error && <tr><td colSpan={seeClosing ? 10 : 9} className="p-8 text-center text-text-muted">Memuat…</td></tr>}
          </tbody>
        </table>
      </div>

      {data && data.total_rows > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-text-muted">Baris {from}–{to} dari {data.total_rows.toLocaleString('id-ID')} transaksi</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(1)} aria-label="Halaman pertama">«</button>
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Sebelumnya</button>
            <span>Halaman <b>{page}</b> dari <b>{pages}</b></span>
            <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya ›</button>
            <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(pages)} aria-label="Halaman terakhir">»</button>
          </div>
        </div>
      )}
    </div>
    {/* di luar blok print:hidden agar lembar cetak di dalam modal bisa tampil saat mencetak */}
    {openId && <SaleDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}

const Card = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-2xl bg-bg-light p-4 shadow"><div className="text-sm text-text-muted">{k}</div><div className="mt-1 text-xl font-semibold">{v}</div></div>
)
