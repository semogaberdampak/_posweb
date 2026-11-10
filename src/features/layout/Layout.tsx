import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listBranches } from '../users/api'
import { ArrowLeftRight, Boxes, ClipboardCheck, DollarSign, Lock, Moon, Package, Settings, FileText, ShieldCheck, ShoppingCart, Sun, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Sidebar } from './Sidebar'
import { useTheme } from '../settings/theme'

const NAV: { to: string; label: string; feature: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { to: '/pos', label: 'Kasir Penjualan', feature: 'pos', icon: ShoppingCart },
  { to: '/produk', label: 'Informasi Produk', feature: 'products', icon: Package },
  { to: '/stok', label: 'Stok & Pengadaan', feature: 'stock', icon: Boxes },
  { to: '/mutasi-stok', label: 'Mutasi Stok', feature: 'stock_move', icon: ArrowLeftRight },
  { to: '/laporan', label: 'Rekap Penjualan', feature: 'sales_recap', icon: ClipboardCheck },
  { to: '/tutup-kasir', label: 'Tutup Kasir', feature: 'daily_close', icon: Lock },
  { to: '/keuangan', label: 'Keuangan', feature: 'finance', icon: DollarSign },
  { to: '/pengguna', label: 'Pengguna & Role', feature: 'users', icon: ShieldCheck },
  { to: '/format-nota', label: 'Format Nota', feature: 'settings', icon: FileText, adminOnly: true },
  { to: '/pengaturan', label: 'Pengaturan', feature: 'settings', icon: Settings },
]

export default function Layout() {
  const { profile, can, allBranches, activeBranchId, setActiveBranchId } = useAuth()
  const isKasir = profile?.role_name === 'kasir' // tombol Tutup Kasir di header khusus role kasir
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: listBranches, enabled: allBranches })
  const actingElsewhere = allBranches && !!activeBranchId && activeBranchId !== profile?.branch_id
  const { theme, toggle } = useTheme()
  const branch = profile?.branch_name ?? '-'
  const activeBranch = branches.find((b) => b.id === activeBranchId)
  const topBranchLabel = allBranches ? (activeBranch?.short_name ?? activeBranch?.name ?? branch) : branch
  const showTop = can('pos', 'r') || can('sales_recap', 'r')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={NAV.filter((n) => can(n.feature, 'r') && (!n.adminOnly || profile?.role_name === 'superadmin')
          && !(n.feature === 'daily_close' && isKasir)).map(({ to, label, icon }) => ({ to, label, icon }))}
        showTop={showTop} branchId={allBranches ? activeBranchId : null} branchLabel={topBranchLabel} />

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
            {isKasir && (
              <NavLink to="/tutup-kasir" title="Tutup transaksi harian (tutup kasir)"
                className="flex items-center gap-1.5 rounded-xl bg-bg-dark px-3 py-2.5 text-xs font-medium text-text-muted transition hover:bg-highlight/25">
                <Lock className="h-4 w-4" /> Tutup Kasir
              </NavLink>
            )}
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
