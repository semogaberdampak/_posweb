import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useDebounced } from '../../shared/hooks'
import { listProducts, type ProductRow } from '../products/api'
import { listBranches } from '../users/api'
import { stockByBranch, transferBatch } from './api'

type Line = { product_id: string; code: string; name: string; qty: number; available: number }

export default function StockMovePage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const canMove = can('stock_move', 'u')
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const pusat = branches.find((b) => b.is_pusat)?.id ?? ''
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const src = from || pusat // bawaan: asal = Pusat
  const [q, setQ] = useState(''); const dq = useDebounced(q, 250)
  const [cursor, setCursor] = useState(0)
  const [sel, setSel] = useState<ProductRow | null>(null)
  const [qty, setQty] = useState('1'); const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({ queryKey: ['admin-products', dq, 'active', 0], queryFn: () => listProducts(dq, 'active', 0), placeholderData: keepPreviousData })
  const rows = data?.rows ?? []
  const { data: stocks = [] } = useQuery({ queryKey: ['stock-branches', sel?.id], queryFn: () => stockByBranch(sel!.id), enabled: !!sel })
  const available = stocks.find((s) => s.branch_id === src)?.qty ?? 0
  useEffect(() => setCursor(0), [dq])
  useEffect(() => { setLines([]) }, [src, to]) // ganti cabang = daftar dikosongkan (stok asal berbeda)

  function addLine() {
    if (!sel) return
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) return setErr('Jumlah harus angka bulat lebih dari 0.')
    if (n > available) return setErr(`Stok di cabang asal hanya ${available}.`)
    setLines((l) => [...l.filter((x) => x.product_id !== sel.id), { product_id: sel.id, code: sel.code, name: sel.name, qty: n, available }])
    setSel(null); setQty('1'); setErr(''); setQ(''); searchRef.current?.focus()
  }
  async function submit() {
    if (!src || !to) return setErr('Pilih cabang asal dan tujuan.')
    if (src === to) return setErr('Cabang asal dan tujuan tidak boleh sama.')
    if (!lines.length) return setErr('Tambahkan minimal 1 produk.')
    setBusy(true); setErr(''); setOk('')
    try {
      const n = await transferBatch(src, to, lines.map((l) => ({ product_id: l.product_id, qty: l.qty })), note)
      await qc.invalidateQueries({ queryKey: ['stock-branches'] })
      setOk(`${n} produk berhasil dipindahkan.`); setLines([]); setNote('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal memindahkan stok.') } finally { setBusy(false) }
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); return }
    const el = e.target as HTMLElement
    if (sel) { if (e.key === 'Enter') { e.preventDefault(); addLine() } else if (e.key === 'Escape') setSel(null); return }
    if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el !== searchRef.current)) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && rows[cursor]) { e.preventDefault(); setSel(rows[cursor]); setErr(''); setOk('') }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6" onKeyDown={onKey}>
      <h1 className="text-xl font-semibold">Mutasi Stok antar Cabang</h1>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">Dari cabang
          <select className="input mt-1" value={src} onChange={(e) => setFrom(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <label className="text-sm">Ke cabang
          <select className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)}><option value="">— pilih —</option>{branches.filter((b) => b.id !== src).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <label className="min-w-64 flex-1 text-sm">Catatan (opsional)
          <input className="input mt-1" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="mis. kiriman rutin minggu ini" />
        </label>
      </div>
      {!canMove && <p className="text-warning">Akun Anda tidak punya hak memindahkan stok (hanya melihat).</p>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col gap-2 rounded-2xl bg-bg-light p-4 shadow">
          {!sel ? (
            <>
              <input ref={searchRef} className="input" placeholder="Cari produk: kode / nama / pengarang (F2)" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
              <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-muted">
                {rows.map((p, i) => (
                  <div key={p.id} data-srow={i} onClick={() => { setSel(p); setErr(''); setOk('') }}
                    className={`cursor-pointer border-b border-border-muted px-3 py-2 text-sm hover:bg-highlight/20 ${i === cursor ? 'bg-highlight/25' : ''}`}>
                    <div className="font-medium">{p.name}</div><div className="text-text-muted">{p.code}</div>
                  </div>
                ))}
                {data && rows.length === 0 && <div className="p-6 text-center text-text-muted">Produk tidak ditemukan.</div>}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div><div className="font-medium">{sel.name}</div><div className="text-sm text-text-muted">{sel.code}</div></div>
              <div className="text-sm">Stok di cabang asal: <b>{available}</b> pcs</div>
              <input className="input" autoFocus inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} placeholder="Jumlah dipindahkan" />
              <div className="flex gap-2"><button className="btn-ghost" onClick={() => setSel(null)}>Kembali (Esc)</button><button className="btn-primary" disabled={!canMove} onClick={addLine}>Tambah ke daftar (Enter)</button></div>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col gap-2 rounded-2xl bg-bg-light p-4 shadow">
          <div className="font-medium">Daftar dipindahkan ({lines.length})</div>
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-muted">
            <table className="w-full text-sm">
              <tbody>
                {lines.map((l) => (
                  <tr key={l.product_id} className="border-b border-border-muted">
                    <td className="p-2"><div className="font-medium">{l.name}</div><div className="text-text-muted">{l.code}</div></td>
                    <td className="p-2 text-right">{l.qty}</td>
                    <td className="p-2 text-right"><button className="btn-ghost !py-0.5" onClick={() => setLines((x) => x.filter((y) => y.product_id !== l.product_id))}>Hapus</button></td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td className="p-6 text-center text-text-muted">Belum ada produk.</td></tr>}
              </tbody>
            </table>
          </div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          {ok && <p role="status" className="text-sm text-success">{ok}</p>}
          <button className="btn-primary" disabled={busy || !canMove || !lines.length || !to} onClick={submit}>{busy ? 'Memindahkan…' : `Pindahkan ${lines.length} produk`}</button>
        </section>
      </div>
    </div>
  )
}
