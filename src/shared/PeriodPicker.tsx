import { MONTHS, presets, rangeOf, todayWib, type Period } from './period'

const FIRST_YEAR = 2024

/** Pemilih periode: "Bulanan" (bulan + tahun) atau "Rentang tanggal" (Dari – Sampai + pintasan). */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const thisYear = Number(todayWib().slice(0, 4))
  const years = Array.from({ length: Math.max(thisYear, value.mode === 'month' ? value.year : thisYear) - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i).reverse()
  const toRange = () => onChange({ mode: 'range', ...rangeOf(value) })
  const toMonth = () => {
    if (value.mode === 'month') return
    const [y, m] = value.from.split('-').map(Number)
    onChange({ mode: 'month', year: y, month: m })
  }
  const seg = (active: boolean) => `rounded-full px-3 py-1 ${active ? 'bg-primary text-on-primary' : 'text-text-muted hover:bg-highlight/20'}`
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label="Jenis periode" className="flex rounded-full border border-border-muted p-0.5 text-sm">
        <button type="button" aria-pressed={value.mode === 'month'} className={seg(value.mode === 'month')} onClick={toMonth}>Bulanan</button>
        <button type="button" aria-pressed={value.mode === 'range'} className={seg(value.mode === 'range')} onClick={() => value.mode === 'range' || toRange()}>Rentang tanggal</button>
      </div>
      {value.mode === 'month' ? (
        <>
          <label className="text-sm">Bulan
            <select className="input mt-1" value={value.month} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </label>
          <label className="text-sm">Tahun
            <select className="input mt-1" value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </label>
        </>
      ) : (
        <>
          <label className="text-sm">Dari
            <input type="date" className="input mt-1" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </label>
          <label className="text-sm">Sampai
            <input type="date" className="input mt-1" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-1 text-sm">
            {presets().map((p) => (
              <button key={p.label} type="button" className={`btn-ghost !py-1 ${value.from === p.from && value.to === p.to ? 'ring-1 ring-primary' : ''}`} onClick={() => onChange({ mode: 'range', from: p.from, to: p.to })}>{p.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
