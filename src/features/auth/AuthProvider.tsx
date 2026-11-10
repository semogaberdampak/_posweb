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
  allBranches: boolean                       // role lintas cabang (mis. superadmin)
  activeBranchId: string | null              // cabang yang sedang dipakai (default: cabang user)
  setActiveBranchId: (id: string) => void
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
  const [allBranches, setAllBranches] = useState(false)
  const [activeBranch, setActiveBranch] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null); setPerms([]); setOverrides([]); setAllBranches(false); setActiveBranch(null)
    try { sessionStorage.removeItem('active_branch') } catch { /* abaikan */ }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) { setProfile(null); setPerms([]); setOverrides([]); setAllBranches(false); setActiveBranch(null); return }
    let alive = true
    ;(async () => {
      const { data: p } = await supabase.from('profiles')
        .select('full_name,branch_id,role_id,is_active,branches(name)').eq('id', uid).single()
      if (!alive) return
      if (!p || !p.is_active || !p.role_id) { await signOut(); setLoading(false); return }
      const { data: rp } = await supabase.from('role_permissions')
        .select('feature_key,can_create,can_read,can_update,can_delete').eq('role_id', p.role_id)
      const { data: ov } = await supabase.from('user_permissions').select('feature_key,can_create,can_read,can_update,can_delete').eq('user_id', uid)
      const { data: sc } = await supabase.rpc('my_scope') // role + boleh lintas cabang (tanpa perlu hak baca tabel roles)
      if (!alive) return
      const scope = (sc as { role_name: string; all_branches: boolean }[] | null)?.[0]
      setOverrides((ov ?? []) as Override[])
      const x = p as unknown as { branches?: { name?: string } | null }
      setProfile({ full_name: p.full_name, branch_id: p.branch_id, role_id: p.role_id, is_active: p.is_active,
        branch_name: x.branches?.name, role_name: scope?.role_name })
      setAllBranches(!!scope?.all_branches)
      if (scope?.all_branches) {
        // Cabang aktif: pilihan terakhir di komputer ini → cabang profil → cabang aktif pertama.
        // Akun "Global" (branch_id kosong) butuh cadangan ini agar kasir/penjualan lintas cabang tetap jalan.
        let pick: string | null = null
        try { pick = sessionStorage.getItem('active_branch') } catch { /* abaikan */ }
        if (!pick) pick = p.branch_id
        if (!pick) {
          const { data: bs } = await supabase.from('branches').select('id').eq('is_active', true).order('name').limit(1)
          if (!alive) return
          pick = (bs as { id: string }[] | null)?.[0]?.id ?? null
        }
        if (pick) { setActiveBranch(pick); try { sessionStorage.setItem('active_branch', pick) } catch { /* abaikan */ } }
      }
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

  const setActiveBranchId = useCallback((id: string) => {
    setActiveBranch(id)
    try { sessionStorage.setItem('active_branch', id) } catch { /* abaikan */ }
  }, [])
  // Hanya role lintas cabang yang bisa berpindah; server tetap memeriksa ulang (create_sale/can_see_branch)
  const activeBranchId = allBranches && activeBranch ? activeBranch : profile?.branch_id ?? null

  const value = useMemo(() => ({ session, profile, loading, can, allBranches, activeBranchId, setActiveBranchId, signOut }),
    [session, profile, loading, can, allBranches, activeBranchId, setActiveBranchId, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
