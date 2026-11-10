import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { createSale, newRequestId, searchProducts } from './api'
import { PrintSheet } from '../print/views'
import { createPrintGuard, triggerPrint, usePrintPrefs } from '../print/printing'
import { printDirect } from '../../lib/webusb-printer'
import { useInvoiceCfg, useReceiptCfg, type PrintData } from '../print/templates'
import { listBranches } from '../users/api'
import { StockByBranch } from '../stock/StockByBranch'
import { findMember, type MemberLookup } from '../members/api'
import { useAuth } from '../auth/AuthProvider'
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
type Done = { sale: SaleResult; lines: CartLine[]; method: Method; cash: number; member: string; at: Date }

export default function PosPage() {
  const [step, setStep] = useState<Step>('items')
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 50) // debounce singkat + penyaringan di memori (di bawah) = hasil terasa instan
  const [cursor, setCursor] = useState(0)
  const [cart, setCart] = useState<CartLine[]>([])
  const [allDisc, setAllDisc] = useState<number | null>(null) // null = "diskon semua" mati
  const [member, setMember] = useState('')            // teks yang diketik kasir
  const [found, setFound] = useState<MemberLookup | null>(null) // member yang sudah dicek (wajib bila memakai diskon)
  const [matches, setMatches] = useState<MemberLookup[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [memberMsg, setMemberMsg] = useState('')
  const [method, setMethod] = useState<Method | null>(null)
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const qc = useQueryClient()
  const [printKind, setPrintKind] = useState<'receipt' | 'invoice'>('receipt')
  const { autoPrint, thermalOnly, usbDirect } = usePrintPrefs()
  const aliveRef = useRef(false) // false saat halaman ditinggalkan: cegah cetak susulan di halaman lain
  const printGuard = useRef(createPrintGuard())
  const receiptCfg = useReceiptCfg(), invoiceCfg = useInvoiceCfg() // dimuat sejak halaman dibuka agar siap saat cetak
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const { activeBranchId, allBranches, profile } = useAuth()
  const sellBranch = allBranches && activeBranchId && activeBranchId !== profile?.branch_id ? activeBranchId : undefined
  const searchRef = useRef<HTMLInputElement>(null)
  const scanning = useRef(false)
  const attempt = useRef<{ key: string; id: string } | null>(null) // kunci idempotensi percobaan bayar berjalan

  const { data: rawProducts = [], isFetching } = useQuery({
    queryKey: ['products', dq], queryFn: () => searchProducts(dq), placeholderData: keepPreviousData,
  })

  const eff = (l: CartLine) => allDisc ?? l.disc
  const lineDisc = (l: CartLine) => Math.round((l.price * l.qty * eff(l)) / 100) // tampilan; server menghitung ulang
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const discAmt = cart.reduce((s, l) => s + lineDisc(l), 0)
  const total = subtotal - discAmt
  const anyDisc = cart.some((l) => eff(l) > 0)
  const memberOk = !anyDisc || !!found?.is_active
  const memberNo = found?.member_no ?? ''
  const cashNum = Number(cash.replace(/\D/g, '')) || 0

  // ganti cabang aktif = mulai transaksi baru (cegah keranjang terbawa ke cabang lain)
  useEffect(() => {
    setCart([]); setStep('items'); setAllDisc(null); setMember(''); setFound(null); setMatches(null); setMemberMsg(''); setMethod(null); setCash('')
  }, [activeBranchId])
  // Saat mengetik, daftar sebelumnya langsung disaring di memori (server memakai pencarian kode/nama yang sama), jadi tidak menunggu jaringan.
  const products = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? rawProducts.filter((p) => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)) : rawProducts
  }, [rawProducts, q])
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false } }, [])
  useEffect(() => setCursor(0), [dq])
  useEffect(() => { if (step === 'items') searchRef.current?.focus() }, [step])
  useEffect(() => { document.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor])
  useEffect(() => {
    if (!done) return
    if (!autoPrint) return // pengaturan komputer ini: cetak otomatis dimatikan
    // satu nota = satu cetakan otomatis. Diklaim di sini (kebal render ganda StrictMode); cetak berjalan terus meski efek dibersihkan.
    if (!printGuard.current.once(done.sale.invoice_no)) return
    void printReceipt(done)
  }, [done, autoPrint])

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

  /** Cari member (tombol "Cek"): nomor ID persis atau nama. Bila hasilnya banyak, kasir memilih salah satu. */
  async function checkMember() {
    const term = member.trim()
    setMemberMsg(''); setMatches(null)
    if (!term) { setFound(null); setMemberMsg('Isi nomor ID atau nama member dulu.'); return }
    setChecking(true)
    try {
      const rows = await findMember(term)
      if (rows.length === 0) { setFound(null); setMemberMsg(`Member "${term}" tidak ditemukan.`); return }
      const exact = rows.find((m) => m.member_no === term.toUpperCase())
      if (exact || rows.length === 1) { selectMember(exact ?? rows[0]); return }
      setMatches(rows); setMemberMsg(`${rows.length} member cocok — pilih salah satu di bawah.`)
    } catch (e) { setFound(null); setMemberMsg(e instanceof Error ? e.message : 'Gagal mencari member.')
    } finally { setChecking(false) }
  }

  function selectMember(m: MemberLookup) {
    if (!m.is_active) { setFound(null); setMatches(null); setMemberMsg(`Member ${m.member_no} nonaktif — tidak bisa dipakai.`); return }
    setFound(m); setMatches(null); setMember(m.member_no); setMemberMsg('')
  }

  async function pay(m: Method) {
    if (busy || cart.length === 0) return
    setBusy(true); setError('')
    const lines = cart.map((l) => ({ ...l, disc: eff(l) }))
    // Kunci yang sama dipakai ulang bila percobaan sebelumnya gagal dengan keranjang/metode yang sama,
    // sehingga retry (koneksi putus) mengembalikan transaksi yang sudah ada, bukan membuat yang kedua.
    const key = JSON.stringify([lines.map((l) => [l.id, l.qty, l.disc]), memberNo, m, m === 'cash' ? cashNum : null, sellBranch ?? null])
    if (attempt.current?.key !== key) attempt.current = { key, id: newRequestId() }
    try {
      const sale = await createSale(lines, memberNo, m, m === 'cash' ? cashNum : undefined, sellBranch, attempt.current.id)
      attempt.current = null
      setDone({ sale, lines, method: m, cash: cashNum, member: sale.member ?? '', at: new Date() })
      void qc.invalidateQueries({ queryKey: ['stock-branches'] })
      void qc.invalidateQueries({ queryKey: ['top-products'] })
      setCart([]); setAllDisc(null); setMember(''); setFound(null); setMatches(null); setMemberMsg(''); setMethod(null); setCash(''); setStep('items')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaksi gagal')
    } finally { setBusy(false) }
  }
  /** Struk 80mm: bila "cetak langsung USB" aktif, coba printer USB lebih dulu (mengikuti Format Nota); gagal/tidak aktif -> cetak browser. */
  async function printReceipt(d: Done) {
    if (usbDirect) {
      const r = await printDirect(printData(d), receiptCfg)
      if (r.ok) return
      console.warn('Cetak langsung USB gagal, memakai cetak browser:', r.reason)
    }
    if (!aliveRef.current) return
    setPrintKind('receipt'); triggerPrint()
  }
  function printAgain(k: 'receipt' | 'invoice') {
    if (k === 'receipt' && done) { void printReceipt(done); return }
    setPrintKind(k); triggerPrint()
  }
  function printData(d: Done): PrintData {
    const bid = activeBranchId ?? profile?.branch_id
    return {
      invoiceNo: d.sale.invoice_no, at: d.at, cashier: profile?.full_name ?? '', branch: branches.find((b) => b.id === bid)?.name ?? profile?.branch_name ?? '',
      customer: d.member, lines: d.lines.map((l) => ({ code: l.code, name: l.name, price: l.price, qty: l.qty, disc: l.disc })),
      subtotal: d.sale.subtotal, discount: d.sale.discount, total: d.sale.total, method: d.method,
      paid: d.method === 'cash' ? d.cash : d.sale.total, change: d.sale.change,
    }
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
      <div className="grid h-full grid-cols-[1fr_clamp(19rem,30vw,26rem)] gap-4 p-4 print:hidden">
        {/* ---- kiri: daftar produk (baris, bukan kartu) ---- */}
        <section className="flex min-h-0 flex-col gap-3">
          {done && (
            <div className="rounded-2xl bg-success/20 px-4 py-2 text-success">
              {done.sale.invoice_no} tersimpan · Total {rupiah(done.sale.total)}
              {done.method === 'cash' && <b> · Kembalian {rupiah(done.sale.change)}</b>}
              <button className="btn-ghost ml-3 !py-1" onClick={() => printAgain('receipt')}>Cetak ulang struk</button>
              {!thermalOnly && <button className="btn-ghost ml-2 !py-1" onClick={() => printAgain('invoice')}>Cetak nota A4</button>}
            </div>
          )}
          <input ref={searchRef} className="input" placeholder="Scan barcode / cari kode atau nama produk (F2)" value={q}
            onChange={(e) => { setQ(e.target.value); setNotice('') }} maxLength={60} />
          {notice && <p role="status" className="px-2 text-sm text-warning">{notice}</p>}
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-muted">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-bg-dark">
                <tr><th className="w-36 whitespace-nowrap px-3 py-2">Kode produk</th><th className="px-3 py-2">Nama produk</th><th className="w-32 whitespace-nowrap px-3 py-2 text-right">Harga</th></tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.id} data-row={i} onClick={() => { setCursor(i); add(p) }}
                    className={`cursor-pointer border-t border-border-muted ${i === cursor ? 'bg-primary/20' : 'hover:bg-highlight/25'}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{p.code}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{rupiah(p.price)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-text-muted">Tidak ada produk</td></tr>}
              </tbody>
            </table>
          </div>
          {products[cursor] && (
            <div className="space-y-1 rounded-2xl bg-bg-light px-3 py-1.5 shadow-sm">
              <div className="truncate text-xs text-text-muted">Stok: {products[cursor].name}</div>
              <StockByBranch productId={products[cursor].id} />
            </div>
          )}
          <p className="text-sm text-text-muted">↑↓ pilih · Enter tambah · F8 pembayaran · Esc kembali</p>
        </section>

        {/* ---- kanan: keranjang + langkah ---- */}
        <aside className="flex min-h-0 flex-col gap-3 rounded-2xl bg-bg-light p-4 shadow">
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            {cart.map((l) => (
              <div key={l.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><div className="truncate">{l.name}</div><div className="text-sm text-text-muted">{rupiah(l.price)}</div></div>
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
                  <div className="text-right text-sm text-primary">Diskon {eff(l)}% −{rupiah(lineDisc(l))}</div>
                )}
              </div>
            ))}
            {cart.length === 0 && <p className="text-text-muted">Keranjang kosong</p>}
          </div>

          <div className="space-y-1 border-t border-border-muted pt-3">
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
                <div className="space-y-2">
                  <label className="block text-sm">Member <span className="text-text-muted">(wajib saat memakai diskon)</span>
                    <div className="mt-1 flex gap-2">
                      <input className="input" autoFocus placeholder="Nomor ID / Nama member" value={member} maxLength={60}
                        onChange={(e) => { setMember(e.target.value); setFound(null); setMatches(null); setMemberMsg('') }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void checkMember() } }} />
                      <button className="btn-ghost whitespace-nowrap" disabled={checking || !member.trim()} onClick={() => void checkMember()}>
                        {checking ? 'Mencari\u2026' : 'Cek'}
                      </button>
                    </div>
                  </label>
                  {found && <div className="rounded-2xl bg-success/20 px-3 py-2 text-sm text-success">
                    Nomor ID: <b>{found.member_no}</b> \u2014 Nama: <b>{found.name}</b>
                    {(found.institution || found.city || found.segment_detail) && (
                      <div className="text-xs text-success/80">
                        {[found.institution, found.city, found.segment, found.segment_detail].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>}
                  {matches && (
                    <ul className="max-h-40 space-y-1 overflow-auto">
                      {matches.map((m) => (
                        <li key={m.id}>
                          <button className="w-full rounded-xl bg-bg-dark px-3 py-1.5 text-left text-sm hover:bg-highlight/25"
                            onClick={() => selectMember(m)}>
                            <b>{m.member_no}</b> \u2014 {m.name}{m.city ? ` · ${m.city}` : ''}{!m.is_active && ' (nonaktif)'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {memberMsg && <p className={`text-sm ${found ? 'text-text-muted' : 'text-danger'}`}>{memberMsg}</p>}
                </div>
              )}
              <button className="btn-primary w-full" disabled={!memberOk} onClick={() => setStep('payment')}>Lanjut ke metode bayar (F8)</button>
              {anyDisc && !found && <p className="text-center text-xs text-text-muted">Cari member dulu, lalu tekan Cek. Diskon hanya berlaku untuk member terdaftar.</p>}
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-3">
              {found && <p className="rounded-2xl bg-bg-dark px-3 py-2 text-sm">Member: <b>{found.member_no}</b> \u2014 {found.name}</p>}
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
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </aside>
      </div>
      {done && <PrintSheet kind={printKind} data={printData(done)} receipt={receiptCfg} invoice={invoiceCfg} />}
    </>
  )
}

const Line = ({ k, v, big }: { k: string; v: string; big?: boolean }) => (
  <div className={`flex justify-between ${big ? 'text-xl font-semibold' : ''}`}><span>{k}</span><span>{v}</span></div>
)
