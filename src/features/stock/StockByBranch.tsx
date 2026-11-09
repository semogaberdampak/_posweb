import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { stockByBranch } from './api'

// Urutan tetap (kebiasaan kasir): TKSAP, TKSP, Kranggan, Katedral, TKSM, TKSAA, PUSAT; cabang baru menyusul di belakang.
const ORDER = ['ANTONIUS', 'PAULUS', 'KRANGGAN', 'KATEDRAL', 'SANTAMARIA', 'ATHANASIUS', 'PUSAT']
const rank = (code: string) => { const i = ORDER.indexOf(code); return i < 0 ? ORDER.length : i }
const fmt = (n: number) => n.toLocaleString('id-ID')

/** Stok produk di semua toko, ringkas: satu sel per cabang (singkatan + jumlah) yang membungkus rapi mengikuti lebar. Cabang aktif disorot. */
export function StockByBranch({ productId }: { productId?: string }) {
  const { activeBranchId } = useAuth()
  const { data = [], isError } = useQuery({
    queryKey: ['stock-branches', productId], queryFn: () => stockByBranch(productId!),
    enabled: !!productId, staleTime: 10_000,
  })
  if (!productId) return null
  if (isError) return <p className="text-sm text-danger">Gagal memuat stok.</p>
  const total = data.reduce((a, b) => a + b.qty, 0)
  return (
    <div className="flex flex-wrap gap-1" aria-label="Stok per cabang">
      {[...data].sort((a, b) => rank(a.branch_code) - rank(b.branch_code) || a.branch_name.localeCompare(b.branch_name)).map((b) => {
        const own = b.branch_id === activeBranchId
        return (
          <div key={b.branch_id} title={`${b.branch_name}${own ? ' (cabang aktif)' : ''}: ${b.qty} pcs`}
            className={`inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-lg border px-2 py-0.5 ${own ? 'border-primary bg-primary text-on-primary' : 'border-border-muted bg-bg-dark'}`}>
            <span className={`text-xs font-medium ${own ? '' : 'text-text-muted'}`}>{b.branch_short}</span>
            <b className={`text-[0.8rem] tabular-nums ${b.qty === 0 && !own ? 'text-danger' : ''}`}>{fmt(b.qty)}</b>
          </div>
        )
      })}
      {data.length > 0 && (
        <div title="Total semua cabang" className="inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-border px-2 py-0.5">
          <span className="text-xs font-medium text-text-muted">Total</span><b className="text-[0.8rem] tabular-nums">{fmt(total)}</b>
        </div>
      )}
    </div>
  )
}
