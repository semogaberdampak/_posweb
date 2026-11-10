import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth, type Action } from './AuthProvider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return (
  <div className="p-6 flex items-center gap-2">
    <div className="w-4 h-4 rounded-full border-2 border-border-muted border-t-primary animate-spin"/>
    <span className="text-text-muted">Memuat…</span>
  </div>
)
  if (!session || !profile) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Tutup kasir hanya untuk role `kasir` (server juga menolak role lain di RPC close_day). */
export function RequireKasir({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (profile?.role_name !== 'kasir') return <div className="p-6">Hanya kasir yang bisa menutup transaksi harian.</div>
  return <>{children}</>
}

/** Hanya untuk UX. Penegakan sebenarnya ada di RLS/RPC database. */
export function RequirePerm({ feature, action = 'r', children }: { feature: string; action?: Action; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(feature, action)) return <div className="p-6">Anda tidak memiliki akses ke halaman ini.</div>
  return <>{children}</>
}
