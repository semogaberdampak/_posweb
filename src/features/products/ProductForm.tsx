import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { saveProduct, type ProductRow } from './api'

export function ProductForm({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const edit = !!product
  const [code, setCode] = useState(product?.code ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [author, setAuthor] = useState(product?.author ?? '')
  const [active, setActive] = useState(product?.is_active ?? true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(price)
    if (!edit && !code.trim()) return setErr('Kode produk wajib diisi.')
    if (!name.trim()) return setErr('Nama produk wajib diisi.')
    if (!Number.isInteger(n) || n < 0) return setErr('Harga harus angka bulat.')
    if (active && n <= 0) return setErr('Produk aktif harus berharga lebih dari 0.')
    setBusy(true); setErr('')
    try {
      await saveProduct({ id: product?.id, code, name, price: n, author, is_active: active })
      await qc.invalidateQueries({ queryKey: ['admin-products'] })
      await qc.invalidateQueries({ queryKey: ['products'] })
      onClose()
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Gagal menyimpan.')
    } finally { setBusy(false) }
  }

  return (
    <Modal title={edit ? 'Ubah produk' : 'Tambah produk'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">Kode produk
          <input className="input mt-1 disabled:opacity-60" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} disabled={edit} autoFocus={!edit} />
        </label>
        <label className="block text-sm">Nama produk
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus={edit} />
        </label>
        <label className="block text-sm">Harga (Rp)
          <input className="input mt-1" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="block text-sm">Pengarang
          <input className="input mt-1" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (bisa dijual di kasir)
        </label>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Modal>
  )
}
