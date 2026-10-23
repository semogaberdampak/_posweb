import { NavLink, Outlet } from 'react-router-dom'
import { Boxes, ClipboardCheck, DollarSign, LogOut, Moon, Package, Settings, ShieldCheck, ShoppingCart, Store, Sun, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../settings/theme'

const NAV: { to: string; label: string; feature: string; icon: LucideIcon }[] = [
  { to: '/pos', label: 'Kasir Penjualan', feature: 'pos', icon: ShoppingCart },
  { to: '/produk', label: 'Produk & Harga', feature: 'products', icon: Package },
  { to: '/stok', label: 'Stok & Pengadaan', feature: 'stock', icon: Boxes },
  { to: '/laporan', label: 'Rekap Penjualan', feature: 'sales_recap', icon: ClipboardCheck },
  { to: '/keuangan', label: 'Keuangan', feature: 'finance', icon: DollarSign },
  { to: '/pengguna', label: 'Pengguna & Role', feature: 'users', icon: ShieldCheck },
  { to: '/pengaturan', label: 'Pengaturan', feature: 'settings', icon: Settings },
]

export default function Layout() {
  const { profile, can, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const branch = profile?.branch_name ?? '-'

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="z-20 hidden w-64 shrink-0 flex-col justify-between border-r border-border bg-bg md:flex print:hidden">
        <div>
          <div className="flex items-center gap-3 border-b border-border p-5">
            <div className="rounded-xl bg-primary-600 p-2.5 text-white shadow-lg shadow-primary-600/30"><Store className="h-6 w-6" /></div>
            <div>
              <h1 className="text-lg font-bold leading-none">POS Terintegrasi</h1>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-400">Supabase</span>
            </div>
          </div>
          <nav className="max-h-[calc(100vh-220px)] space-y-1 overflow-y-auto p-3">
            {NAV.filter((n) => can(n.feature, 'r')).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
                  : 'text-fg-200 hover:bg-bg-200'}`}>
                <Icon className="h-4 w-4" /><span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="space-y-2 border-t border-border p-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-100 p-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-500/30 bg-primary-500/20 text-sm font-bold text-primary-400">
              {profile?.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-fg-100">{profile?.full_name}</p>
              <p className="truncate text-[10px] capitalize text-fg-200">{branch}{profile?.role_name ? ` • ${profile.role_name}` : ''}</p>
            </div>
          </div>
          <button className="btn-ghost flex w-full items-center justify-center gap-2" onClick={signOut}><LogOut className="h-4 w-4" />Keluar</button>
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex items-center justify-between border-b border-border bg-bg px-6 py-3.5 print:hidden">
          <span className="text-xs text-fg-200">
            Cabang: <strong className="text-fg-100">{branch}</strong>
          </span>
          <div className="flex items-center gap-3">
            <button onClick={toggle} title="Ganti mode gelap/terang"
              className="rounded-xl bg-bg-200 p-2.5 text-fg-100 transition hover:bg-bg-300">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {can('settings', 'r') && (
              <NavLink to="/pengaturan" title="Pengaturan"
                className="rounded-xl bg-bg-200 p-2.5 text-fg-100 transition hover:bg-bg-300">
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
