import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth, type Action } from './AuthProvider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="p-6">Memuat…</div>
  if (!session || !profile) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Hanya untuk UX. Penegakan sebenarnya ada di RLS/RPC database. */
export function RequirePerm({ feature, action = 'r', children }: { feature: string; action?: Action; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(feature, action)) return <div className="p-6">Anda tidak memiliki akses ke halaman ini.</div>
  return <>{children}</>
}
