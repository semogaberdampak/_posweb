import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { rupiah } from '../../shared/format'
import { useAuth } from '../auth/AuthProvider'
import { listBranches } from '../users/api'
import { fetchFinance } from './api'
import { METHOD } from './exportFinance'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const FIRST_YEAR = 2024
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '-')

export default function FinancePage() {
  const { allBranches, activeBranchId, profile } = useAuth()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [branch, setBranch] = useState<string>(allBranches ? (activeBranchId ?? 'all') : 'all')
  const [exporting, setExporting] = useState(false); const [exportErr, setExportErr] = useState('')
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })
  const branchArg = allBranches && branch !== 'all' ? branch : null
  const years = Array.from({ length: Math.max(now.getFullYear(), year) - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i).reverse()
  const { data, error, isFetching } = useQuery({ queryKey: ['finance', year, month, branchArg], queryFn: () => fetchFinance(year, month, branchArg), placeholderData: keepPreviousData })
  const branchLabel = allBranches ? (branch === 'all' ? 'Semua cabang' : branches.find((b) => b.id === branch)?.name ?? '') : profile?.branch_name ?? ''

  async function exportXlsx() {
    if (!data) return
    setExporting(true); setExportErr('')
    try {
      const x = await import('./exportFinance') // library Excel baru dimuat saat tombol ditekan
      const buf = await x.buildFinanceWorkbook(data, { year, month, branchLabel, generatedBy: profile?.full_name ?? 'POS' })
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a'); a.href = url; a.download = x.financeFileName(year, month, branchLabel); a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { setExportErr(e instanceof Error ? e.message : 'Gagal membuat file Excel.') } finally { setExporting(false) }
  }

  const T = data?.totals, M = data?.margin
  const maxDay = Math.max(1, ...(data?.by_day.map((d) => d.net) ?? [0]))
  const sumMethod = data?.by_method.reduce((a, x) => a + x.net, 0) ?? 0
  const profit = M ? M.revenue_covered - M.cost : 0
  const coverage = M && M.revenue_all > 0 ? M.revenue_covered / M.revenue_all : 0

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Keuangan</h1>
        <label className="text-sm">Bulan<select className="input mt-1" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <label className="text-sm">Tahun<select className="input mt-1" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        {allBranches && (
          <label className="text-sm">Cabang
            <select className="input mt-1" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">Semua cabang</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
        )}
        <button className="btn-ghost" disabled={exporting || !data || data.totals.count + data.totals.void_count === 0} onClick={exportXlsx}>{exporting ? 'Menyiapkan…' : 'Unduh Excel'}</button>
      </div>
      <p className="mb-3 text-sm text-text-muted">{MONTHS[month - 1]} {year} · {branchLabel} · waktu WIB · transaksi void tidak dihitung</p>
      {error && <p role="alert" className="mb-3 text-danger">{error instanceof Error ? error.message : 'Gagal memuat.'}</p>}
      {exportErr && <p role="alert" className="mb-3 text-danger">{exportErr}</p>}
      {!data && !error && <p className="text-text-muted">Memuat…</p>}

      {T && (
        <div className={isFetching ? 'opacity-70' : ''}>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card k="Penjualan bersih" v={rupiah(T.net)} big />
            <Card k="Penjualan kotor (sebelum diskon)" v={rupiah(T.gross)} />
            <Card k="Total diskon" v={rupiah(T.discount)} />
            <Card k="Transaksi selesai" v={T.count.toLocaleString('id-ID')} />
            <Card k="Rata-rata per transaksi" v={rupiah(T.count ? Math.round(T.net / T.count) : 0)} />
            <Card k="Dibatalkan (void)" v={`${T.void_count} · ${rupiah(T.void_total)}`} />
          </div>

          {M && (
            <section className="mb-4 rounded-2xl bg-bg-light p-4 shadow">
              <h2 className="mb-2 font-medium">Estimasi laba kotor</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card k="Laba kotor (estimasi)" v={rupiah(profit)} />
                <Card k="Margin" v={pct(profit, M.revenue_covered)} />
                <Card k="Cakupan data modal" v={`${(coverage * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`} />
              </div>
              <p className="mt-2 text-sm text-text-muted">
                Dihitung dari {rupiah(M.revenue_covered)} penjualan yang harga belinya tercatat dan masuk akal (lebih rendah dari harga jual); {M.lines_no_cost.toLocaleString('id-ID')} dari {M.lines.toLocaleString('id-ID')} baris penjualan tidak ikut karena data modalnya kosong atau sama dengan/ lebih tinggi dari harga jual.
              </p>
              {coverage < 0.8 && M.lines > 0 && <p role="status" className="mt-1 text-sm text-warning">Cakupan di bawah 80%: angka laba belum mewakili seluruh penjualan. Lengkapi harga beli produk agar akurat.</p>}
            </section>
          )}

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl bg-bg-light p-4 shadow">
              <h2 className="mb-2 font-medium">Per metode bayar</h2>
              <table className="w-full text-sm"><thead className="text-left text-text-muted"><tr><th className="py-1">Metode</th><th className="text-right">Transaksi</th><th className="text-right">Nilai</th><th className="text-right">Porsi</th></tr></thead>
                <tbody>
                  {data.by_method.map((x) => <tr key={x.method} className="border-t border-border-muted"><td className="py-1">{METHOD[x.method] ?? x.method}</td><td className="text-right">{x.count}</td><td className="text-right font-medium">{rupiah(x.net)}</td><td className="text-right">{pct(x.net, sumMethod)}</td></tr>)}
                  {data.by_method.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-text-muted">Belum ada transaksi.</td></tr>}
                </tbody></table>
              <p className="mt-2 text-xs text-text-muted">Tunai = uang di laci kas. QRIS / debit / kartu kredit = dana masuk lewat bank/EDC (cocokkan dengan mutasi rekening).</p>
            </section>
            {data.by_branch.length > 1 && (
              <section className="rounded-2xl bg-bg-light p-4 shadow">
                <h2 className="mb-2 font-medium">Per cabang</h2>
                <table className="w-full text-sm"><thead className="text-left text-text-muted"><tr><th className="py-1">Cabang</th><th className="text-right">Transaksi</th><th className="text-right">Diskon</th><th className="text-right">Nilai</th></tr></thead>
                  <tbody>{data.by_branch.map((x) => <tr key={x.branch} className="border-t border-border-muted"><td className="py-1">{x.branch}</td><td className="text-right">{x.count}</td><td className="text-right">{rupiah(x.discount)}</td><td className="text-right font-medium">{rupiah(x.net)}</td></tr>)}</tbody></table>
              </section>
            )}
          </div>

          <section className="rounded-2xl bg-bg-light p-4 shadow">
            <h2 className="mb-2 font-medium">Per hari</h2>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-bg-light text-left text-text-muted"><tr><th className="py-1">Tanggal</th><th className="text-right">Transaksi</th><th className="text-right">Nilai</th><th className="w-1/2 pl-3"> </th></tr></thead>
                <tbody>
                  {data.by_day.map((x) => (
                    <tr key={x.date} className="border-t border-border-muted"><td className="py-1">{x.date}</td><td className="text-right">{x.count}</td><td className="text-right font-medium">{rupiah(x.net)}</td>
                      <td className="pl-3"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (x.net / maxDay) * 100)}%` }} /></td></tr>
                  ))}
                  {data.by_day.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-text-muted">Tidak ada transaksi pada {MONTHS[month - 1]} {year}.</td></tr>}
                </tbody></table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

const Card = ({ k, v, big }: { k: string; v: string; big?: boolean }) => (
  <div className="rounded-2xl bg-bg-light p-4 shadow"><div className="text-sm text-text-muted">{k}</div><div className={`mt-1 font-semibold ${big ? 'text-2xl' : 'text-xl'}`}>{v}</div></div>
)
