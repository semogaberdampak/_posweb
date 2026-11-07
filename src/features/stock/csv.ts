export type StockRow = { code: string; qty: number }
export type CsvResult = { rows: StockRow[]; problems: string[]; duplicates: string[]; totalQty: number }

/** Pemecah CSV sederhana: mendukung tanda kutip, kutip ganda "", baris baru di dalam kutip, CRLF. */
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

const CODE_HEAD = ['kode', 'kode produk', 'produk id']
const QTY_HEAD = ['jumlah', 'stok', 'qty']
const SCI = /^\d+([.,]\d+)?e[+-]?\d+$/i // angka panjang yang dirusak Excel menjadi notasi ilmiah, mis. 1,00001E+09

/** Membaca file hasil hitung stok (kolom "kode" dan "jumlah"). Pemisah koma / titik koma / tab terdeteksi otomatis
 *  (Excel berbahasa Indonesia biasanya menyimpan CSV dengan titik koma). Kode TIDAK pernah diubah menjadi angka. */
export function parseStockCsv(raw: string): CsvResult {
  const res: CsvResult = { rows: [], problems: [], duplicates: [], totalQty: 0 }
  const text = raw.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const n = (c: string) => first.split(c).length - 1
  const delim = n(';') > n(',') ? ';' : n('\t') > Math.max(n(','), n(';')) ? '\t' : ','
  const table = splitCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''))
  if (table.length === 0) { res.problems.push('File kosong.'); return res }

  const head = table[0].map((h) => h.trim().toLowerCase())
  const iCode = head.findIndex((h) => CODE_HEAD.includes(h)), iQty = head.findIndex((h) => QTY_HEAD.includes(h))
  if (iCode < 0 || iQty < 0) { res.problems.push('Baris pertama harus berisi judul kolom "kode" dan "jumlah".'); return res }
  if (table.length - 1 > 40000) { res.problems.push('Maksimal 40.000 baris per file.'); return res }

  const seen = new Set<string>(), dup = new Set<string>()
  table.slice(1).forEach((r, k) => {
    const line = k + 2
    const code = (r[iCode] ?? '').trim(), q = (r[iQty] ?? '').trim()
    if (!code) { res.problems.push(`Baris ${line}: kode kosong.`); return }
    if (SCI.test(code)) { res.problems.push(`Baris ${line}: kode "${code}" rusak (format ilmiah Excel). Format kolom kode sebagai Teks.`); return }
    if (!/^\d{1,7}$/.test(q)) { res.problems.push(`Baris ${line} (${code}): jumlah "${q}" harus angka bulat 0 atau lebih.`); return }
    if (seen.has(code)) { dup.add(code); return }
    seen.add(code)
    res.rows.push({ code, qty: Number(q) })
    res.totalQty += Number(q)
  })
  res.duplicates = [...dup]
  if (dup.size) res.problems.push(`${dup.size} kode muncul lebih dari satu kali: ${[...dup].slice(0, 5).join(', ')}${dup.size > 5 ? ', …' : ''}`)
  return res
}
