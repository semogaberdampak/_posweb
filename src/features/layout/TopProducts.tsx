import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { useElementHeight } from '../../shared/hooks'
import { MONTHS, monthRange, todayWib, validate, yearRange } from '../../shared/period'
import { fetchTopProducts } from '../sales/api'

type Mode = 'day' | 'month' | 'year'
const K_MODE = 'pos.topMode'
const TABS: [Mode, string][] = [['day', 'Harian'], ['month', 'Bulanan'], ['year', 'Tahunan']]
const FIRST_YEAR = 2024
const readMode = (): Mode => { try { const v = localStorage.getItem(K_MODE); return v === 'month' || v === 'year' ? v : 'day' } catch { return 'day' } }

/** Produk terlaris (jumlah terjual) dengan periode harian (rentang tanggal) / bulanan / tahunan. Mengisi ruang kosong sidebar;
 *  ukuran mengikuti tinggi yang tersedia (zoom browser): sempit → hanya daftar, sangat sempit → disembunyikan. */
export function TopProducts({ branchId, branchLabel }: { branchId: string | null; branchLabel: string }) {
  const [ref, h] = useElementHeight<HTMLDivElement>()
  const t = todayWib(); const [ty, tm] = t.split('-').map(Number)
  const [mode, setMode] = useState<Mode>(readMode)
  const [from, setFrom] = useState(t); const [to, setTo] = useState(t)
  const [year, setYear] = useState(ty); const [month, setMonth] = useState(tm)
  useEffect(() => { try { localStorage.setItem(K_MODE, mode) } catch { /* abaikan */ } }, [mode])

  const range = mode === 'day' ? { from, to } : mode === 'month' ? monthRange(year, month) : yearRange(year)
  const err = validate({ mode: 'range', ...range })
  const { data, isFetching, isError } = useQuery({
    queryKey: ['top-products', range.from, range.to, branchId],
    queryFn: () => fetchTopProducts(range.from, range.to, branchId, 10),
    enabled: !err, staleTime: 60_000, placeholderData: (p) => p,
  })
  const rem = h / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
  const years = Array.from({ length: Math.max(ty, year) - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i).reverse()
  const label = mode === 'day' ? (from === to ? (from === t ? 'Hari ini' : from) : `${from} s/d ${to}`) : mode === 'month' ? `${MONTHS[month - 1]} ${year}` : `Tahun ${year}`
  const field = 'input !w-full !py-0.5 !px-1.5 !text-xs'

  return (
    <div ref={ref} className="h-full min-h-0">
      {rem >= 7 && (
        <section aria-label="Produk terlaris" className="flex h-full min-h-0 flex-col gap-1.5 rounded-xl border border-border-muted bg-bg-dark p-2">
          <div className="flex items-center gap-1 text-sm font-semibold"><Trophy className="h-3.5 w-3.5 text-primary" />Produk Terlaris</div>
          <div role="tablist" aria-label="Periode" className="grid grid-cols-3 gap-0.5 rounded-lg bg-bg-light p-0.5 text-xs">
            {TABS.map(([m, l]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`rounded-md py-0.5 font-medium transition ${mode === m ? 'bg-primary text-on-primary' : 'text-text-muted hover:bg-highlight/20'}`}>{l}</button>
            ))}
          </div>
          {rem >= 14 && (
            mode === 'day' ? (
              <div className="space-y-1 text-xs text-text-muted">
                <label className="flex items-center gap-1"><span className="w-11 shrink-0">Dari</span><input type="date" className={field} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="flex items-center gap-1"><span className="w-11 shrink-0">Sampai</span><input type="date" className={field} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
              </div>
            ) : mode === 'month' ? (
              <div className="grid grid-cols-[1fr_auto] gap-1">
                <select aria-label="Bulan" className={field} value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                <select aria-label="Tahun" className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              </div>
            ) : (
              <select aria-label="Tahun" className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            )
          )}
          <div className="truncate text-xs text-text-muted" title={`${label} · ${branchLabel}`}>{label} · {branchLabel}</div>
          <ol className={`min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5 ${isFetching ? 'opacity-70' : ''}`}>
            {err && <li role="alert" className="text-xs text-danger">{err}</li>}
            {isError && !err && <li role="alert" className="text-xs text-danger">Gagal memuat.</li>}
            {!err && !isError && data?.length === 0 && <li className="py-2 text-center text-xs text-text-muted">Belum ada penjualan pada periode ini.</li>}
            {!err && data?.map((r, i) => (
              <li key={r.product_id} title={`${r.name} (${r.code}) — ${r.qty} pcs di ${r.trx} nota`} className="flex items-start gap-1.5 rounded-md px-1 py-0.5 hover:bg-highlight/20">
                <span className={`mt-px w-4 shrink-0 text-center text-xs font-bold ${i < 3 ? 'text-primary' : 'text-text-muted'}`}>{i + 1}</span>
                <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-tight">{r.name}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums">{r.qty.toLocaleString('id-ID')}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
