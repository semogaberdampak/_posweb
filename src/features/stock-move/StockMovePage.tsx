import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getStockMoveEligibleProducts, stockByBranch, transferStock, type ProductRow, type TransferLine } from './api'
import { useDebounced } from '../../shared/hooks'

type StockInfo = { branch_id: string; branch_code: string; branch_name: string; qty: number }

export default function StockMovePage() {
  useAuth()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [cursor, setCursor] = useState(0)
  const [sel, setSel] = useState<ProductRow | null>(null)
  const [lines, setLines] = useState<TransferLine[]>([])
  const [dstBranch, setDstBranch] = useState<string>('')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stock, setStock] = useState<Map<string, StockInfo>>(new Map())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const rows = await getStockMoveEligibleProducts()
        setProducts(rows)
      } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal memuat produk.') }
    }
    load()
  }, [])

  useEffect(() => {
    setCursor(0); setSel(null); setLines([]); setDstBranch(''); setQty('1'); setNote(''); setErr('')
  }, [dq])

  useEffect(() => {
    if (!sel) return
    const productId = sel.id
    async function loadStock() {
      try {
        const s = await stockByBranch(productId)
        setStock(new Map(s.map((b) => [b.branch_id, b])))
      } catch { /* abaikan */ }
    }
    loadStock()
  }, [sel?.id])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); return }
    if (!sel && products.length > 0) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
      if (!isInput || target === searchRef.current) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % products.length); return }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + products.length) % products.length); return }
        if (e.key === 'Enter') { e.preventDefault(); handleSelectProduct(products[cursor]); return }
      }
    }
    if (sel && e.key === 'Enter') {
      const target = e.target as HTMLElement
      if (target.tagName !== 'TEXTAREA') { e.preventDefault(); addLine(sel); return }
    }
  }

  const handleSelectProduct = (p: ProductRow) => { setSel(p); setCursor(0); setErr('') }

  const addLine = (p: ProductRow) => {
    const qtyNum = Number(qty)
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) { setErr('Jumlah harus angka bulat > 0.'); return }
    const srcInfo = stock.get(p.id)
    const srcQty = srcInfo?.qty ?? 0
    if (qtyNum > srcQty) { setErr('Stok di PUSAT kurang (tersedia ' + srcQty + ').'); return }
    setLines((l) => {
      const i = l.findIndex((x) => x.product_id === p.id)
      if (i >= 0) return l
      return [...l, { product_id: p.id, product_code: p.code, product_name: p.name, qty: qtyNum }]
    })
    setSel(null); setStock(new Map()); setErr(''); setQty('1'); setDstBranch('')
  }

  const removeLine = (id: string) => setLines((l) => l.filter((x) => x.product_id !== id))

  const submit = async () => {
    if (!dstBranch) { setErr('Pilih cabang tujuan.'); return }
    if (lines.length === 0) { setErr('Pilih minimal 1 produk.'); return }
    for (const l of lines) {
      const qtyNum = Number(l.qty)
      if (!Number.isInteger(qtyNum) || qtyNum <= 0) { setErr('Jumlah ' + l.product_code + ' harus > 0.'); return }
    }
    setBusy(true); setErr('')
    try {
      for (const l of lines) { await transferStock({ product_id: l.product_id, qty: l.qty, note, dst_branch: dstBranch }) }
      setLines([]); setSel(null); setStock(new Map()); setNote(''); setQty('1'); setDstBranch('')
    } catch (x) { setErr(x instanceof Error ? x.message : 'Transaksi gagal.') } finally { setBusy(false) }
  }

  const dstOptions = Array.from(stock.values()).filter((b) => b.branch_code !== 'PUSAT')

  return (
    <div className="flex h-full flex-col gap-3 p-4" onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Mutasi Stok (PUSAT &rarr; Cabang)</h1>
        <input ref={searchRef} className="input max-w-md flex-1" placeholder="Cari produk kode / nama (F2)" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
      </div>

      {!sel ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-bg-100 dark:bg-bg-200"><tr><th className="px-4 py-2">Kode</th><th className="px-4 py-2">Nama produk</th></tr></thead>
            <tbody>
              {products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase())).map((p, i) => (
                <tr key={p.id} data-srow={i} className={"cursor-pointer border-b border-border " + (i===cursor?'bg-primary-100 dark:bg-primary-900/20':'') + " hover:bg-bg-100 dark:hover:bg-bg-200"} onClick={() => handleSelectProduct(p)}>
                  <td className="font-mono px-4 py-2">{p.code}</td><td className="px-4 py-2">{p.name}</td>
                </tr>
              ))}
              {products.length===0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-fg-200">Tidak ada produk aktif.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <b>{sel.name}</b> — stok PUSAT saat ini: <b className="text-slate-900 dark:text-slate-100">{stock.get(sel.id)?.qty ?? 0}</b> pcs
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <label className="text-sm block mb-1">Cabang tujuan</label>
              <select className="input w-full" value={dstBranch} onChange={(e) => setDstBranch(e.target.value)}>
                <option value="">-- Pilih --</option>
                {dstOptions.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>{b.branch_code} — {b.branch_name} ({b.qty} pcs)</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <label className="text-sm block mb-1">Jumlah pindahkan</label>
              <input className="input w-full" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g,''))} placeholder="Contoh: 5" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <span className="text-sm block mb-1">Catatan (opsional)</span>
              <input className="input w-full" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="mis. perpindahan ke cabang X" />
            </div>
            <button className="btn-primary" disabled={!dstBranch || qty==='' || busy} onClick={() => addLine(sel!)}>
              {busy ? 'Menambah…' : 'Tambah ke daftar'}
            </button>
          </div>
          {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
          {lines.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900"><tr><th className="px-4 py-2">Kode</th><th className="px-4 py-2">Nama</th><th className="text-right px-4 py-2">Qty</th><th className="text-right px-4 py-2">Aksi</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.product_id}>
                      <td className="font-mono px-4 py-2">{l.product_code}</td><td className="px-4 py-2">{l.product_name}</td>
                      <td className="text-right px-4 py-2">{l.qty}</td>
                      <td className="text-right px-4 py-2"><button className="btn-ghost !py-0" onClick={() => removeLine(l.product_id)}>Hapus</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn-primary w-full mt-3" disabled={busy} onClick={submit}>{busy ? 'Menyimpan…' : 'Pindahkan semua ke cabang tujuan'}</button>
            </div>
          )}
        </div>
      )}
      <p className="text-sm text-slate-500">↑↓ pilih Â· Enter = pilih/tambah Â· F2 cari</p>
    </div>
  )
}
