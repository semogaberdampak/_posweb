/** Satu baris member hasil pembacaan CSV. Nama kolom mengikuti kunci yang dipakai RPC `import_members`. */
export type MemberRow = {
  member_no: string
  name: string
  is_active: boolean
  lembaga?: string
  alamat?: string
  kota?: string
  propinsi?: string
  telp?: string
  sellular?: string
  segment?: string
  segment_detail?: string
  saldo?: string
}
export type MemberCsvResult = { rows: MemberRow[]; problems: string[]; duplicates: string[]; inactive: number; repaired: number }

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

// judul kolom yang diterima (huruf kecil). Kolom wajib: nomor + nama; sisanya opsional.
const HEADS: Record<string, string[]> = {
  no: ['nomor', 'no', 'nomor member', 'no member', 'nomor id', 'id member', 'member no', 'member_no', 'kode', 'cust id', 'custid', 'customer id', 'id'],
  name: ['nama', 'nama member', 'name'],
  active: ['status', 'aktif', 'active', 'is_active'],
  lembaga: ['lembaga', 'institusi', 'institution'],
  alamat: ['alamat', 'address'],
  kota: ['kota', 'city'],
  propinsi: ['propinsi', 'provinsi', 'province'],
  telp: ['telp.', 'telp', 'telepon', 'telpon', 'phone'],
  sellular: ['sellular', 'seluler', 'hp', 'handphone', 'mobile', 'ponsel'],
  segment: ['segment', 'segmen'],
  segment_detail: ['segment detail', 'segmen detail', 'segment_detail'],
  saldo: ['balance', 'saldo'],
}
const SCI = /^\d+([.,]\d+)?e[+-]?\d+$/i // angka panjang yang dirusak Excel menjadi notasi ilmiah
const ACTIVE_YES = ['y', 'ya', 'yes', '1', 'true', 'aktif', 'a']
const ACTIVE_NO = ['n', 'tidak', 'no', '0', 'false', 'nonaktif', 'non-aktif']
const NUM = /^-?\d{1,3}(\.\d{3})+([,.]\d{1,2})?$|^-?\d{1,12}([.,]\d{1,2})?$/

/**
 * Membaca file member. Format pemilik (ekspor lama):
 *   Cust ID,Nama,Lembaga,Alamat,Kota,Propinsi,Telp.,Sellular,Segment,Segment Detail,Balance
 * Format ringkas `nomor,nama[,status]` juga diterima. Pemisah koma / titik koma / tab dideteksi otomatis
 * (Excel Indonesia biasanya menyimpan CSV dengan titik koma). Nomor member TIDAK diubah menjadi angka.
 */
export function parseMemberCsv(raw: string): MemberCsvResult {
  const res: MemberCsvResult = { rows: [], problems: [], duplicates: [], inactive: 0, repaired: 0 }
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
  if (idx.no < 0 || idx.name < 0) {
    res.problems.push('Baris pertama harus berisi judul kolom nomor ("Cust ID" / "nomor") dan nama ("Nama").')
    return res
  }
  if (table.length - 1 > 50000) { res.problems.push('Maksimal 50.000 baris per file.'); return res }

  const val = (r: string[], key: string) => (idx[key] >= 0 ? (r[idx[key]] ?? '').trim() : '')
  const has = (key: string) => idx[key] >= 0

  const seen = new Set<string>(), dup = new Set<string>()
  table.slice(1).forEach((rawRow, k) => {
    const line = k + 2
    let r = rawRow
    // Beberapa baris ekspor lama punya satu sel kosong berlebih di kolom Kota sehingga kolom setelahnya bergeser
    // (Segment berisi nomor HP, Segment Detail berisi "Personal", Balance berisi "Personal"/kosong).
    // Kenali dari gejalanya, lalu buang sel kosong itu — bukan menebak isi kolom.
    if (has('saldo') && has('kota') && has('segment')) {
      const bal = val(r, 'saldo'), seg = val(r, 'segment').replace(/[^\d]/g, '')
      if (bal && !NUM.test(bal) && val(r, 'kota') === '' && seg.length >= 6 && /^[\d\s+-]+$/.test(val(r, 'segment'))) {
        r = [...r]; r.splice(idx.kota, 1)
        res.repaired++
      }
    }
    const no = (r[idx.no] ?? '').trim().toUpperCase()
    const name = (r[idx.name] ?? '').trim()
    if (!no) { res.problems.push(`Baris ${line}: nomor member kosong.`); return }
    if (SCI.test(no)) { res.problems.push(`Baris ${line}: nomor "${no}" rusak (format ilmiah Excel). Format kolom nomor sebagai Teks.`); return }
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(no)) { res.problems.push(`Baris ${line} (${no}): nomor member tidak valid (1–40 huruf/angka, boleh titik, strip, garis miring).`); return }
    if (!name) { res.problems.push(`Baris ${line} (${no}): nama member kosong.`); return }
    if (name.length > 100) { res.problems.push(`Baris ${line} (${no}): nama lebih dari 100 huruf.`); return }
    if (has('alamat') && val(r, 'alamat').length > 300) { res.problems.push(`Baris ${line} (${no}): alamat lebih dari 300 huruf.`); return }
    const long = (['lembaga', 'kota', 'propinsi', 'telp', 'sellular', 'segment', 'segment_detail'] as const)
      .find((key) => val(r, key).length > 100)
    if (long) { res.problems.push(`Baris ${line} (${no}): kolom ${long} lebih dari 100 huruf.`); return }
    if (has('saldo') && val(r, 'saldo') && !NUM.test(val(r, 'saldo'))) {
      res.problems.push(`Baris ${line} (${no}): saldo "${val(r, 'saldo')}" bukan angka.`)
      return
    }
    if (seen.has(no)) { dup.add(no); return }
    seen.add(no)

    let active = true
    const rawAct = val(r, 'active').toLowerCase()
    if (rawAct) {
      if (ACTIVE_YES.includes(rawAct)) active = true
      else if (ACTIVE_NO.includes(rawAct)) active = false
      else { res.problems.push(`Baris ${line} (${no}): kolom status "${rawAct}" tidak dikenal (pakai Y/N).`); return }
    }
    if (!active) res.inactive++

    const row: MemberRow = { member_no: no, name, is_active: active }
    for (const key of ['lembaga', 'alamat', 'kota', 'propinsi', 'telp', 'sellular', 'segment', 'segment_detail', 'saldo'] as const) {
      if (has(key)) row[key] = val(r, key)
    }
    res.rows.push(row)
  })
  res.duplicates = [...dup]
  if (dup.size) res.problems.push(`${dup.size} nomor member muncul lebih dari satu kali: ${[...dup].slice(0, 5).join(', ')}${dup.size > 5 ? ', …' : ''}`)
  return res
}
