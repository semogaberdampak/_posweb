import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { listBranches } from '../users/api'
import { InvoiceView, PrintSheet, ReceiptView } from './views'
import {
  DEFAULT_INVOICE, DEFAULT_RECEIPT, SAMPLE, saveTemplate, useInvoiceCfg, useReceiptCfg,
  type InvoiceCfg, type Kind, type ReceiptCfg,
} from './templates'

type FType = 'text' | 'lines' | 'bool' | 'num' | 'align' | 'sep'
type F = { path: string; label: string; type: FType; hint?: string }
type Section = { title: string; fields: F[] }
const TOKENS = 'Bisa pakai: {kasir} {cabang} {CABANG} {waktu} {tanggal} {no} {pelanggan}'
const T = (path: string, label: string, hint?: string): F => ({ path, label, type: 'text', hint })
const B = (path: string, label: string): F => ({ path, label, type: 'bool' })
const N = (path: string, label: string, hint?: string): F => ({ path, label, type: 'num', hint })
const A = (path: string, label: string): F => ({ path, label, type: 'align' })
const S = (path: string, label: string): F => ({ path, label, type: 'sep' })
const L = (path: string, label: string, hint?: string): F => ({ path, label, type: 'lines', hint })

const RECEIPT_SECTIONS: Section[] = [
  { title: 'Kepala struk', fields: [
    B('headerVisible', 'Tampilkan kepala struk'),
    A('headerAlign', 'Perataan kepala struk'),
    B('headerBoldFirst', 'Baris pertama dicetak tebal'),
    L('headerLines', 'Isi kepala (1 baris = 1 baris cetak)', TOKENS),
  ] },
  { title: 'Nomor, tanggal, kasir, pelanggan', fields: [
    B('metaVisible', 'Tampilkan blok nomor/tanggal/kasir'),
    A('metaAlign', 'Perataan blok'),
    N('metaLabelWidthEm', 'Lebar kolom label (em)', 'Contoh 4.5. Naikkan bila label panjang.'),
    B('showNo', 'Tampilkan nomor nota'), T('labels.no', 'Label nomor'),
    B('showDate', 'Tampilkan tanggal'), T('labels.date', 'Label tanggal'),
    B('showCashier', 'Tampilkan kasir'), T('labels.cashier', 'Label kasir'),
    B('showCust', 'Tampilkan pelanggan'), T('labels.cust', 'Label pelanggan'),
    T('defaultCust', 'Teks pelanggan bila tanpa member'),
  ] },
  { title: 'Metode bayar', fields: [
    B('showMethod', 'Tampilkan metode bayar'),
    A('methodAlign', 'Perataan metode bayar'),
    T('methodLabels.cash', 'Teks metode: tunai'),
    T('methodLabels.qris', 'Teks metode: QRIS'),
    T('methodLabels.debit', 'Teks metode: debit'),
    T('methodLabels.credit_card', 'Teks metode: kartu kredit'),
  ] },
  { title: 'Baris barang', fields: [
    B('itemShowCode', 'Tampilkan kode barang'), A('itemCodeAlign', 'Perataan kode'),
    B('itemShowName', 'Tampilkan nama barang'), A('itemNameAlign', 'Perataan nama'),
    B('itemShowQty', 'Tampilkan jumlah (qty)'),
    B('itemShowPrice', 'Tampilkan harga satuan'),
    B('itemShowDisc', 'Tampilkan diskon'),
    B('itemShowSub', 'Tampilkan jumlah baris'),
    A('itemNumbersAlign', 'Perataan angka baris barang'),
  ] },
  { title: 'Pemisah (garis)', fields: [S('separator', 'Garis pemisah')] },
  { title: 'Total', fields: [
    B('totalsVisible', 'Tampilkan total, bayar, kembali'),
    T('labels.total', 'Label total'), T('labels.paid', 'Label bayar'), T('labels.change', 'Label kembali'),
  ] },
  { title: 'Kaki struk', fields: [
    B('footerVisible', 'Tampilkan kaki struk'),
    A('footerAlign', 'Perataan kaki struk'),
    L('footerLines', 'Isi kaki struk', TOKENS),
  ] },
  { title: 'Kertas & huruf', fields: [
    N('widthMm', 'Lebar cetak (mm)'),
    N('fontPx', 'Ukuran huruf (px)'),
  ] },
]

const INVOICE_SECTIONS: Section[] = [
  { title: 'Kepala nota', fields: [
    B('titleVisible', 'Tampilkan judul'), T('title', 'Judul (kanan atas)'), A('titleAlign', 'Perataan judul'),
    B('companyVisible', 'Tampilkan nama perusahaan'), T('companyName', 'Nama perusahaan'), A('companyAlign', 'Perataan nama perusahaan'),
    B('headerVisible', 'Tampilkan alamat / kontak'),
    A('headerAlign', 'Perataan alamat / kontak'),
    L('headerLines', 'Alamat / kontak (1 baris = 1 baris cetak)', TOKENS),
  ] },
  { title: 'Nomor, tanggal, tujuan', fields: [
    B('showNo', 'Tampilkan nomor'), T('labels.no', 'Label nomor'),
    B('showDate', 'Tampilkan tanggal'), T('labels.date', 'Label tanggal'),
    B('showTo', 'Tampilkan tujuan'), T('labels.to', 'Label "Kepada"'),
    A('metaAlign', 'Perataan blok nomor/tanggal/tujuan'),
    T('defaultCust', 'Teks "Kepada" bila tanpa member'),
  ] },
  { title: 'Keterangan di atas tabel', fields: [
    B('infoVisible', 'Tampilkan baris keterangan'),
    A('infoAlign', 'Perataan keterangan'),
    T('infoLine', 'Isi baris keterangan'),
  ] },
  { title: 'Tabel barang', fields: [
    T('cols.code', 'Judul kolom: kode'), A('colAlign.code', 'Perataan kolom kode'),
    T('cols.name', 'Judul kolom: barang'), A('colAlign.name', 'Perataan kolom barang'),
    T('cols.price', 'Judul kolom: harga'), A('colAlign.price', 'Perataan kolom harga'),
    T('cols.qty', 'Judul kolom: qty'), A('colAlign.qty', 'Perataan kolom qty'),
    T('cols.disc', 'Judul kolom: diskon'), A('colAlign.disc', 'Perataan kolom diskon'),
    T('cols.ppn', 'Judul kolom: PPn'), A('colAlign.ppn', 'Perataan kolom PPn'),
    T('cols.sub', 'Judul kolom: sub total'), A('colAlign.sub', 'Perataan kolom sub total'),
    B('colVisible.code', 'Tampilkan kolom kode'),
    B('colVisible.name', 'Tampilkan kolom barang'),
    B('colVisible.price', 'Tampilkan kolom harga'),
    B('colVisible.qty', 'Tampilkan kolom qty'),
    B('colVisible.disc', 'Tampilkan kolom diskon'),
    B('colVisible.ppn', 'Tampilkan kolom PPn'),
    B('colVisible.sub', 'Tampilkan kolom sub total'),
    B('tableBorder', 'Tampilkan garis tabel'),
    B('showPpn', 'Hitung harga tampil tanpa PPn'),
    N('ppnPercent', 'PPn yang tertulis di kolom (%)'),
    N('ppnEffective', 'PPn efektif untuk hitung harga tampil (%)', 'Bawaan 11 (DPP nilai lain) agar cocok dengan nota lama.'),
  ] },
  { title: 'Pemisah (garis)', fields: [S('separator', 'Garis pemisah kaki')] },
  { title: 'Total', fields: [
    B('totalsVisible', 'Tampilkan total, pembayaran, kembalian'),
    A('totalsAlign', 'Perataan angka total'),
    T('totals.total', 'Label total'), T('totals.paid', 'Label pembayaran'), T('totals.change', 'Label kembalian'),
  ] },
  { title: 'Kaki nota', fields: [
    B('footerVisible', 'Tampilkan kaki nota'),
    A('footerAlign', 'Perataan kaki nota'),
    L('footerLines', 'Isi kaki nota', TOKENS),
  ] },
]

const getP = (o: unknown, p: string) => p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], o)
function setP<T>(o: T, p: string, v: unknown): T {
  const [h, ...rest] = p.split('.')
  const src = o as Record<string, unknown>
  return { ...src, [h]: rest.length ? setP(src[h], rest.join('.'), v) : v } as T
}

export default function FormatNotaPage() {
  const { profile, can, allBranches, activeBranchId } = useAuth()
  const qc = useQueryClient()
  const [kind, setKind] = useState<Kind>('receipt')
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })

  // Cabang yang diatur: kasir = cabangnya sendiri; superadmin/role lintas cabang = pilihan (termasuk "bawaan/Semua cabang").
  const ownBranch = profile?.branch_id ?? null
  const [sel, setSel] = useState<string>('__auto__')
  const chosen: string | null = allBranches
    ? (sel === '__auto__' ? activeBranchId ?? null : sel === '__global__' ? null : sel)
    : ownBranch
  const selectValue = sel === '__auto__' ? (activeBranchId ?? '__global__') : sel

  const savedR = useReceiptCfg(chosen), savedI = useInvoiceCfg(chosen)
  const [dR, setDR] = useState<ReceiptCfg>(savedR), [dI, setDI] = useState<InvoiceCfg>(savedI)
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)

  // isi draf sekali setelah format tersimpan terbaca; ganti cabang = muat ulang draf
  useEffect(() => { setLoaded(false) }, [chosen])
  useEffect(() => { if (!loaded) { setDR(savedR); setDI(savedI) } }, [savedR, savedI, loaded])

  const editable = can('format_nota', 'u') || profile?.role_name === 'superadmin'
  const sections = kind === 'receipt' ? RECEIPT_SECTIONS : INVOICE_SECTIONS
  const draft = kind === 'receipt' ? dR : dI
  const edit = (p: string, v: unknown) => { setLoaded(true); setMsg(null); kind === 'receipt' ? setDR((c) => setP(c, p, v)) : setDI((c) => setP(c, p, v)) }
  const branchLabel = chosen ? (branches.find((b) => b.id === chosen)?.name ?? profile?.branch_name ?? 'cabang ini') : 'Semua cabang (format bawaan)'

  async function save() {
    setBusy(true); setMsg(null)
    try {
      await saveTemplate(kind, draft, chosen)
      await qc.invalidateQueries({ queryKey: ['print-template'] })
      setMsg({ ok: true, t: `Format disimpan untuk ${branchLabel}. Berlaku pada cetak berikutnya.` })
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : 'Gagal menyimpan.' }) } finally { setBusy(false) }
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
        <div className="mx-auto mb-4 max-w-6xl">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">Format Nota</h1>
            <div className="flex gap-2">
              <button className={kind === 'receipt' ? 'btn-primary' : 'btn-ghost'} onClick={() => setKind('receipt')}>Struk 80mm (nota transaksi)</button>
              <button className={kind === 'invoice' ? 'btn-primary' : 'btn-ghost'} onClick={() => setKind('invoice')}>Nota A4 (laporan)</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text-muted">Format untuk:</span>
            {allBranches ? (
              <select aria-label="Cabang format nota" className="input !w-auto !py-1" value={selectValue}
                onChange={(e) => { setSel(e.target.value); setMsg(null) }}>
                <option value="__global__">Semua cabang (format bawaan)</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : <strong>{profile?.branch_name ?? 'cabang Anda'}</strong>}
            {!editable && <span className="text-warning">Hanya lihat — Anda tidak punya hak mengubah format.</span>}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {allBranches
              ? 'Format tiap cabang dipakai saat cabang itu mencetak. "Semua cabang" = cadangan untuk cabang yang belum punya format sendiri.'
              : 'Format ini khusus cabang Anda: ubah nama toko, alamat, dan nomor telepon sesuai toko Anda.'}
          </p>
        </div>
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,30rem)_1fr]">
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.title} className="space-y-3 rounded-2xl bg-bg-light p-4 shadow">
                <div className="font-medium">{section.title}</div>
                {section.fields.map((f) => {
                  const v = getP(draft, f.path)
                  return (
                    <label key={f.path} className="block text-sm">
                      {f.type === 'bool' ? (
                        <span className="flex items-center gap-2"><input type="checkbox" checked={!!v} disabled={!editable} onChange={(e) => edit(f.path, e.target.checked)} />{f.label}</span>
                      ) : (
                        <>
                          <span className="text-text-muted">{f.label}</span>
                          {f.type === 'lines' ? (
                            <textarea className="input mt-1 min-h-24" disabled={!editable} value={(v as string[]).join('\n')} onChange={(e) => edit(f.path, e.target.value.split('\n').slice(0, 20).map((s) => s.slice(0, 120)))} />
                          ) : f.type === 'num' ? (
                            <input className="input mt-1" inputMode="numeric" disabled={!editable} value={String(v)} onChange={(e) => edit(f.path, Math.min(Number(e.target.value.replace(/\D/g, '')) || 0, 400))} />
                          ) : f.type === 'align' ? (
                            <select className="input mt-1" disabled={!editable} value={String(v)} onChange={(e) => edit(f.path, e.target.value)}>
                              <option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option>
                            </select>
                          ) : f.type === 'sep' ? (
                            <select className="input mt-1" disabled={!editable} value={String(v)} onChange={(e) => edit(f.path, e.target.value)}>
                              <option value="dashed">Garis putus-putus</option><option value="solid">Garis penuh</option><option value="none">Tanpa garis</option>
                            </select>
                          ) : (
                            <input className="input mt-1" disabled={!editable} value={String(v)} maxLength={120} onChange={(e) => edit(f.path, e.target.value)} />
                          )}
                        </>
                      )}
                      {f.hint && <span className="mt-0.5 block text-xs text-text-muted">{f.hint}</span>}
                    </label>
                  )
                })}
              </div>
            ))}
            <div className="space-y-2 rounded-2xl bg-bg-light p-4 shadow">
              {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.t}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy || !editable} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan format'}</button>
                <button className="btn-ghost" onClick={print}>Cetak contoh</button>
                <button className="btn-ghost" disabled={!editable} onClick={() => { setLoaded(true); kind === 'receipt' ? setDR(DEFAULT_RECEIPT) : setDI(DEFAULT_INVOICE); setMsg({ ok: true, t: 'Dikembalikan ke bawaan (nota lama TAKOM). Klik Simpan untuk menetapkan.' }) }}>Kembalikan bawaan</button>
              </div>
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
