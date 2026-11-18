/**
 * Pembaca CSV produk untuk impor dari aplikasi (kolom: kode, nama, harga, pengarang, status).
 * Pemisah koma / titik koma / tab dideteksi otomatis (Excel Indonesia menyimpan CSV dengan titik koma).
 * Harga menerima format Indonesia: 45000 / 45.000 / 45.000,00 / Rp 45.000.
 */
export type ProductRowIn = { code: string; name: string; price?: number; author?: string; is_active?: boolean }
export type ProductCsvResult = { rows: ProductRowIn[]; problems: string[]; duplicates: string[]; inactive: number }

/** Pemecah CSV sederhana: tanda kutip, kutip ganda "", baris baru di dalam kutip, CRLF. */
function splitCsv(text: string, delim: string): string[][] {
  const out: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row) }
  return out
}

const HEADS: Record<string, string[]> = {
  code: ['kode', 'kode produk', 'kode barang', 'code', 'produk id', 'product id', 'id produk', 'sku'],
  name: ['nama', 'nama produk', 'nama barang', 'name', 'prod desc', 'deskripsi'],
  price: ['harga', 'harga jual', 'price', 'price2', 'harga (rp)'],
  author: ['pengarang', 'author', 'penulis'],
  active: ['status', 'aktif', 'active', 'is_active'],
}
const SCI = /^\d+([.,]\d+)?e[+-]?\d+$/i // angka yang dirusak Excel menjadi notasi ilmiah
const ACTIVE_YES = ['y', 'ya', 'yes', '1', 'true', 'aktif', 'a']
const ACTIVE_NO = ['n', 'tidak', 'no', '0', 'false', 'nonaktif', 'non-aktif']

/** Harga bulat rupiah; null = sel kosong, 'bad' = bukan angka yang masuk akal. */
export function parsePrice(raw: string): number | null | 'bad' {
  let v = raw.trim().replace(/^rp\.?\s*/i, '').replace(/[\s\u00a0]/g, '')
  if (!v) return null
  if (SCI.test(v)) return 'bad'
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')                          // 45.000
  else if (/^\d{1,3}(,\d{3})+$/.test(v)) v = v.replace(/,/g, '')                        // 45,000
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.') // 45.000,50
  else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(v)) v = v.replace(/,/g, '')               // 45,000.50
  else if (/^\d+,\d{1,2}$/.test(v)) v = v.replace(',', '.')                             // 45000,50
  else if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'bad'
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 'bad'
  return Math.round(n) // harga di aplikasi bilangan bulat rupiah
}

/**
 * Membaca file produk. Kolom wajib: kode + nama (judul kolom boleh "Kode"/"Kode Produk"/"produk id" dan
 * "Nama"/"Nama Produk"/"prod Desc"). Harga, pengarang, dan status opsional; baris tanpa harga tetap
 * dikirim apa adanya (server menolak produk BARU tanpa harga, tetapi baris itu bisa memperbarui nama).
 */
export function parseProductCsv(raw: string): ProductCsvResult {
  const res: ProductCsvResult = { rows: [], problems: [], duplicates: [], inactive: 0 }
  const text = raw.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const n = (c: string) => first.split(c).length - 1
  const delim = n(';') > n(',') ? ';' : n('\t') > Math.max(n(','), n(';')) ? '\t' : ','
  const table = splitCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''))
  if (table.length === 0) { res.problems.push('File kosong.'); return res }

  const head = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '))
  const idx: Record<string, number> = {}
  for (const [key, aliases] of Object.entries(HEADS)) {
    idx[key] = head.findIndex((h) => aliases.includes(h))
  }
  if (idx.code < 0) {
    res.problems.push('Baris pertama harus berisi judul kolom kode ("Kode" / "Kode Produk").')
    return res
  }
  if (idx.name < 0) {
    res.problems.push('Baris pertama harus berisi judul kolom nama ("Nama" / "Nama Produk").')
    return res
  }
  if (table.length - 1 > 50000) { res.problems.push('Maksimal 50.000 baris per file.'); return res }

  const val = (r: string[], key: string) => (idx[key] >= 0 ? (r[idx[key]] ?? '').trim() : '')
  const seen = new Set<string>(), dup = new Set<string>()

  table.slice(1).forEach((r, k) => {
    const line = k + 2
    const code = val(r, 'code')
    const name = val(r, 'name')
    if (!code) { res.problems.push(`Baris ${line}: kode produk kosong.`); return }
    if (code.length > 40) { res.problems.push(`Baris ${line} (${code}): kode lebih dari 40 huruf.`); return }
    if (!name) { res.problems.push(`Baris ${line} (${code}): nama produk kosong.`); return }
    if (name.length > 200) { res.problems.push(`Baris ${line} (${code}): nama lebih dari 200 huruf.`); return }
    const author = val(r, 'author')
    if (author.length > 200) { res.problems.push(`Baris ${line} (${code}): pengarang lebih dari 200 huruf.`); return }

    let price: number | undefined
    if (idx.price >= 0 && val(r, 'price') !== '') {
      const p = parsePrice(val(r, 'price'))
      if (p === 'bad' || p === null) {
        res.problems.push(`Baris ${line} (${code}): harga "${val(r, 'price')}" bukan angka (pakai 45000 atau 45.000).`)
        return
      }
      price = p
    }

    let active: boolean | undefined
    const rawAct = val(r, 'active').toLowerCase()
    if (rawAct) {
      if (ACTIVE_YES.includes(rawAct)) active = true
      else if (ACTIVE_NO.includes(rawAct)) active = false
      else { res.problems.push(`Baris ${line} (${code}): kolom status "${rawAct}" tidak dikenal (pakai Y/N).`); return }
    }
    if (active === false) res.inactive++

    const key = code.toUpperCase()
    if (seen.has(key)) { dup.add(code); return }
    seen.add(key)

    const row: ProductRowIn = { code, name }
    if (price !== undefined) row.price = price
    if (author) row.author = author
    if (active !== undefined) row.is_active = active
    res.rows.push(row)
  })

  res.duplicates = [...dup]
  if (dup.size) res.problems.push(`${dup.size} kode produk muncul lebih dari satu kali: ${[...dup].slice(0, 5).join(', ')}${dup.size > 5 ? ', …' : ''}`)
  return res
}
