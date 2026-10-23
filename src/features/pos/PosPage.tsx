import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSale, searchProducts } from './api'
import { Receipt } from './Receipt'
import { StockByBranch } from '../stock/StockByBranch'
import { rupiah } from '../../shared/format'
import { useDebounced } from '../../shared/hooks'
import type { CartLine, Method, Product, SaleResult } from './types'

const DISCOUNTS = [0, 5, 10, 15, 20, 25]
const dLabel = (d: number) => (d === 0 ? 'Tanpa diskon' : `${d}%`)
const METHODS: { key: Method; label: string }[] = [
  { key: 'cash', label: 'Tunai' }, { key: 'qris', label: 'QRIS' },
  { key: 'debit', label: 'Debit' }, { key: 'credit_card', label: 'Kartu Kredit' },
]
// items -> klik "Pembayaran" -> discount (diskon per produk / semua) -> payment (metode bayar)
type Step = 'items' | 'discount' | 'payment'
type Done = { sale: SaleResult; lines: CartLine[]; method: Method; cash: number }

export default function PosPage() {
  const [step, setStep] = useState<Step>('items')
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 200)
  const [cursor, setCursor] = useState(0)
  const [cart, setCart] = useState<CartLine[]>([])
  const [allDisc, setAllDisc] = useState<number | null>(null) // null = "diskon semua" mati
  const [member, setMember] = useState('')
  const [method, setMethod] = useState<Method | null>(null)
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const qc = useQueryClient()
  const searchRef = useRef<HTMLInputElement>(null)
  const scanning = useRef(false)

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['products', dq], queryFn: () => searchProducts(dq), placeholderData: keepPreviousData,
  })

  const eff = (l: CartLine) => allDisc ?? l.disc
  const lineDisc = (l: CartLine) => Math.round((l.price * l.qty * eff(l)) / 100) // tampilan; server menghitung ulang
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const discAmt = cart.reduce((s, l) => s + lineDisc(l), 0)
  const total = subtotal - discAmt
  const anyDisc = cart.some((l) => eff(l) > 0)
  const memberOk = !anyDisc || member.trim().length > 0
  const cashNum = Number(cash.replace(/\D/g, '')) || 0

  useEffect(() => setCursor(0), [dq])
  useEffect(() => { if (step === 'items') searchRef.current?.focus() }, [step])
  useEffect(() => { document.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor])
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [done])

  function add(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.id === p.id)
      if (i < 0) return [...c, { ...p, qty: 1, disc: 0 }]
      return c.map((l, j) => (j === i ? { ...l, qty: Math.min(l.qty + 1, 9999) } : l))
    })
  }
  const changeQty = (id: string, d: number) =>
    setCart((c) => c.map((l) => (l.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0))
  const setLineDisc = (id: string, d: number) => setCart((c) => c.map((l) => (l.id === id ? { ...l, disc: d } : l)))

  /** Enter di langkah produk. Pemindai barcode mengetik kode lalu Enter dalam hitungan milidetik,
   *  sebelum daftar di layar sempat diperbarui, jadi kode dicari ulang saat itu juga. */
  async function onEnterItems() {
    const text = q.trim()
    if (text && (q !== dq || isFetching)) {
      if (scanning.current) return
      scanning.current = true
      try {
        const res = await searchProducts(text)
        const hit = res.find((p) => p.code === text) ?? (res.length === 1 ? res[0] : undefined)
        if (hit) { add(hit); setQ(''); setNotice('') }
        else setNotice(res.length === 0 ? `Produk "${text}" tidak ditemukan` : 'Ada beberapa hasil, pilih dengan ↑↓ lalu Enter')
      } catch { setNotice('Gagal mencari produk') } finally { scanning.current = false }
      return
    }
    const exact = text ? products.find((p) => p.code === text) : undefined
    const target = exact ?? products[cursor]
    if (target) { add(target); if (exact) setQ('') }
  }

  async function pay(m: Method) {
    if (busy || cart.length === 0) return
    setBusy(true); setError('')
    const lines = cart.map((l) => ({ ...l, disc: eff(l) }))
    try {
      const sale = await createSale(lines, member, m, m === 'cash' ? cashNum : undefined)
      setDone({ sale, lines, method: m, cash: cashNum })
      void qc.invalidateQueries({ queryKey: ['stock-branches'] })
      setCart([]); setAllDisc(null); setMember(''); setMethod(null); setCash(''); setStep('items')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaksi gagal')
    } finally { setBusy(false) }
  }
  function choose(m: Method) {
    setMethod(m); setError('')
    if (m !== 'cash') void pay(m) // cashless: langsung cetak
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === 'INPUT'
      if (e.key === 'F2') { e.preventDefault(); setStep('items'); searchRef.current?.focus(); return }
      if (e.key === 'F8' && cart.length) {
        e.preventDefault()
        if (step === 'items') setStep('discount')
        else if (step === 'discount' && memberOk) setStep('payment')
        return
      }
      if (e.key === 'Escape') {
        if (step === 'items') { setQ(''); setNotice('') }
        else setStep(step === 'payment' ? 'discount' : 'items')
        return
      }
      if (step === 'items') {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, products.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
        else if (e.key === 'Enter') { e.preventDefault(); void onEnterItems() }
      } else if (step === 'payment' && !typing && !busy) {
        const m = METHODS[Number(e.key) - 1]
        if (m) choose(m.key)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  return (
    <>
      <div className="grid h-full grid-cols-[1fr_26rem] gap-4 p-4 print:hidden">
        {/* ---- kiri: daftar produk (baris, bukan kartu) ---- */}
        <section className="flex min-h-0 flex-col gap-3">
          {done && (
            <div className="rounded-2xl bg-success-100 px-4 py-2 text-success-900 dark:bg-success-900/40 dark:text-success-100">
              {done.sale.invoice_no} tersimpan · Total {rupiah(done.sale.total)}
              {done.method === 'cash' && <b> · Kembalian {rupiah(done.sale.change)}</b>}
            </div>
          )}
          <input ref={searchRef} className="input" placeholder="Scan barcode / cari kode atau nama produk (F2)" value={q}
            onChange={(e) => { setQ(e.target.value); setNotice('') }} maxLength={60} />
          {notice && <p role="status" className="px-2 text-sm text-warning-600 dark:text-warning-400">{notice}</p>}
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-bg-100">
                <tr><th className="w-40 px-4 py-2">Kode produk</th><th className="px-4 py-2">Nama produk</th><th className="w-40 px-4 py-2 text-right">Harga</th></tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id} data-row={i} onClick={() => { setCursor(i); add(p) }}
                    className={`cursor-pointer border-t border-border ${i === cursor ? 'bg-primary-600 text-white' : 'hover:bg-bg-100'}`}>
                    <td className={`px-4 py-2 font-mono ${i === cursor ? 'text-white' : ''}`}>{p.code}</td>
                    <td className={`px-4 py-2 ${i === cursor ? 'text-white' : ''}`}>{p.name}</td>
                    <td className="px-4 py-2 text-right">{rupiah(p.price)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-fg-200">Tidak ada produk</td></tr>}
              </tbody>
            </table>
          </div>
          {products[cursor] && (
            <div className="space-y-1 rounded-2xl bg-bg p-4 shadow-sm">
              <div className="truncate text-sm text-fg-200">Stok: {products[cursor].name}</div>
              <StockByBranch productId={products[cursor].id} />
            </div>
          )}
          <p className="text-sm text-fg-200">↑↓ pilih · Enter tambah · F8 pembayaran · Esc kembali</p>
        </section>

        {/* ---- kanan: keranjang + langkah ---- */}
        <aside className="flex min-h-0 flex-col gap-3 rounded-2xl bg-bg p-4 shadow">
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            {cart.map((l) => (
              <div key={l.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><div className="truncate">{l.name}</div><div className="text-sm text-fg-200">{rupiah(l.price)}</div></div>
                  <button className="btn-ghost !px-3 !py-0" onClick={() => changeQty(l.id, -1)} disabled={step === 'payment'}>−</button>
                  <span className="w-8 text-center">{l.qty}</span>
                  <button className="btn-ghost !px-3 !py-0" onClick={() => changeQty(l.id, 1)} disabled={step === 'payment'}>+</button>
                  <span className="w-24 text-right">{rupiah(l.price * l.qty)}</span>
                </div>
                {step === 'discount' && allDisc === null && (
                  <label className="flex items-center justify-end gap-2 text-sm">Diskon
                    <select className="input !w-auto !py-1" value={l.disc} onChange={(e) => setLineDisc(l.id, Number(e.target.value))}>
                      {DISCOUNTS.map((d) => <option key={d} value={d}>{dLabel(d)}</option>)}
                    </select>
                  </label>
                )}
                {step !== 'discount' && eff(l) > 0 && (
                  <div className="text-right text-sm text-primary-400">Diskon {eff(l)}% −{rupiah(lineDisc(l))}</div>
                )}
              </div>
            ))}
            {cart.length === 0 && <p className="text-fg-200">Keranjang kosong</p>}
          </div>

          <div className="space-y-1 border-t border-border pt-3">
            <Line k="Subtotal" v={rupiah(subtotal)} />
            {discAmt > 0 && <Line k="Diskon" v={'-' + rupiah(discAmt)} />}
            <Line k="Total" v={rupiah(total)} big />
          </div>

          {step === 'items' && <button className="btn-primary" disabled={!cart.length} onClick={() => setStep('discount')}>Pembayaran (F8)</button>}

          {step === 'discount' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allDisc !== null} onChange={(e) => setAllDisc(e.target.checked ? 0 : null)} />
                Diskon semua produk
              </label>
              {allDisc !== null && (
                <select className="input" value={allDisc} onChange={(e) => setAllDisc(Number(e.target.value))} aria-label="Diskon semua produk">
                  {DISCOUNTS.map((d) => <option key={d} value={d}>{dLabel(d)}</option>)}
                </select>
              )}
              {anyDisc && (
                <input className="input" autoFocus placeholder="Member / nomer member" value={member} maxLength={40}
                  onChange={(e) => setMember(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && memberOk) setStep('payment') }} />
              )}
              <button className="btn-primary w-full" disabled={!memberOk} onClick={() => setStep('payment')}>Lanjut ke metode bayar (F8)</button>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m, i) => (
                  <button key={m.key} disabled={busy} className={method === m.key ? 'btn-primary' : 'btn-ghost'} onClick={() => choose(m.key)}>
                    {i + 1}. {m.label}
                  </button>
                ))}
              </div>
              {method === 'cash' && (
                <div className="space-y-2">
                  <input className="input" autoFocus inputMode="numeric" placeholder="Uang diterima" value={cash}
                    onChange={(e) => setCash(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && cashNum >= total) void pay('cash') }} />
                  <button className="btn-ghost w-full" onClick={() => setCash(String(total))}>Uang pas</button>
                  <Line k="Kembalian" v={cashNum >= total ? rupiah(cashNum - total) : '—'} big />
                  <button className="btn-primary w-full" disabled={busy || cashNum < total} onClick={() => pay('cash')}>
                    {busy ? 'Memproses…' : 'Bayar & cetak'}
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </aside>
      </div>
      {done && <Receipt {...done} />}
    </>
  )
}

const Line = ({ k, v, big }: { k: string; v: string; big?: boolean }) => (
  <div className={`flex justify-between ${big ? 'text-xl font-semibold' : ''}`}><span>{k}</span><span>{v}</span></div>
)
