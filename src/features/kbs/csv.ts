/** Pembaca CSV member toko KBS: kolom `kode` + `nama` (judul kolom "Cust ID"/"Kode" dan "Nama" diterima). */
export type KbsCsvRow = { code: string; name: string; is_active: boolean }
export type KbsCsvResult = { rows: KbsCsvRow[]; problems: string[]; duplicates: string[]; inactive: number }

const CODE = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/
const ACTIVE_YES = ['y', 'ya', 'yes', '1', 'true', 'aktif', 'a']
const ACTIVE_NO = ['n', 'tidak', 'no', '0', 'false', 'nonaktif', 'non-aktif']
const CODE_HEADS = ['kode', 'kode toko', 'code', 'cust id', 'custid', 'customer id', 'nomor', 'no', 'id']
const NAME_HEADS = ['nama', 'nama toko', 'nama member', 'name']
const ACTIVE_HEADS = ['status', 'aktif', 'active']

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

export function parseKbsCsv(raw: string): KbsCsvResult {
  const res: KbsCsvResult = { rows: [], problems: [], duplicates: [], inactive: 0 }
  const text = raw.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const n = (c: string) => first.split(c).length - 1
  const delim = n(';') > n(',') ? ';' : n('\t') > Math.max(n(','), n(';')) ? '\t' : ','
  const table = splitCsv(text, delim).filter((r) => r.some((c) => c.trim() !== ''))
  if (table.length === 0) { res.problems.push('File kosong.'); return res }

  // Baris pertama = judul kolom bila memuat nama kolom yang dikenal; kalau tidak, dianggap data.
  const head = table[0].map((h) => h.trim().toLowerCase())
  const codeI = head.findIndex((h) => CODE_HEADS.includes(h))
  const nameI = head.findIndex((h) => NAME_HEADS.includes(h))
  const activeI = head.findIndex((h) => ACTIVE_HEADS.includes(h))
  const hasHeader = codeI >= 0 && nameI >= 0
  if (!hasHeader && table[0].length < 2) {
    res.problems.push('Format harus dua kolom: kode lalu nama (judul kolom "Cust ID,nama" juga boleh).')
    return res
  }
  const body = hasHeader ? table.slice(1) : table
  if (body.length > 50000) { res.problems.push('Maksimal 50.000 baris per file.'); return res }

  const ci = hasHeader ? codeI : 0
  const ni = hasHeader ? nameI : 1
  const seen = new Set<string>(), dup = new Set<string>()

  body.forEach((r, k) => {
    const line = k + (hasHeader ? 2 : 1)
    const code = (r[ci] ?? '').trim().toUpperCase()
    const name = (r[ni] ?? '').trim()
    if (!code) { res.problems.push(`Baris ${line}: kode toko kosong.`); return }
    if (!CODE.test(code)) { res.problems.push(`Baris ${line} (${code}): kode tidak valid (1–40 huruf/angka, boleh titik, strip, garis miring).`); return }
    if (!name) { res.problems.push(`Baris ${line} (${code}): nama toko kosong.`); return }
    if (name.length > 120) { res.problems.push(`Baris ${line} (${code}): nama lebih dari 120 huruf.`); return }
    if (seen.has(code)) { dup.add(code); return }
    seen.add(code)

    let active = true
    if (hasHeader && activeI >= 0) {
      const v = (r[activeI] ?? '').trim().toLowerCase()
      if (v) {
        if (ACTIVE_YES.includes(v)) active = true
        else if (ACTIVE_NO.includes(v)) active = false
        else { res.problems.push(`Baris ${line} (${code}): kolom status "${v}" tidak dikenal (pakai Y/N).`); return }
      }
    }
    if (!active) res.inactive++
    res.rows.push({ code, name, is_active: active })
  })

  res.duplicates = [...dup]
  if (dup.size) res.problems.push(`${dup.size} kode muncul lebih dari satu kali: ${[...dup].slice(0, 5).join(', ')}${dup.size > 5 ? ', …' : ''}`)
  return res
}
