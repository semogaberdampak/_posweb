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
      <aside className="z-20 hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white md:flex dark:border-slate-700 dark:bg-slate-800 print:hidden">
        <div>
          <div className="flex items-center gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
            <div className="rounded-xl bg-brand-600 p-2.5 text-white shadow-lg shadow-brand-600/30"><Store className="h-6 w-6" /></div>
            <div>
              <h1 className="text-lg font-bold leading-none">POS Terintegrasi</h1>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Supabase</span>
            </div>
          </div>
          <nav className="max-h-[calc(100vh-220px)] space-y-1 overflow-y-auto p-3">
            {NAV.filter((n) => can(n.feature, 'r')).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/50'}`}>
                <Icon className="h-4 w-4" /><span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/20 text-sm font-bold text-brand-600 dark:text-brand-400">
              {profile?.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">{profile?.full_name}</p>
              <p className="truncate text-[10px] capitalize text-slate-500 dark:text-slate-400">{branch}{profile?.role_name ? ` • ${profile.role_name}` : ''}</p>
            </div>
          </div>
          <button className="btn-ghost flex w-full items-center justify-center gap-2" onClick={signOut}><LogOut className="h-4 w-4" />Keluar</button>
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5 dark:border-slate-700 dark:bg-slate-800 print:hidden">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Cabang: <strong className="text-slate-700 dark:text-slate-200">{branch}</strong>
          </span>
          <div className="flex items-center gap-3">
            <button onClick={toggle} title="Ganti mode gelap/terang"
              className="rounded-xl bg-slate-100 p-2.5 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {can('settings', 'r') && (
              <NavLink to="/pengaturan" title="Pengaturan"
                className="rounded-xl bg-slate-100 p-2.5 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                <Settings className="h-4 w-4" />
              </NavLink>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-slate-50 dark:bg-slate-950/50"><Outlet /></main>
      </div>
    </div>
  )
}
