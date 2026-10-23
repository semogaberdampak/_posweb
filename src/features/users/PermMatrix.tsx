import type { Feature, Tri } from './api'

export type Cell = { c: Tri; r: Tri; u: Tri; d: Tri }
const ACTS: { k: keyof Cell; label: string }[] = [{ k: 'c', label: 'Tambah' }, { k: 'r', label: 'Lihat' }, { k: 'u', label: 'Ubah' }, { k: 'd', label: 'Hapus' }]

type Props = {
  features: Feature[]
  value: (feature: string) => Cell            // nilai yang diedit
  inherited?: (feature: string) => Cell       // hanya untuk mode pengecualian user: hak dari role
  onChange: (feature: string, next: Cell) => void
  disabled?: boolean
}

/** Mode role: kotak centang. Mode user (ada `inherited`): pilihan "Ikut role / Ya / Tidak". */
export function PermMatrix({ features, value, inherited, onChange, disabled }: Props) {
  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="px-3 py-2">Fitur</th>{ACTS.map((a) => <th key={a.k} className="px-3 py-2 text-center">{a.label}</th>)}</tr></thead>
        <tbody>
          {features.map((f) => {
            const v = value(f.key); const inh = inherited?.(f.key)
            return (
              <tr key={f.key} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-3 py-2">{f.label}<div className="font-mono text-[11px] text-slate-500">{f.key}</div></td>
                {ACTS.map(({ k, label }) => (
                  <td key={k} className="px-3 py-2 text-center">
                    {inherited ? (
                      <select className="input !w-auto !px-2 !py-1 text-xs" disabled={disabled} aria-label={`${f.label} ${label}`}
                        value={v[k] === null ? 'inherit' : v[k] ? 'yes' : 'no'}
                        onChange={(e) => onChange(f.key, { ...v, [k]: e.target.value === 'inherit' ? null : e.target.value === 'yes' })}>
                        <option value="inherit">Ikut role ({inh?.[k] ? 'Ya' : 'Tidak'})</option>
                        <option value="yes">Ya</option><option value="no">Tidak</option>
                      </select>
                    ) : (
                      <input type="checkbox" className="h-4 w-4" disabled={disabled} aria-label={`${f.label} ${label}`}
                        checked={!!v[k]} onChange={(e) => onChange(f.key, { ...v, [k]: e.target.checked })} />
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
