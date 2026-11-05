import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { stockByBranch } from './api'

/** Stok produk di semua toko, per cabang. Cabang milik user disorot. */
export function StockByBranch({ productId }: { productId?: string }) {
  const { profile } = useAuth()
  const { data = [], isError } = useQuery({
    queryKey: ['stock-branches', productId], queryFn: () => stockByBranch(productId!),
    enabled: !!productId, staleTime: 10_000,
  })
  if (!productId) return null
  if (isError) return <p className="text-sm text-danger">Gagal memuat stok.</p>
  return (
    <div className="flex flex-wrap gap-2" aria-label="Stok per cabang">
      {[...data].sort((a, b) => Number(b.branch_id === profile?.branch_id) - Number(a.branch_id === profile?.branch_id)).map((b) => {
        const own = b.branch_id === profile?.branch_id
        return (
          <span key={b.branch_id}
            className={`rounded-full px-3 py-1 text-sm ${own ? 'bg-primary text-on-primary' : 'bg-bg-dark text-text'}`}>
            {b.branch_name}{own ? ' (Anda)' : ''}: <b className={b.qty === 0 && !own ? 'text-danger' : ''}>{b.qty}</b>
          </span>
        )
      })}
    </div>
  )
}
