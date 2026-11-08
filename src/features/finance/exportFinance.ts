import type { FinanceData } from './api'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const METHOD: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }
const NUM = '#,##0'

export const financeFileName = (year: number, month: number, branchLabel: string) =>
  `keuangan_${year}-${String(month).padStart(2, '0')}_${branchLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cabang'}.xlsx`

/** Excel Keuangan: sheet Ringkasan, Per Metode, Per Cabang, Per Hari. Angka sebagai angka, teks sebagai teks. */
export async function buildFinanceWorkbook(d: FinanceData, meta: { year: number; month: number; branchLabel: string; generatedBy: string }): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook(); wb.creator = meta.generatedBy; wb.created = new Date()
  const fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE5E7EB' } }
  const sheet = (name: string, cols: string[], rows: (string | number)[][], widths: number[], numCols: number[]) => {
    const ws = wb.addWorksheet(name); ws.addRow(cols); rows.forEach((r) => ws.addRow(r))
    ws.columns.forEach((c, i) => { c.width = widths[i] }); numCols.forEach((c) => { ws.getColumn(c).numFmt = NUM })
    const h = ws.getRow(1); h.font = { bold: true }; h.fill = fill; ws.views = [{ state: 'frozen', ySplit: 1 }]
    return ws
  }

  const sm = wb.addWorksheet('Ringkasan')
  sm.columns = [{ width: 44 }, { width: 20 }]
  sm.addRow([`Laporan Keuangan ${MONTHS[meta.month - 1]} ${meta.year}`]).font = { bold: true, size: 14 }
  sm.addRow([`Cabang: ${meta.branchLabel} · waktu WIB`]); sm.addRow([])
  const T = d.totals
  const line = (k: string, v: number | string) => { const r = sm.addRow([k, v]); if (typeof v === 'number') r.getCell(2).numFmt = NUM }
  line('Transaksi selesai', T.count); line('Penjualan kotor (sebelum diskon)', T.gross); line('Total diskon', T.discount); line('Penjualan bersih', T.net)
  line('Rata-rata per transaksi', T.count ? Math.round(T.net / T.count) : 0)
  line('Transaksi dibatalkan (void) — jumlah', T.void_count); line('Transaksi dibatalkan (void) — nilai', T.void_total)
  if (d.margin) {
    sm.addRow([]); sm.addRow(['Estimasi laba kotor (hanya produk dengan data harga beli yang masuk akal)']).font = { bold: true }
    const m = d.margin
    line('Penjualan produk bermodal', m.revenue_covered); line('Modal (harga beli × qty)', m.cost); line('Laba kotor (estimasi)', m.revenue_covered - m.cost)
    line('Margin (%)', m.revenue_covered ? Math.round(((m.revenue_covered - m.cost) / m.revenue_covered) * 1000) / 10 : 0)
    line('Cakupan data modal (% dari penjualan bersih)', m.revenue_all ? Math.round((m.revenue_covered / m.revenue_all) * 1000) / 10 : 0)
    line('Baris penjualan tanpa data modal', m.lines_no_cost)
  }
  const total = d.by_method.reduce((a, x) => a + x.net, 0)
  sheet('Per Metode', ['Metode', 'Transaksi', 'Nilai (Rp)', 'Porsi (%)'], d.by_method.map((x) => [METHOD[x.method] ?? x.method, x.count, x.net, total ? Math.round((x.net / total) * 1000) / 10 : 0]), [18, 12, 16, 10], [2, 3])
  sheet('Per Cabang', ['Cabang', 'Transaksi', 'Diskon (Rp)', 'Nilai (Rp)'], d.by_branch.map((x) => [x.branch, x.count, x.discount, x.net]), [24, 12, 16, 16], [2, 3, 4])
  sheet('Per Hari', ['Tanggal', 'Transaksi', 'Diskon (Rp)', 'Nilai (Rp)'], d.by_day.map((x) => [x.date, x.count, x.discount, x.net]), [14, 12, 16, 16], [2, 3, 4])
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
