export type MemberRow = { member_no: string; name: string; is_active: boolean }
export type MemberCsvResult = { rows: MemberRow[]; problems: string[]; duplicates: string[]; inactive: number }

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

const NO_HEAD = ['nomor', 'no', 'nomor member', 'no member', 'nomor id', 'id member', 'member no', 'member_no', 'kode']
const NAME_HEAD = ['nama', 'nama member', 'name', 'member']
const ACTIVE_HEAD = ['aktif', 'status', 'active', 'is_active']
const SCI = /^\d+([.,]\d+)?e[+-]?\d+$/i // angka panjang yang dirusak Excel menjadi notasi ilmiah
const ACTIVE_YES = ['y', 'ya', 'yes', '1', 'true', 'aktif', 'a']
const ACTIVE_NO = ['n', 'tidak', 'no', '0', 'false', 'nonaktif', 'non-aktif']

/** Membaca file member (kolom nomor + nama, opsional status aktif). Pemisah koma / titik koma / tab terdeteksi
 *  otomatis (Excel Indonesia biasanya menyimpan CSV dengan titik koma). Nomor member TIDAK diubah menjadi angka. */
export function parseMemberCsv(raw: string): MemberCsvResult {
  const res: MemberCsvResult = { rows: [], problems: [], duplicates: [], inactive: 0 }
  const text = raw.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const n = (c: string) => first.split(c).length - 1
  const delim = n(';') > n(',') ? ';' : n('\t') > Math.max(n(','), n(';')) ? '\t' : ','
  const table = splitCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''))
  if (table.length === 0) { res.problems.push('File kosong.'); return res }

  const head = table[0].map((h) => h.trim().toLowerCase())
  const iNo = head.findIndex((h) => NO_HEAD.includes(h))
  const iName = head.findIndex((h) => NAME_HEAD.includes(h))
  const iAct = head.findIndex((h) => ACTIVE_HEAD.includes(h))
  if (iNo < 0 || iName < 0) {
    res.problems.push('Baris pertama harus berisi judul kolom "nomor" dan "nama" (contoh: nomor,nama).')
    return res
  }
  if (table.length - 1 > 50000) { res.problems.push('Maksimal 50.000 baris per file.'); return res }

  const seen = new Set<string>(), dup = new Set<string>()
  table.slice(1).forEach((r, k) => {
    const line = k + 2
    const no = (r[iNo] ?? '').trim().toUpperCase()
    const name = (r[iName] ?? '').trim()
    if (!no) { res.problems.push(`Baris ${line}: nomor member kosong.`); return }
    if (SCI.test(no)) { res.problems.push(`Baris ${line}: nomor "${no}" rusak (format ilmiah Excel). Format kolom nomor sebagai Teks.`); return }
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(no)) { res.problems.push(`Baris ${line} (${no}): nomor member tidak valid (1–40 huruf/angka, boleh titik, strip, garis miring).`); return }
    if (!name) { res.problems.push(`Baris ${line} (${no}): nama member kosong.`); return }
    if (name.length > 100) { res.problems.push(`Baris ${line} (${no}): nama lebih dari 100 huruf.`); return }
    if (seen.has(no)) { dup.add(no); return }
    seen.add(no)
    let active = true
    const rawAct = iAct >= 0 ? (r[iAct] ?? '').trim().toLowerCase() : ''
    if (rawAct) {
      if (ACTIVE_YES.includes(rawAct)) active = true
      else if (ACTIVE_NO.includes(rawAct)) active = false
      else { res.problems.push(`Baris ${line} (${no}): kolom status "${rawAct}" tidak dikenal (pakai Y/N).`); return }
    }
    if (!active) res.inactive++
    res.rows.push({ member_no: no, name, is_active: active })
  })
  res.duplicates = [...dup]
  if (dup.size) res.problems.push(`${dup.size} nomor member muncul lebih dari satu kali: ${[...dup].slice(0, 5).join(', ')}${dup.size > 5 ? ', …' : ''}`)
  return res
}
