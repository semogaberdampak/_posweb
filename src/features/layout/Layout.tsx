import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listBranches } from '../users/api'
import { Boxes, ClipboardCheck, DollarSign, LogOut, Moon, Package, Settings, FileText, ShieldCheck, ShoppingCart, Store, Sun, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../settings/theme'

const NAV: { to: string; label: string; feature: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { to: '/pos', label: 'Kasir Penjualan', feature: 'pos', icon: ShoppingCart },
  { to: '/produk', label: 'Produk & Harga', feature: 'products', icon: Package },
  { to: '/stok', label: 'Stok & Pengadaan', feature: 'stock', icon: Boxes },
  { to: '/laporan', label: 'Rekap Penjualan', feature: 'sales_recap', icon: ClipboardCheck },
  { to: '/keuangan', label: 'Keuangan', feature: 'finance', icon: DollarSign },
  { to: '/pengguna', label: 'Pengguna & Role', feature: 'users', icon: ShieldCheck },
  { to: '/format-nota', label: 'Format Nota', feature: 'settings', icon: FileText, adminOnly: true },
  { to: '/pengaturan', label: 'Pengaturan', feature: 'settings', icon: Settings },
]

export default function Layout() {
  const { profile, can, signOut, allBranches, activeBranchId, setActiveBranchId } = useAuth()
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })
  const actingElsewhere = allBranches && !!activeBranchId && activeBranchId !== profile?.branch_id
  const { theme, toggle } = useTheme()
  const branch = profile?.branch_name ?? '-'

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="z-20 hidden w-64 shrink-0 flex-col justify-between border-r border-border-muted bg-bg-light md:flex print:hidden">
        <div>
          <div className="flex items-center gap-3 border-b border-border-muted p-5">
            <div className="rounded-xl bg-primary p-2.5 text-on-primary shadow-lg shadow-primary/30"><Store className="h-6 w-6" /></div>
            <div>
              <h1 className="text-lg font-bold leading-none">POS Terintegrasi</h1>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Supabase</span>
            </div>
          </div>
          <nav className="max-h-[calc(100vh-220px)] space-y-1 overflow-y-auto p-3">
            {NAV.filter((n) => can(n.feature, 'r') && (!n.adminOnly || profile?.role_name === 'superadmin')).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'text-text-muted hover:bg-highlight/25'}`}>
                <Icon className="h-4 w-4" /><span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="space-y-2 border-t border-border-muted p-4">
          <div className="flex items-center gap-3 rounded-xl border border-border-muted bg-bg-dark p-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm font-bold text-primary">
              {profile?.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">{profile?.full_name}</p>
              <p className="truncate text-[10px] capitalize text-text-muted">{branch}{profile?.role_name ? ` • ${profile.role_name}` : ''}</p>
            </div>
          </div>
          <button className="btn-ghost flex w-full items-center justify-center gap-2" onClick={signOut}><LogOut className="h-4 w-4" />Keluar</button>
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex items-center justify-between border-b border-border-muted bg-bg-light px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Cabang aktif:</span>
            {allBranches && branches.length > 0 ? (
              <select aria-label="Cabang aktif" className="input !w-auto !py-1 text-sm" value={activeBranchId ?? ''} onChange={(e) => setActiveBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : <strong className="text-text">{branch}</strong>}
            {actingElsewhere && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-warning">Bertindak sebagai cabang lain</span>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggle} title="Ganti mode gelap/terang"
              className="rounded-xl bg-bg-dark p-2.5 text-text-muted transition hover:bg-highlight/25">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {can('settings', 'r') && (
              <NavLink to="/pengaturan" title="Pengaturan"
                className="rounded-xl bg-bg-dark p-2.5 text-text-muted transition hover:bg-highlight/25">
                <Settings className="h-4 w-4" />
              </NavLink>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-bg"><Outlet /></main>
      </div>
    </div>
  )
}
