import { supabase } from '../../lib/supabase'

export type FinanceData = {
  totals: { count: number; gross: number; discount: number; net: number; void_count: number; void_total: number }
  by_method: { method: string; count: number; net: number }[]
  by_branch: { branch: string; count: number; net: number; discount: number }[]
  by_day: { date: string; count: number; net: number; discount: number }[]
  /** null bila user tidak punya hak cost_prices (harga beli rahasia) */
  margin: { revenue_all: number; revenue_covered: number; cost: number; lines: number; lines_no_cost: number } | null
}

export async function fetchFinance(from: string, to: string, branchId: string | null): Promise<FinanceData> {
  const { data, error } = await supabase.rpc('finance_summary_range', { p_from: from, p_to: to, p_branch: branchId })
  if (error) throw new Error(error.message === 'forbidden' ? 'Anda tidak punya akses untuk ini.' : error.message)
  return data as FinanceData
}
