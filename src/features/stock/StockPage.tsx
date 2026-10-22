import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listProducts, type ProductRow } from '../products/api'
import { stockByBranch } from './api'
import { StockEdit, type EditTarget } from './StockEdit'
import { useAuth } from '../auth/AuthProvider'
import { useDebounced } from '../../shared/hooks'

export default function StockPage() {
  const { can, profile } = useAuth()
  const canEdit = can('stock', 'u')
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [cursor, setCursor] = useState(0)
  const [sel, setSel] = useState<ProductRow | null>(null)
  const [edit, setEdit] = useState<EditTarget | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({ queryKey: ['admin-products', dq, 'active', 0], queryFn: () => listProducts(dq, 'active', 0), placeholderData: keepPreviousData })
  const rows = data?.rows ?? []
  const { data: stocks = [], isFetching } = useQuery({
    queryKey: ['stock-branches', sel?.id], queryFn: () => stockByBranch(sel!.id), enabled: !!sel,
  })

  useEffect(() => setCursor(0), [dq])
  useEffect(() => { document.querySelector(`[data-srow="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor])
  useEffect(() => {
    if (edit) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); setSel(rows[cursor]) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [edit, rows, cursor])

  return (
    <div className="grid h-full grid-cols-[1fr_28rem] gap-4 p-4">
      <section className="flex min-h-0 flex-col gap-3">
        <h1 className="text-xl font-semibold">Stok & Pengadaan</h1>
        <input ref={searchRef} className="input" placeholder="Cari kode / nama / pengarang (F2)" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900"><tr><th className="w-40 px-4 py-2">Kode produk</th><th className="px-4 py-2">Nama produk</th></tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} data-srow={i} onClick={() => { setCursor(i); setSel(p) }}
                  className={`cursor-pointer border-t border-slate-100 dark:border-slate-700 ${sel?.id === p.id ? 'bg-brand-100 dark:bg-brand-900/40' : i === cursor ? 'bg-slate-100 dark:bg-slate-700/60' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}>
                  <td className="px-4 py-2 font-mono">{p.code}</td><td className="px-4 py-2">{p.name}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">Tidak ada produk.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-500">↑↓ pilih · Enter / klik = lihat stok · F2 cari</p>
      </section>

      <aside className="flex min-h-0 flex-col gap-3 overflow-auto rounded-2xl bg-white p-4 shadow dark:bg-slate-800">
        {!sel ? <p className="text-slate-500">Pilih produk di kiri untuk melihat stok tiap cabang.</p> : (
          <>
            <div><div className="font-semibold">{sel.name}</div><div className="font-mono text-sm text-slate-500">{sel.code}</div></div>
            <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
              {stocks.map((b) => (
                <div key={b.branch_id} className={`flex items-center gap-2 rounded-2xl border p-3 ${b.branch_id === profile?.branch_id ? 'border-brand-500' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.branch_name}{b.branch_id === profile?.branch_id ? ' (Anda)' : ''}</div>
                    <div className="text-sm text-slate-500">Stok: <b className="text-slate-900 dark:text-slate-100">{b.qty}</b></div>
                  </div>
                  {canEdit && <>
                    <button className="btn-ghost !px-3 !py-1 text-sm" onClick={() => setEdit({ mode: 'in', branch: b, productId: sel.id, productName: sel.name })}>+ Masuk</button>
                    <button className="btn-ghost !px-3 !py-1 text-sm" onClick={() => setEdit({ mode: 'set', branch: b, productId: sel.id, productName: sel.name })}>Aktual</button>
                  </>}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
      {edit && <StockEdit t={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}
