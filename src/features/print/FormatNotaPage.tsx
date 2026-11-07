import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { InvoiceView, PrintSheet, ReceiptView } from './views'
import {
  DEFAULT_INVOICE, DEFAULT_RECEIPT, SAMPLE, saveTemplate, useInvoiceCfg, useReceiptCfg,
  type InvoiceCfg, type Kind, type ReceiptCfg,
} from './templates'

type F = { path: string; label: string; type: 'text' | 'lines' | 'bool' | 'num'; hint?: string }
const TOKENS = 'Bisa pakai: {kasir} {cabang} {CABANG} {waktu} {tanggal} {no} {pelanggan}'

const RECEIPT_FIELDS: F[] = [
  { path: 'headerLines', label: 'Kepala struk (1 baris per baris cetak; baris pertama tebal)', type: 'lines', hint: TOKENS },
  { path: 'labels.no', label: 'Label nomor', type: 'text' }, { path: 'labels.date', label: 'Label tanggal', type: 'text' },
  { path: 'labels.cashier', label: 'Label kasir', type: 'text' }, { path: 'labels.cust', label: 'Label pelanggan', type: 'text' },
  { path: 'showCashier', label: 'Tampilkan baris kasir', type: 'bool' }, { path: 'showCust', label: 'Tampilkan baris pelanggan', type: 'bool' },
  { path: 'defaultCust', label: 'Teks pelanggan bila tanpa member', type: 'text' },
  { path: 'labels.total', label: 'Label total', type: 'text' }, { path: 'labels.paid', label: 'Label bayar', type: 'text' }, { path: 'labels.change', label: 'Label kembali', type: 'text' },
  { path: 'methodLabels.cash', label: 'Teks metode: tunai', type: 'text' }, { path: 'methodLabels.qris', label: 'Teks metode: QRIS', type: 'text' },
  { path: 'methodLabels.debit', label: 'Teks metode: debit', type: 'text' }, { path: 'methodLabels.credit_card', label: 'Teks metode: kartu kredit', type: 'text' },
  { path: 'footerLines', label: 'Kaki struk', type: 'lines', hint: TOKENS },
  { path: 'widthMm', label: 'Lebar cetak (mm)', type: 'num' }, { path: 'fontPx', label: 'Ukuran huruf (px)', type: 'num' },
]
const INVOICE_FIELDS: F[] = [
  { path: 'title', label: 'Judul (kanan atas)', type: 'text' }, { path: 'companyName', label: 'Nama perusahaan', type: 'text' },
  { path: 'headerLines', label: 'Alamat / kontak (1 baris per baris cetak)', type: 'lines', hint: TOKENS },
  { path: 'labels.no', label: 'Label nomor', type: 'text' }, { path: 'labels.date', label: 'Label tanggal', type: 'text' }, { path: 'labels.to', label: 'Label "Kepada"', type: 'text' },
  { path: 'defaultCust', label: 'Teks "Kepada" bila tanpa member', type: 'text' },
  { path: 'infoLine', label: 'Baris keterangan di atas tabel', type: 'text', hint: TOKENS },
  { path: 'cols.code', label: 'Judul kolom: kode', type: 'text' }, { path: 'cols.name', label: 'Judul kolom: barang', type: 'text' },
  { path: 'cols.price', label: 'Judul kolom: harga', type: 'text' }, { path: 'cols.qty', label: 'Judul kolom: qty', type: 'text' },
  { path: 'cols.disc', label: 'Judul kolom: diskon', type: 'text' }, { path: 'cols.ppn', label: 'Judul kolom: PPn', type: 'text' }, { path: 'cols.sub', label: 'Judul kolom: sub total', type: 'text' },
  { path: 'showPpn', label: 'Tampilkan kolom PPn (harga ditampilkan tanpa PPn)', type: 'bool' },
  { path: 'ppnPercent', label: 'PPn yang tertulis di kolom (%)', type: 'num' }, { path: 'ppnEffective', label: 'PPn efektif untuk hitung harga tampil (%)', type: 'num', hint: 'Bawaan 11 (DPP nilai lain) agar cocok dengan nota lama.' },
  { path: 'totals.total', label: 'Label total', type: 'text' }, { path: 'totals.paid', label: 'Label pembayaran', type: 'text' }, { path: 'totals.change', label: 'Label kembalian', type: 'text' },
  { path: 'footerLines', label: 'Kaki nota', type: 'lines', hint: TOKENS },
]

const getP = (o: unknown, p: string) => p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o)
function setP<T>(o: T, p: string, v: unknown): T {
  const [h, ...rest] = p.split('.')
  const src = o as Record<string, unknown>
  return { ...src, [h]: rest.length ? setP(src[h], rest.join('.'), v) : v } as T
}

export default function FormatNotaPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const savedR = useReceiptCfg(), savedI = useInvoiceCfg()
  const [kind, setKind] = useState<Kind>('receipt')
  const [dR, setDR] = useState<ReceiptCfg>(savedR), [dI, setDI] = useState<InvoiceCfg>(savedI)
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)

  // isi draf sekali setelah format tersimpan terbaca
  useEffect(() => { if (!loaded) { setDR(savedR); setDI(savedI) } }, [savedR, savedI, loaded])
  if (profile?.role_name !== 'superadmin') return <div className="p-6">Halaman ini hanya untuk admin.</div>

  const fields = kind === 'receipt' ? RECEIPT_FIELDS : INVOICE_FIELDS
  const draft = kind === 'receipt' ? dR : dI
  const edit = (p: string, v: unknown) => { setLoaded(true); setMsg(null); kind === 'receipt' ? setDR((c) => setP(c, p, v)) : setDI((c) => setP(c, p, v)) }

  async function save() {
    setBusy(true); setMsg(null)
    try { await saveTemplate(kind, draft); await qc.invalidateQueries({ queryKey: ['print-template', kind] }); setMsg({ ok: true, t: 'Format disimpan. Berlaku untuk semua kasir pada cetak berikutnya.' }) }
    catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : 'Gagal menyimpan.' }) } finally { setBusy(false) }
  }
  function print() {
    setPrinting(true)
    const done = () => { setPrinting(false); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 150)
  }

  return (
    <>
      <div className="h-full overflow-auto p-6 print:hidden">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Format Nota</h1>
          <div className="flex gap-2">
            <button className={kind === 'receipt' ? 'btn-primary' : 'btn-ghost'} onClick={() => setKind('receipt')}>Struk 80mm (nota transaksi)</button>
            <button className={kind === 'invoice' ? 'btn-primary' : 'btn-ghost'} onClick={() => setKind('invoice')}>Nota A4 (laporan)</button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div className="space-y-3 rounded-2xl bg-bg-light p-4 shadow">
            {fields.map((f) => {
              const v = getP(draft, f.path)
              return (
                <label key={f.path} className="block text-sm">
                  {f.type === 'bool' ? (
                    <span className="flex items-center gap-2"><input type="checkbox" checked={!!v} onChange={(e) => edit(f.path, e.target.checked)} />{f.label}</span>
                  ) : (
                    <>
                      <span className="text-text-muted">{f.label}</span>
                      {f.type === 'lines' ? (
                        <textarea className="input mt-1 min-h-24" value={(v as string[]).join('\n')} onChange={(e) => edit(f.path, e.target.value.split('\n').slice(0, 20).map((s) => s.slice(0, 120)))} />
                      ) : f.type === 'num' ? (
                        <input className="input mt-1" inputMode="numeric" value={String(v)} onChange={(e) => edit(f.path, Math.min(Number(e.target.value.replace(/\D/g, '')) || 0, 400))} />
                      ) : (
                        <input className="input mt-1" value={String(v)} maxLength={120} onChange={(e) => edit(f.path, e.target.value)} />
                      )}
                    </>
                  )}
                  {f.hint && <span className="mt-0.5 block text-xs text-text-muted">{f.hint}</span>}
                </label>
              )
            })}
            {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.t}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan format'}</button>
              <button className="btn-ghost" onClick={print}>Cetak contoh</button>
              <button className="btn-ghost" onClick={() => { setLoaded(true); kind === 'receipt' ? setDR(DEFAULT_RECEIPT) : setDI(DEFAULT_INVOICE); setMsg({ ok: true, t: 'Dikembalikan ke bawaan (nota lama TAKOM). Klik Simpan untuk menetapkan.' }) }}>Kembalikan bawaan</button>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-2 text-sm text-text-muted">Pratinjau (data contoh) — berubah langsung saat Anda mengetik</div>
            <div className="overflow-auto rounded-2xl border border-border-muted bg-white p-4 shadow">
              {kind === 'receipt' ? <ReceiptView cfg={dR} data={SAMPLE} /> : <InvoiceView cfg={dI} data={SAMPLE} />}
            </div>
          </div>
        </div>
      </div>
      {printing && <PrintSheet kind={kind} data={SAMPLE} receipt={dR} invoice={dI} />}
    </>
  )
}
