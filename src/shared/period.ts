// Periode laporan: per BULAN atau RENTANG TANGGAL (inklusif). Semua tanggal berupa teks 'YYYY-MM-DD' menurut WIB (Asia/Jakarta);
// tidak memakai zona waktu browser agar komputer di zona lain tetap melaporkan hari yang sama dengan server.
export type Period = { mode: 'month'; year: number; month: number } | { mode: 'range'; from: string; to: string }
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const MAX_DAYS = 366 // sama dengan batas di database (p_to - p_from <= 365)
const pad = (n: number) => String(n).padStart(2, '0')
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

export function todayWib(now: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
export function addDays(iso: string, n: number): string {
  const t = new Date(utc(iso) + n * 86400000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86400000)
export const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utc(s)) && addDays(s, 0) === s // menolak 2026-02-30 dsb.
export function monthRange(year: number, month: number) {
  const from = `${year}-${pad(month)}-01`
  return { from, to: addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`, -1) }
}
export const rangeOf = (p: Period) => (p.mode === 'month' ? monthRange(p.year, p.month) : { from: p.from, to: p.to })

/** Pesan galat untuk periode yang tidak bisa diminta, atau null bila sah. */
export function validate(p: Period): string | null {
  const { from, to } = rangeOf(p)
  if (!isIso(from) || !isIso(to)) return 'Tanggal belum lengkap atau tidak valid.'
  if (from > to) return 'Tanggal "Dari" harus sebelum atau sama dengan "Sampai".'
  if (from < '2000-01-01' || to > '2100-12-31') return 'Tanggal di luar batas yang didukung.'
  if (daysBetween(from, to) + 1 > MAX_DAYS) return `Rentang maksimal ${MAX_DAYS} hari.`
  return null
}
export function fmtDate(iso: string, short = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]} ${y}`
}
export function labelOf(p: Period): string {
  if (p.mode === 'month') return `${MONTHS[p.month - 1]} ${p.year}`
  return p.from === p.to ? fmtDate(p.from) : `${fmtDate(p.from, true)} – ${fmtDate(p.to, true)}`
}
/** Untuk nama berkas: 2026-11 | 2026-11-07 | 2026-11-01_sd_2026-11-07 */
export const tagOf = (p: Period) => (p.mode === 'month' ? `${p.year}-${pad(p.month)}` : p.from === p.to ? p.from : `${p.from}_sd_${p.to}`)
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cabang'

export function defaultPeriod(now: Date = new Date()): Period {
  const [y, m] = todayWib(now).split('-').map(Number)
  return { mode: 'month', year: y, month: m }
}
export function presets(now: Date = new Date()) {
  const t = todayWib(now), [y, m] = t.split('-').map(Number)
  return [
    { label: 'Hari ini', from: t, to: t },
    { label: 'Kemarin', from: addDays(t, -1), to: addDays(t, -1) },
    { label: '7 hari terakhir', from: addDays(t, -6), to: t },
    { label: '30 hari terakhir', from: addDays(t, -29), to: t },
    { label: 'Bulan ini', ...monthRange(y, m) },
  ]
}
