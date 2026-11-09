import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LogOut, Menu, Store, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useElementHeight } from '../../shared/hooks'
import { TopProducts } from './TopProducts'
import { computeSidebarLayout, HANDLE_REM } from './sidebarLayout'

export type NavItem = { to: string; label: string; icon: LucideIcon }
const K_H = 'pos.topHeightRem'
const readH = (): number | null => { try { const v = parseFloat(localStorage.getItem(K_H) ?? ''); return Number.isFinite(v) && v > 0 ? v : null } catch { return null } }
const saveH = (v: number | null) => { try { if (v == null) localStorage.removeItem(K_H); else localStorage.setItem(K_H, String(Math.round(v * 10) / 10)) } catch { /* abaikan */ } }
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

const linkCls = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary text-on-primary shadow-md shadow-primary/20' : 'text-text-muted hover:bg-highlight/25'}`

/** Sidebar: menu (yang tidak muat disembunyikan → tombol burger), pegangan tarik, kartu Produk Terlaris yang tingginya bisa diatur. */
export function Sidebar({ items, showTop, branchId, branchLabel }: { items: NavItem[]; showTop: boolean; branchId: string | null; branchLabel: string }) {
  const { profile, signOut } = useAuth()
  const [asideRef, H] = useElementHeight<HTMLElement>('border')
  const [logoRef, L] = useElementHeight<HTMLDivElement>('border')
  const [userRef, U] = useElementHeight<HTMLDivElement>('border')
  const [topRem, setTopRem] = useState<number | null>(readH)
  const [open, setOpen] = useState(false)
  const burgerRef = useRef<HTMLButtonElement>(null); const panelRef = useRef<HTMLDivElement>(null)
  const loc = useLocation()

  const rem = remPx()
  const lay = computeSidebarLayout({ H, L, U, rem, n: items.length, topRem, hasWidget: showTop })
  const hidden = items.length - lay.visible
  const curRem = lay.widgetH / rem

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { const t = e.target as Node; if (!panelRef.current?.contains(t) && !burgerRef.current?.contains(t)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); burgerRef.current?.focus() } }
    document.addEventListener('pointerdown', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  // ---- tarik pegangan: ke ATAS = kartu lebih tinggi (menu berkurang), ke BAWAH = kartu lebih rendah ----
  const drag = useRef<{ y: number; h: number } | null>(null)
  const apply = (px: number) => setTopRem(Math.min(Math.max(px, lay.minWidgetH), lay.maxWidgetH) / rem)
  const onDown = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, h: lay.widgetH } }
  const onMove = (e: React.PointerEvent) => { if (drag.current) apply(drag.current.h + (drag.current.y - e.clientY)) }
  const onUp = () => { if (drag.current) { drag.current = null; saveH(topRem) } } // simpan saat tarikan selesai
  const onKey = (e: React.KeyboardEvent) => {
    const step = rem // 1rem
    if (e.key === 'ArrowUp') { e.preventDefault(); apply(lay.widgetH + step) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); apply(lay.widgetH - step) }
    else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); reset() }
  }
  useEffect(() => { if (!drag.current) saveH(topRem) }, [topRem]) // papan ketik / reset: simpan segera (tarikan mouse disimpan saat dilepas)
  const reset = () => { setTopRem(null); saveH(null) }

  return (
    <aside ref={asideRef} className="z-20 hidden w-52 shrink-0 flex-col border-r border-border-muted bg-bg-light md:flex xl:w-64 print:hidden">
      <div ref={logoRef} className="relative flex shrink-0 items-center gap-3 border-b border-border-muted p-4 xl:p-5">
        <div className="shrink-0 rounded-xl bg-primary p-2.5 text-on-primary shadow-lg shadow-primary/30"><Store className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">POS Terintegrasi</h1>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Supabase</span>
        </div>
        <button ref={burgerRef} type="button" aria-label="Semua menu" aria-haspopup="true" aria-expanded={open} title="Semua menu" onClick={() => setOpen((v) => !v)}
          className="relative shrink-0 rounded-xl bg-bg-dark p-2 text-text-muted transition hover:bg-highlight/25">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          {hidden > 0 && <span aria-label={`${hidden} menu tersembunyi`} className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.65rem] font-bold leading-4 text-on-primary">{hidden}</span>}
        </button>
        {open && (
          <div ref={panelRef} role="menu" aria-label="Semua menu" className="absolute left-2 right-2 top-full z-30 mt-1 max-h-[70vh] space-y-1 overflow-y-auto rounded-2xl border border-border-muted bg-bg-light p-2 shadow-xl">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} role="menuitem" className={linkCls} onClick={() => setOpen(false)}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></NavLink>
            ))}
          </div>
        )}
      </div>

      <nav aria-label="Menu utama" className="shrink-0 space-y-1 overflow-hidden p-3" style={{ height: H ? lay.navH : undefined }}>
        {items.slice(0, H ? lay.visible : items.length).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkCls}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></NavLink>
        ))}
      </nav>

      {lay.hasHandle && (
        <div role="separator" aria-orientation="horizontal" aria-label="Atur tinggi Produk Terlaris (tarik atau gunakan panah atas/bawah; klik ganda = otomatis)" tabIndex={0}
          aria-valuemin={Math.round(lay.minWidgetH / rem)} aria-valuemax={Math.round(lay.maxWidgetH / rem)} aria-valuenow={Math.round(curRem)}
          title="Tarik untuk mengatur tinggi · klik ganda = otomatis"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={reset} onKeyDown={onKey}
          className="group flex shrink-0 cursor-row-resize touch-none items-center justify-center focus:outline-none" style={{ height: `${HANDLE_REM}rem` }}>
          <span className="h-1 w-10 rounded-full bg-border-muted transition group-hover:bg-primary group-focus-visible:bg-primary" />
        </div>
      )}
      <div className="box-border shrink-0 overflow-hidden px-3 pb-2" style={{ height: lay.widgetH }}>
        {lay.widgetH > 0 && showTop && <TopProducts branchId={branchId} branchLabel={branchLabel} />}
      </div>

      <div ref={userRef} className="mt-auto shrink-0 space-y-2 border-t border-border-muted p-4">
        <div className="flex items-center gap-3 rounded-xl border border-border-muted bg-bg-dark p-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm font-bold text-primary">{profile?.full_name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">{profile?.full_name}</p>
            <p className="truncate text-[10px] capitalize text-text-muted">{profile?.branch_name ?? '-'}{profile?.role_name ? ` • ${profile.role_name}` : ''}</p>
          </div>
        </div>
        <button className="btn-ghost flex w-full items-center justify-center gap-2" onClick={signOut}><LogOut className="h-4 w-4" />Keluar</button>
      </div>
    </aside>
  )
}
