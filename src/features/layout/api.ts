import { supabase } from '../../lib/supabase'

// ---------- urutan menu sidebar (pengaturan GLOBAL, hanya superadmin yang mengubah) ----------
export async function getNavOrder(): Promise<string[]> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'nav_order').maybeSingle()
  if (error) return [] // tabel belum ada / belum dijalankan migrasinya: pakai urutan bawaan
  const v = (data?.value ?? null) as unknown
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function saveNavOrder(order: string[]): Promise<void> {
  const { error } = await supabase.rpc('save_nav_order', { p_order: order })
  if (error) throw new Error(error.message === 'forbidden' ? 'Hanya superadmin yang boleh mengubah urutan menu.' : 'Gagal menyimpan urutan menu.')
}

// ---------- pemberitahuan sistem (dibaca semua user, ditulis hanya superadmin) ----------
export type NotificationItem = {
  id: string
  title: string
  body: string
  created_at: string
  created_by_name: string | null
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const { data, error } = await supabase.from('notifications')
    .select('id,title,body,created_at,created_by_name')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return [] // migrasi 025 belum dijalankan: lonceng tetap tampil tanpa isi
  return (data ?? []) as NotificationItem[]
}

export async function createNotification(title: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('notification_save', { p_title: title, p_body: body })
  if (error) {
    if (error.message === 'forbidden') throw new Error('Hanya superadmin yang boleh menulis pemberitahuan.')
    throw new Error(error.message || 'Gagal menyimpan pemberitahuan.')
  }
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.rpc('notification_delete', { p_id: id })
  if (error) throw new Error(error.message === 'forbidden' ? 'Hanya superadmin yang boleh menghapus pemberitahuan.' : 'Gagal menghapus pemberitahuan.')
}
