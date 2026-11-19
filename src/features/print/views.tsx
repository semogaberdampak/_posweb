import type { CSSProperties } from 'react'
import { fill, lineDisc, num, tokens, type Align, type InvoiceCfg, type PrintData, type ReceiptCfg, type SepStyle } from './templates'

const ink: CSSProperties = { color: '#000', background: '#fff' }
const al = (a: Align): CSSProperties => ({ textAlign: a })
const flexStart = (a: Align) => (a === 'center' ? 'center' : a === 'right' ? 'flex-end' : 'flex-start')
const line = (style: SepStyle, margin = '4px 0') => style === 'none' ? null : <div style={{ borderTop: `1px ${style} #000`, margin }} />

/** Struk 80mm (meniru struk lama). Murni tampilan: dipakai untuk cetak dan pratinjau editor. */
export function ReceiptView({ cfg, data }: { cfg: ReceiptCfg; data: PrintData }) {
  const t = tokens(data, cfg.defaultCust)
  const L = cfg.labels
  const dash = line(cfg.separator)
  const Info = ({ k, v }: { k: string; v: string }) =>
    <div style={{ display: 'flex' }}><span style={{ width: `${cfg.metaLabelWidthEm}em` }}>{k}</span><span>: {v}</span></div>
  const meta: { k: string; v: string }[] = []
  if (cfg.showNo) meta.push({ k: L.no, v: data.invoiceNo })
  if (cfg.showDate) meta.push({ k: L.date, v: data.at.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) })
  if (cfg.showCashier) meta.push({ k: L.cashier, v: data.cashier })
  if (cfg.showCust) meta.push({ k: L.cust, v: t.pelanggan })
  return (
    <div style={{ ...ink, width: `${cfg.widthMm}mm`, padding: '4mm', fontFamily: 'monospace', fontSize: cfg.fontPx }}>
      {cfg.headerVisible && (
        <div style={al(cfg.headerAlign)}>{cfg.headerLines.map((h, i) =>
          <div key={i} style={i === 0 && cfg.headerBoldFirst ? { fontWeight: 700 } : undefined}>{fill(h, t)}</div>)}</div>
      )}
      {cfg.metaVisible && meta.length > 0 && (
        <>
          {dash}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: flexStart(cfg.metaAlign) }}>
            {meta.map((m, i) => <Info key={i} k={m.k} v={m.v} />)}
          </div>
        </>
      )}
      {dash}
      {data.lines.map((l, i) => {
        const cells: { k: string; v: string }[] = []
        if (cfg.itemShowQty) cells.push({ k: 'qty', v: String(l.qty) })
        if (cfg.itemShowPrice) cells.push({ k: 'price', v: num(l.price) })
        if (cfg.itemShowDisc) cells.push({ k: 'disc', v: `${l.disc}%` })
        if (cfg.itemShowSub) cells.push({ k: 'sub', v: num(l.price * l.qty - lineDisc(l)) })
        return (
          <div key={i} style={{ marginBottom: 3 }}>
            {cfg.itemShowCode && <div style={al(cfg.itemCodeAlign)}>{l.code}</div>}
            {cfg.itemShowName && <div style={al(cfg.itemNameAlign)}>{l.name}</div>}
            {cells.length > 0 && (
              <div style={{ ...al(cfg.itemNumbersAlign), display: 'grid', gridTemplateColumns: cells.map((c) => c.k === 'qty' ? '2.5em' : '1fr').join(' ') }}>
                {cells.map((c) => <span key={c.k}>{c.v}</span>)}
              </div>
            )}
          </div>
        )
      })}
      {cfg.totalsVisible && (
        <>
          {dash}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L.total}</span><span>: {num(data.total)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L.paid}</span><span>: {num(data.paid)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L.change}</span><span>: {num(data.change)}</span></div>
        </>
      )}
      {cfg.showMethod && <div style={al(cfg.methodAlign)}>{cfg.methodLabels[data.method]}</div>}
      {cfg.footerVisible && cfg.footerLines.length > 0 && (
        <>
          {dash}
          <div style={al(cfg.footerAlign)}>{cfg.footerLines.map((f, i) => <div key={i}>{fill(f, t)}</div>)}</div>
        </>
      )}
    </div>
  )
}

/** Nota A4 (meniru nota lama): kop, tabel barang, total. */
export function InvoiceView({ cfg, data }: { cfg: InvoiceCfg; data: PrintData }) {
  const t = tokens(data, cfg.defaultCust)
  const C = cfg.cols
  const eff = 1 + cfg.ppnEffective / 100
  const V = cfg.colVisible
  const A = cfg.colAlign
  const pd = (a: Align): CSSProperties => ({ padding: '3px 6px', textAlign: a })
  const th = (a: Align): CSSProperties => ({ fontStyle: 'italic', fontWeight: 400, padding: '3px 6px', textAlign: a })
  const dash = line(cfg.separator, '6px 0')
  const cols: { k: string; label: string; align: Align }[] = []
  if (V.code) cols.push({ k: 'code', label: C.code, align: A.code })
  if (V.name) cols.push({ k: 'name', label: C.name, align: A.name })
  if (V.price) cols.push({ k: 'price', label: C.price, align: A.price })
  if (V.qty) cols.push({ k: 'qty', label: C.qty, align: A.qty })
  if (V.disc) cols.push({ k: 'disc', label: C.disc, align: A.disc })
  if (cfg.showPpn && V.ppn) cols.push({ k: 'ppn', label: C.ppn, align: A.ppn })
  if (V.sub) cols.push({ k: 'sub', label: C.sub, align: A.sub })
  const cellVal = (k: string, l: PrintData['lines'][number]) => {
    switch (k) {
      case 'code': return l.code
      case 'name': return l.name
      case 'price': return num(cfg.showPpn ? l.price / eff : l.price)
      case 'qty': return String(l.qty)
      case 'disc': return String(l.disc)
      case 'ppn': return String(cfg.ppnPercent)
      case 'sub': return num(l.price * l.qty - lineDisc(l))
      default: return ''
    }
  }
  const meta: { k: string; v: string }[] = []
  if (cfg.showNo) meta.push({ k: cfg.labels.no, v: data.invoiceNo })
  if (cfg.showDate) meta.push({ k: cfg.labels.date, v: t.tanggal })
  if (cfg.showTo) meta.push({ k: cfg.labels.to, v: t.pelanggan })
  const borderTop = cfg.tableBorder ? '1px solid #000' : undefined
  return (
    <div style={{ ...ink, width: '100%', maxWidth: '186mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ ...al(cfg.companyAlign), flex: 1 }}>
          {cfg.companyVisible && <div style={{ fontWeight: 700, fontSize: 16 }}>{fill(cfg.companyName, t)}</div>}
          {cfg.headerVisible && cfg.headerLines.map((h, i) => <div key={i} style={al(cfg.headerAlign)}>{fill(h, t)}</div>)}
        </div>
        <div style={{ minWidth: '45%' }}>
          {cfg.titleVisible && <div style={{ ...al(cfg.titleAlign), fontWeight: 700, fontSize: 16 }}>{cfg.title}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: flexStart(cfg.metaAlign) }}>
            {meta.map((m, i) => (
              <div key={i} style={{ display: 'flex' }}><span style={{ width: '5.5em' }}>{m.k}</span><span>: {m.v}</span></div>
            ))}
          </div>
        </div>
      </div>
      {cfg.infoVisible && <div style={{ ...al(cfg.infoAlign), fontSize: 10.5, marginTop: 6 }}>{fill(cfg.infoLine, t)}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop, borderBottom: borderTop }}>
        <thead><tr style={{ borderBottom: borderTop }}>
          {cols.map((c) => <th key={c.k} style={th(c.align)}>{c.label}</th>)}
        </tr></thead>
        <tbody>{data.lines.map((l, i) => (
          <tr key={i} style={{ borderBottom: cfg.tableBorder ? '1px solid #000' : undefined }}>
            {cols.map((c) => <td key={c.k} style={pd(c.align)}>{cellVal(c.k, l)}</td>)}
          </tr>
        ))}</tbody>
      </table>
      {cfg.totalsVisible && (
        <div style={{ width: '45%', marginLeft: 'auto', marginTop: 8 }}>
          <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>{cfg.totals.total}</span><span style={al(cfg.totalsAlign)}>{num(data.total)}</span></div>
          <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>{cfg.totals.paid}</span><span style={al(cfg.totalsAlign)}>{num(data.paid)}</span></div>
          <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>{cfg.totals.change}</span><span style={al(cfg.totalsAlign)}>{num(data.change)}</span></div>
        </div>
      )}
      {cfg.footerVisible && cfg.footerLines.length > 0 && (
        <>
          <div style={{ marginTop: 14 }}>{dash}</div>
          <div style={al(cfg.footerAlign)}>{cfg.footerLines.map((f, i) => <div key={i}>{fill(f, t)}</div>)}</div>
        </>
      )}
    </div>
  )
}

/** Hanya tampil saat cetak. Mengatur ukuran kertas (@page) sesuai jenis. */
export function PrintSheet({ kind, data, receipt, invoice }: { kind: 'receipt' | 'invoice'; data: PrintData; receipt: ReceiptCfg; invoice: InvoiceCfg }) {
  return (
    <>
      <style>{kind === 'invoice' ? '@page{size:A4;margin:12mm}' : `@page{size:${receipt.widthMm + 8}mm auto;margin:0}`}</style>
      <div className="hidden print:block">{kind === 'receipt' ? <ReceiptView cfg={receipt} data={data} /> : <InvoiceView cfg={invoice} data={data} />}</div>
    </>
  )
}
