import type { ExportData } from './api'

const METHOD: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }
const NUM = '#,##0'

/** Tanggal & jam menurut WIB sebagai teks (agar tidak bergeser zona waktu di Excel). */
export function wib(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` }
}
/** tag = periode untuk nama berkas, mis. 2026-11 atau 2026-11-01_sd_2026-11-07 (lihat shared/period.tagOf) */
export const exportFileName = (tag: string, branchLabel: string) =>
  `rekap-penjualan_${tag}_${branchLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cabang'}.xlsx`

/** Excel: sheet Ringkasan, Transaksi (1 baris/transaksi), Rincian Barang (1 baris/item). Semua teks disimpan sebagai TEKS (bukan rumus). */
export async function buildRecapWorkbook(data: ExportData, meta: { periodLabel: string; branchLabel: string; generatedBy: string }): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = meta.generatedBy; wb.created = new Date()
  const head = (ws: import('exceljs').Worksheet, widths: number[]) => {
    ws.columns.forEach((c, i) => { c.width = widths[i] })
    const r = ws.getRow(1); r.font = { bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
  }
  const done = data.sales.filter((s) => s.status === 'completed')

  // ---- Ringkasan ----
  const sm = wb.addWorksheet('Ringkasan')
  sm.columns = [{ width: 34 }, { width: 18 }, { width: 18 }]
  sm.addRow([`Rekap Penjualan ${meta.periodLabel}`]).font = { bold: true, size: 14 }
  sm.addRow([`Cabang: ${meta.branchLabel} · waktu WIB`]); sm.addRow([])
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const table = (title: string, cols: string[], rows: (string | number)[][]) => {
    sm.addRow([title]).font = { bold: true }
    const h = sm.addRow(cols); h.font = { bold: true }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    rows.forEach((r) => { const x = sm.addRow(r); x.eachCell((c, i) => { if (typeof c.value === 'number' && i > 1) c.numFmt = NUM }) })
    sm.addRow([])
  }
  table('Total', ['Keterangan', 'Jumlah', 'Nilai (Rp)'], [
    ['Transaksi selesai', done.length, sum(done.map((s) => s.total))], ['Total diskon', '', sum(done.map((s) => s.discount_amount))],
    ['Dibatalkan (void)', data.sales.length - done.length, sum(data.sales.filter((s) => s.status === 'void').map((s) => s.total))],
  ])
  const group = (key: (s: (typeof done)[number]) => string) => {
    const m = new Map<string, { n: number; t: number }>()
    done.forEach((s) => { const k = key(s), v = m.get(k) ?? { n: 0, t: 0 }; v.n++; v.t += s.total; m.set(k, v) })
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, v.n, v.t])
  }
  table('Per metode bayar', ['Metode', 'Transaksi', 'Nilai (Rp)'], group((s) => METHOD[s.payment_method] ?? s.payment_method))
  if (new Set(data.sales.map((s) => s.branch_name)).size > 1) table('Per cabang', ['Cabang', 'Transaksi', 'Nilai (Rp)'], group((s) => s.branch_name))
  table('Per hari', ['Tanggal', 'Transaksi', 'Nilai (Rp)'], group((s) => wib(s.created_at).date))

  // ---- Transaksi ----
  const tx = wb.addWorksheet('Transaksi')
  tx.addRow(['No. Nota', 'Tanggal', 'Jam', 'Cabang', 'Kasir', 'Metode', 'Member', 'Status', 'Subtotal', 'Diskon', 'Total', 'Diterima', 'Kembalian', 'Alasan void'])
  data.sales.forEach((s) => {
    const w = wib(s.created_at)
    tx.addRow([s.invoice_no, w.date, w.time, s.branch_name, s.cashier_name, METHOD[s.payment_method] ?? s.payment_method, s.member_label ?? '', s.status === 'void' ? 'Void' : 'Selesai',
      s.subtotal, s.discount_amount, s.total, s.cash_received ?? '', s.change_amount ?? '', s.void_reason ?? ''])
  })
  head(tx, [18, 12, 10, 20, 22, 14, 18, 10, 14, 12, 14, 14, 12, 28])
  ;[9, 10, 11, 12, 13].forEach((c) => { tx.getColumn(c).numFmt = NUM })

  // ---- Rincian Barang ----
  const sales = new Map(data.sales.map((s) => [s.id, s]))
  const it = wb.addWorksheet('Rincian Barang')
  it.addRow(['No. Nota', 'Tanggal', 'Cabang', 'Status', 'Kode', 'Barang', 'Harga', 'Qty', 'Diskon %', 'Diskon (Rp)', 'Sub total'])
  data.items.forEach((i) => {
    const s = sales.get(i.sale_id)
    it.addRow([i.invoice_no, wib(i.created_at).date, s?.branch_name ?? '', s?.status === 'void' ? 'Void' : 'Selesai', i.code, i.name, i.unit_price, i.qty, i.discount_pct, i.discount_amount, i.line_total])
  })
  head(it, [18, 12, 20, 10, 16, 40, 12, 7, 10, 12, 14])
  ;[7, 10, 11].forEach((c) => { it.getColumn(c).numFmt = NUM })
  it.getColumn(5).numFmt = '@'

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
