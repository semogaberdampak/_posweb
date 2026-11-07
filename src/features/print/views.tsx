import type { CSSProperties } from 'react'
import { fill, lineDisc, num, tokens, type InvoiceCfg, type PrintData, type ReceiptCfg } from './templates'

const ink: CSSProperties = { color: '#000', background: '#fff' }
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between' }

/** Struk 80mm (meniru struk lama). Murni tampilan: dipakai untuk cetak dan pratinjau editor. */
export function ReceiptView({ cfg, data }: { cfg: ReceiptCfg; data: PrintData }) {
  const t = tokens(data, cfg.defaultCust)
  const L = cfg.labels
  const Info = ({ k, v }: { k: string; v: string }) => <div style={{ display: 'flex' }}><span style={{ width: '4.5em' }}>{k}</span><span>: {v}</span></div>
  const dash = <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
  return (
    <div style={{ ...ink, width: `${cfg.widthMm}mm`, padding: '4mm', fontFamily: 'monospace', fontSize: cfg.fontPx }}>
      <div style={{ textAlign: 'center' }}>{cfg.headerLines.map((h, i) => <div key={i} style={i === 0 ? { fontWeight: 700 } : undefined}>{fill(h, t)}</div>)}</div>
      {dash}
      <Info k={L.no} v={data.invoiceNo} />
      <Info k={L.date} v={data.at.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })} />
      {cfg.showCashier && <Info k={L.cashier} v={data.cashier} />}
      {cfg.showCust && <Info k={L.cust} v={t.pelanggan} />}
      {dash}
      {data.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div>{l.code}</div><div>{l.name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2.5em 1fr 3.5em 1fr', textAlign: 'right' }}>
            <span style={{ textAlign: 'left' }}>{l.qty}</span><span>{num(l.price)}</span><span>{l.disc}%</span><span>{num(l.price * l.qty - lineDisc(l))}</span>
          </div>
        </div>
      ))}
      {dash}
      <div style={row}><span>{L.total}</span><span>: {num(data.total)}</span></div>
      <div style={row}><span>{L.paid}</span><span>: {num(data.paid)}</span></div>
      <div style={row}><span>{L.change}</span><span>: {num(data.change)}</span></div>
      <div>{cfg.methodLabels[data.method]}</div>
      {dash}
      <div style={{ textAlign: 'center' }}>{cfg.footerLines.map((f, i) => <div key={i}>{fill(f, t)}</div>)}</div>
    </div>
  )
}

/** Nota A4 (meniru nota lama): kop, tabel barang, total. */
export function InvoiceView({ cfg, data }: { cfg: InvoiceCfg; data: PrintData }) {
  const t = tokens(data, cfg.defaultCust)
  const C = cfg.cols
  const eff = 1 + cfg.ppnEffective / 100
  const th: CSSProperties = { fontStyle: 'italic', fontWeight: 400, padding: '3px 6px' }
  const td: CSSProperties = { padding: '3px 6px' }
  const R: CSSProperties = { textAlign: 'right' }
  const dash = <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
  return (
    <div style={{ ...ink, width: '100%', maxWidth: '186mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{fill(cfg.companyName, t)}</div>
          {cfg.headerLines.map((h, i) => <div key={i}>{fill(h, t)}</div>)}
        </div>
        <div style={{ minWidth: '45%' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{cfg.title}</div>
          {([[cfg.labels.no, data.invoiceNo], [cfg.labels.date, t.tanggal], [cfg.labels.to, t.pelanggan]] as const).map(([k, v]) => (
            <div key={k} style={{ display: 'flex' }}><span style={{ width: '5.5em' }}>{k}</span><span>: {v}</span></div>
          ))}
        </div>
      </div>
      <div style={{ ...R, fontSize: 10.5, marginTop: 6 }}>{fill(cfg.infoLine, t)}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
        <thead><tr style={{ borderBottom: '1px solid #000' }}>
          <th style={{ ...th, textAlign: 'left' }}>{C.code}</th><th style={{ ...th, textAlign: 'center' }}>{C.name}</th>
          <th style={{ ...th, ...R }}>{C.price}</th><th style={{ ...th, ...R }}>{C.qty}</th><th style={{ ...th, ...R }}>{C.disc}</th>
          {cfg.showPpn && <th style={{ ...th, ...R }}>{C.ppn}</th>}<th style={{ ...th, ...R }}>{C.sub}</th>
        </tr></thead>
        <tbody>{data.lines.map((l, i) => (
          <tr key={i}>
            <td style={td}>{l.code}</td><td style={td}>{l.name}</td>
            <td style={{ ...td, ...R }}>{num(cfg.showPpn ? l.price / eff : l.price)}</td><td style={{ ...td, ...R }}>{l.qty}</td><td style={{ ...td, ...R }}>{l.disc}</td>
            {cfg.showPpn && <td style={{ ...td, ...R }}>{cfg.ppnPercent}</td>}<td style={{ ...td, ...R }}>{num(l.price * l.qty - lineDisc(l))}</td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ width: '45%', marginLeft: 'auto', marginTop: 8 }}>
        <div style={row}><span>{cfg.totals.total}</span><span>{num(data.total)}</span></div>
        <div style={row}><span>{cfg.totals.paid}</span><span>{num(data.paid)}</span></div>
        <div style={row}><span>{cfg.totals.change}</span><span>{num(data.change)}</span></div>
      </div>
      <div style={{ marginTop: 14 }}>{dash}</div>
      <div style={{ textAlign: 'center' }}>{cfg.footerLines.map((f, i) => <div key={i}>{fill(f, t)}</div>)}</div>
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
