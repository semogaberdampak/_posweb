export type Product = { id: string; code: string; name: string; price: number }
export type CartLine = Product & { qty: number; disc: number } // disc = persen diskon baris ini
export type Method = 'cash' | 'qris' | 'debit' | 'credit_card'
export type SaleResult = {
  sale_id: string; invoice_no: string; subtotal: number
  discount: number; total: number; change: number
}
