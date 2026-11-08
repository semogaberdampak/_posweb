import { fill, lineDisc, num, tokens, type PrintData, type ReceiptCfg } from '../features/print/templates'

// Struk ESC/POS teks untuk printer thermal. Isi MENGIKUTI format yang diedit admin (ReceiptCfg): kepala, label, baris tampil/sembunyi, kaki.
const ESC = 0x1b, GS = 0x1d
/** 80mm = 48 kolom, 58mm = 32 kolom (font A). */
export const colsFor = (widthMm: number) => (widthMm >= 64 ? 48 : 32)

/** Printer thermal umumnya hanya aman untuk ASCII: aksen dibuang (é→e), karakter lain → "?". */
export function toPrinterText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?')
}
function wrap(s: string, w: number): string[] {
  const out: string[] = []
  for (const para of toPrinterText(s).split('\n')) {
    let cur = ''
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > w) { if (cur) { out.push(cur); cur = '' } out.push(word.slice(0, w)); word = word.slice(w) }
      if (!cur) cur = word; else if (cur.length + 1 + word.length <= w) cur += ' ' + word; else { out.push(cur); cur = word }
    }
    out.push(cur)
  }
  return out
}
const center = (s: string, w: number) => (s.length >= w ? s : ' '.repeat(Math.floor((w - s.length) / 2)) + s)
const lr = (l: string, r: string, w: number) => (l.length + r.length + 1 > w ? `${l.slice(0, Math.max(1, w - r.length - 1))} ${r}` : l + ' '.repeat(w - l.length - r.length) + r)

export function buildReceipt(data: PrintData, cfg: ReceiptCfg): Uint8Array {
  const W = colsFor(cfg.widthMm), t = tokens(data, cfg.defaultCust), L = cfg.labels
  const bytes: number[] = [ESC, 0x40]                                // reset
  const align = (n: 0 | 1 | 2) => bytes.push(ESC, 0x61, n)
  const bold = (on: boolean) => bytes.push(ESC, 0x45, on ? 1 : 0)
  const text = (s: string) => { for (const ch of s) bytes.push(ch.charCodeAt(0)); bytes.push(0x0a) }
  const dash = () => text('-'.repeat(W))
  // lebar kolom label mengikuti label terpanjang (maks. 12) agar label buatan admin tidak terpotong
  const lw = Math.min(12, Math.max(4, ...[L.no, L.date, cfg.showCashier ? L.cashier : '', cfg.showCust ? L.cust : ''].map((x) => toPrinterText(x).length)))
  const info = (k: string, v: string) => { const lines = wrap(v, W - lw - 3); text(`${toPrinterText(k).padEnd(lw).slice(0, lw)} : ${lines[0] ?? ''}`); lines.slice(1).forEach((x) => text(' '.repeat(lw + 3) + x)) }

  align(1)
  cfg.headerLines.forEach((h, i) => { bold(i === 0); wrap(fill(h, t), W).forEach((x) => text(center(x, W))) })
  bold(false); align(0); dash()
  info(L.no, data.invoiceNo)
  info(L.date, data.at.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }))
  if (cfg.showCashier) info(L.cashier, data.cashier)
  if (cfg.showCust) info(L.cust, t.pelanggan)
  dash()

  const wQty = 4, wDisc = 5, wSub = 12, wPrice = W - wQty - wDisc - wSub
  for (const l of data.lines) {
    wrap(l.code, W).forEach(text); wrap(l.name, W).forEach(text)
    text(String(l.qty).padEnd(wQty) + num(l.price).padStart(wPrice) + `${l.disc}%`.padStart(wDisc) + num(l.price * l.qty - lineDisc(l)).padStart(wSub))
  }
  dash()
  text(lr(toPrinterText(L.total), ': ' + num(data.total), W))
  text(lr(toPrinterText(L.paid), ': ' + num(data.paid), W))
  text(lr(toPrinterText(L.change), ': ' + num(data.change), W))
  text(toPrinterText(cfg.methodLabels[data.method]))
  dash(); align(1)
  cfg.footerLines.forEach((f) => wrap(fill(f, t), W).forEach((x) => text(center(x, W))))
  align(0); bytes.push(0x0a, 0x0a, 0x0a)                              // beri ruang sebelum dipotong
  bytes.push(GS, 0x56, 0x41, 0x03)                                    // potong (partial, feed)
  return Uint8Array.from(bytes)
}
