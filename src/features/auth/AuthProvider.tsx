import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useIdle } from '../../shared/hooks'

export type Action = 'c' | 'r' | 'u' | 'd'
type PermRow = { feature_key: string; can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean }
type Override = { feature_key: string; can_create: boolean | null; can_read: boolean | null; can_update: boolean | null; can_delete: boolean | null }
type Profile = { full_name: string; branch_id: string | null; role_id: string | null; is_active: boolean; branch_name?: string; role_name?: string }

type AuthCtx = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  can: (feature: string, action?: Action) => boolean
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

const IDLE_MS = 15 * 60 * 1000 // auto-logout 15 menit tanpa aktivitas

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [perms, setPerms] = useState<PermRow[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null); setPerms([]); setOverrides([])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) { setProfile(null); setPerms([]); setOverrides([]); return }
    let alive = true
    ;(async () => {
      const { data: p } = await supabase.from('profiles')
        .select('full_name,branch_id,role_id,is_active,branches(name),roles(name)').eq('id', uid).single()
      if (!alive) return
      if (!p || !p.is_active || !p.role_id) { await signOut(); setLoading(false); return }
      const { data: rp } = await supabase.from('role_permissions')
        .select('feature_key,can_create,can_read,can_update,can_delete').eq('role_id', p.role_id)
      const { data: ov } = await supabase.from('user_permissions').select('feature_key,can_create,can_read,can_update,can_delete').eq('user_id', uid)
      if (!alive) return
      setOverrides((ov ?? []) as Override[])
      const x = p as unknown as { branches?: { name?: string } | null; roles?: { name?: string } | null }
      setProfile({ full_name: p.full_name, branch_id: p.branch_id, role_id: p.role_id, is_active: p.is_active,
        branch_name: x.branches?.name, role_name: x.roles?.name })
      setPerms(rp ?? []); setLoading(false)
    })()
    return () => { alive = false }
  }, [uid, signOut])

  useIdle(IDLE_MS, signOut, !!session)

  const can = useCallback((feature: string, action: Action = 'r') => {
    const o = overrides.find((x) => x.feature_key === feature)
    const ov = o && { c: o.can_create, r: o.can_read, u: o.can_update, d: o.can_delete }[action]
    if (ov !== null && ov !== undefined) return ov // pengecualian user menang atas role
    const r = perms.find((x) => x.feature_key === feature)
    if (!r) return false
    return { c: r.can_create, r: r.can_read, u: r.can_update, d: r.can_delete }[action]
  }, [perms, overrides])

  const value = useMemo(() => ({ session, profile, loading, can, signOut }), [session, profile, loading, can, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
