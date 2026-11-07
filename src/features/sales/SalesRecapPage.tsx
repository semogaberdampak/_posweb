import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { rupiah } from '../../shared/format'
import { useAuth } from '../auth/AuthProvider'
import { listBranches } from '../users/api'
import { fetchRecap, PAGE_SIZE } from './api'
import { fmtTime, SaleDetailModal } from './SaleDetailModal'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const METHOD: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }
const FIRST_YEAR = 2024

export default function SalesRecapPage() {
  const { allBranches, activeBranchId, profile } = useAuth()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState<string>(allBranches ? (activeBranchId ?? 'all') : 'all') // 'all' = semua cabang yang boleh dilihat
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })
  const years = Array.from({ length: Math.max(now.getFullYear(), year) - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i).reverse()
  const branchArg = allBranches && branch !== 'all' ? branch : null

  const { data, isFetching, error } = useQuery({
    queryKey: ['sales-recap', year, month, branchArg, page],
    queryFn: () => fetchRecap(year, month, branchArg, page),
    placeholderData: keepPreviousData,
  })
  const pages = Math.max(1, Math.ceil((data?.total_rows ?? 0) / PAGE_SIZE))
  useEffect(() => { if (data && page > pages) setPage(pages) }, [data, page, pages])
  const pick = (fn: () => void) => { fn(); setPage(1) } // ganti bulan/tahun/cabang = kembali ke halaman 1

  const from = data && data.total_rows ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * PAGE_SIZE, data.total_rows) : 0
  const showBranch = allBranches && branch === 'all'
  const branchLabel = allBranches ? (branch === 'all' ? 'Semua cabang' : branches.find((b) => b.id === branch)?.name ?? '') : profile?.branch_name ?? ''

  return (
    <>
    <div className="h-full overflow-auto p-6 print:hidden">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Rekap Penjualan</h1>
        <label className="text-sm">Bulan
          <select className="input mt-1" value={month} onChange={(e) => pick(() => setMonth(Number(e.target.value)))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        </label>
        <label className="text-sm">Tahun
          <select className="input mt-1" value={year} onChange={(e) => pick(() => setYear(Number(e.target.value)))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        {allBranches && (
          <label className="text-sm">Cabang
            <select className="input mt-1" value={branch} onChange={(e) => pick(() => setBranch(e.target.value))}>
              <option value="all">Semua cabang</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="mb-3 text-sm text-text-muted">{MONTHS[month - 1]} {year} · {branchLabel} · waktu WIB</p>
      {error && <p role="alert" className="mb-3 text-danger">{error instanceof Error ? error.message : 'Gagal memuat rekap.'}</p>}

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

      <div className={`overflow-auto rounded-2xl border border-border-muted ${isFetching ? 'opacity-70' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-bg-dark text-left text-text-muted">
            <tr><th className="p-2">No. nota</th><th className="p-2">Waktu</th>{showBranch && <th className="p-2">Cabang</th>}<th className="p-2">Kasir</th><th className="p-2">Metode</th><th className="p-2">Member</th><th className="p-2 text-right">Diskon</th><th className="p-2 text-right">Total</th><th className="p-2">Status</th></tr>
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
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-text-muted">Tidak ada transaksi pada {MONTHS[month - 1]} {year}.</td></tr>}
            {!data && !error && <tr><td colSpan={9} className="p-8 text-center text-text-muted">Memuat…</td></tr>}
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
