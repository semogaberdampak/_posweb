import { useQuery } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { rupiah } from '../../shared/format'
import { StockByBranch } from '../stock/StockByBranch'
import { useAuth } from '../auth/AuthProvider'
import { getProductCosts, type Attr, type ProductRow } from './api'



const PRICE_KEYS = new Set(['Price1', 'OldPrice1', 'OldPrice2', 'lastCost'])

const Card = ({ a }: { a: Attr }) => (
  <div className="rounded-2xl border border-border bg-bg-100 p-3 dark:border-border dark:bg-bg-200">
    <div className="text-[11px] uppercase tracking-wide text-fg-200">{a.k}</div>
    <div className="mt-1 break-words font-medium">{PRICE_KEYS.has(a.k) && typeof a.v === 'number' ? rupiah(a.v) : String(a.v)}</div>
  </div>
)

export function ProductDetail({ p, canEdit, onEdit, onClose }: { p: ProductRow; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const { can } = useAuth()
  const showCost = can('cost_prices', 'r')
  const { data: costs = [] } = useQuery({ queryKey: ['costs', p.id], queryFn: () => getProductCosts(p.id), enabled: showCost })
  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-fg-200">
        <span>Kode: <b className="font-mono">{p.code}</b></span>
        <span>Harga: <b>{rupiah(p.price)}</b></span>
        <span>Pengarang: <b>{p.author ?? '-'}</b></span>
        {!p.is_active && <span className="rounded-full bg-warning-100 px-3 py-0.5 text-xs font-semibold text-warning-800 dark:text-warning-900">Nonaktif</span>}
        {canEdit && <button className="btn-primary ml-auto !py-1" onClick={onEdit}>Ubah</button>}
      </div>
      <h3 className="mb-2 text-sm font-semibold">Stok per cabang</h3>
      <div className="mb-5"><StockByBranch productId={p.id} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {p.attributes.map((a) => <Card key={a.k} a={a} />)}
        {p.attributes.length === 0 && <p className="col-span-full text-fg-200">Tidak ada data tambahan.</p>}
      </div>
      {showCost && costs.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-warning-600 dark:text-warning-400">Harga beli (rahasia, hanya untuk role berhak)</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{costs.map((a) => <Card key={a.k} a={a} />)}</div>
        </>
      )}
    </Modal>
  )
}
