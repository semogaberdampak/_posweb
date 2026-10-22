import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listProducts, type ProductRow, type StatusFilter } from './api'
import { ProductDetail } from './ProductDetail'
import { ProductForm } from './ProductForm'
import { useAuth } from '../auth/AuthProvider'
import { rupiah } from '../../shared/format'
import { useDebounced } from '../../shared/hooks'

export default function ProductsPage() {
  const { can } = useAuth()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [page, setPage] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [detail, setDetail] = useState<ProductRow | null>(null)
  const [form, setForm] = useState<{ product: ProductRow | null } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data, isError, isFetching } = useQuery({
    queryKey: ['admin-products', dq, status, page],
    queryFn: () => listProducts(dq, status, page),
    placeholderData: keepPreviousData,
  })
  const rows = data?.rows ?? []
  const modalOpen = !!detail || !!form

  useEffect(() => { setPage(0); setCursor(0) }, [dq, status])
  useEffect(() => setCursor(0), [page])
  useEffect(() => { document.querySelector(`[data-prow="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  useEffect(() => {
    if (modalOpen) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); setDetail(rows[cursor]) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [modalOpen, rows, cursor])

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-semibold">Produk & Harga</h1>
        <input ref={searchRef} className="input max-w-md flex-1" placeholder="Cari kode / nama / pengarang (F2)" value={q}
          onChange={(e) => setQ(e.target.value)} maxLength={60} />
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status produk">
          <option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="all">Semua</option>
        </select>
        {can('products', 'c') && (
          <button className="btn-primary ml-auto flex items-center gap-1" onClick={() => setForm({ product: null })}><Plus className="h-4 w-4" />Tambah produk</button>
        )}
      </div>

      <div className={`min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${isFetching ? 'opacity-80' : ''}`}>
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900">
            <tr>
              <th className="w-40 px-4 py-2">Kode produk</th><th className="px-4 py-2">Nama produk</th>
              <th className="w-36 px-4 py-2 text-right">Harga</th><th className="w-72 px-4 py-2">Pengarang</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} data-prow={i} onClick={() => setCursor(i)} onDoubleClick={() => setDetail(p)}
                className={`cursor-pointer border-t border-slate-100 dark:border-slate-700 ${i === cursor ? 'bg-brand-100 dark:bg-brand-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}>
                <td className="px-4 py-2 font-mono">{p.code}</td>
                <td className="px-4 py-2">{p.name}{!p.is_active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Nonaktif</span>}</td>
                <td className="px-4 py-2 text-right">{rupiah(p.price)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{p.author ?? '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{isError ? 'Gagal memuat produk.' : 'Tidak ada produk.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>↑↓ pilih · Enter / klik dua kali = detail · F2 cari</span>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !py-1" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>‹ Sebelumnya</button>
          <span>Halaman {page + 1}</span>
          <button className="btn-ghost !py-1" disabled={!data?.hasNext} onClick={() => setPage((x) => x + 1)}>Berikutnya ›</button>
        </div>
      </div>

      {detail && <ProductDetail p={detail} canEdit={can('products', 'u')} onClose={() => setDetail(null)}
        onEdit={() => { setForm({ product: detail }); setDetail(null) }} />}
      {form && <ProductForm product={form.product} onClose={() => setForm(null)} />}
    </div>
  )
}
