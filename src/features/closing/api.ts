import { supabase } from '../../lib/supabase'

export type MethodBucket = { method: string; count: number; net: number }

export type ClosingSnapshot = {
  closed_at: string; closed_by_name: string
  total_count: number; gross: number; discount: number; net: number
  void_count: number; void_total: number; by_method: MethodBucket[]
  cash_expected: number; cash_counted: number | null; cash_difference: number | null; note: string | null
}

export type DaySummary = {
  branch_id: string; branch_name: string; date: string
  totals: { count: number; gross: number; discount: number; net: number; void_count: number; void_total: number }
  by_method: MethodBucket[]
  cash_expected: number
  closing: ClosingSnapshot | null
  changed_after_close: boolean
}

export type ClosingHistoryRow = {
  id: string; close_date: string; closed_at: string
  total_count: number; net: number; cash_expected: number
  cash_counted: number | null; cash_difference: number | null; note: string | null
}

const msg = (m: string) => (m === 'forbidden' ? 'Anda tidak punya akses untuk ini.' : m)

/** Ringkasan & status penutupan satu cabang pada satu tanggal (YYYY-MM-DD, WIB). Angka dari server. */
export async function fetchDaySummary(branchId: string, date: string): Promise<DaySummary> {
  const { data, error } = await supabase.rpc('daily_close_summary', { p_branch: branchId, p_date: date })
  if (error) throw new Error(msg(error.message))
  return data as DaySummary
}

/** Menutup hari: server menghitung ulang seluruh angka dari tabel sales lalu menyimpan snapshot. */
export async function closeDay(branchId: string, date: string, cashCounted: number | null, note: string): Promise<DaySummary> {
  const { data, error } = await supabase.rpc('close_day', { p_branch: branchId, p_date: date, p_cash_counted: cashCounted, p_note: note.trim() || null })
  if (error) throw new Error(msg(error.message))
  return data as DaySummary
}

/** Riwayat penutupan cabang ini (dibatasi RLS: hak daily_close + akses cabang). */
export async function listClosings(branchId: string, limit = 30): Promise<ClosingHistoryRow[]> {
  const { data, error } = await supabase.from('daily_closings')
    .select('id,close_date,closed_at,total_count,net,cash_expected,cash_counted,cash_difference,note')
    .eq('branch_id', branchId).order('close_date', { ascending: false }).limit(limit)
  if (error) throw new Error(msg(error.message))
  return (data ?? []) as ClosingHistoryRow[]
}
