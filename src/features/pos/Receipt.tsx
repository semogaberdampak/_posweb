import { rupiah } from '../../shared/format'
import type { CartLine, Method, SaleResult } from './types'

const LABEL: Record<Method, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', credit_card: 'Kartu Kredit' }

/** Tampil hanya saat cetak (80mm). */
export function Receipt({ sale, lines, method, cash }: { sale: SaleResult; lines: CartLine[]; method: Method; cash: number }) {
  return (
    <div className="hidden print:block text-black" style={{ width: '72mm', fontFamily: 'monospace', fontSize: '12px' }}>
      <div style={{ textAlign: 'center', fontWeight: 700 }}>STRUK PENJUALAN</div>
      <div>{sale.invoice_no}</div>
      <div>{new Date().toLocaleString('id-ID')}</div>
      <hr />
      {lines.map((l) => (
        <div key={l.id}>
          <div>{l.name}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{l.qty} x {rupiah(l.price)}</span><span>{rupiah(l.qty * l.price)}</span>
          </div>
          {l.disc > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Diskon {l.disc}%</span><span>-{rupiah(Math.round((l.qty * l.price * l.disc) / 100))}</span>
            </div>
          )}
        </div>
      ))}
      <hr />
      <Row k="Subtotal" v={rupiah(sale.subtotal)} />
      {sale.discount > 0 && <Row k="Total diskon" v={'-' + rupiah(sale.discount)} />}
      <Row k="TOTAL" v={rupiah(sale.total)} bold />
      <Row k="Bayar" v={LABEL[method]} />
      {method === 'cash' && <><Row k="Diterima" v={rupiah(cash)} /><Row k="Kembali" v={rupiah(sale.change)} /></>}
      <div style={{ textAlign: 'center', marginTop: 8 }}>Terima kasih</div>
    </div>
  )
}

const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}><span>{k}</span><span>{v}</span></div>
)
