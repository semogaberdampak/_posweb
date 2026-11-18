import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Plus, Trash2, X } from 'lucide-react'
import { createNotification, deleteNotification, listNotifications, type NotificationItem } from './api'

const K_SEEN = 'notif.seenAt'
const readSeen = (): string => { try { return localStorage.getItem(K_SEEN) ?? '' } catch { return '' } }
const saveSeen = (v: string) => { try { localStorage.setItem(K_SEEN, v) } catch { /* abaikan */ } }

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB'
}

function Note({ n, index, canWrite, onDelete }: { n: NotificationItem; index: number; canWrite: boolean; onDelete: (n: NotificationItem) => void }) {
  return (
    <li className="animate-notif-item px-4 py-3" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{n.title}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-text-muted">{fmtDate(n.created_at)}{n.created_by_name ? ` · ${n.created_by_name}` : ''}</p>
          {n.body && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-text-muted">{n.body}</p>}
        </div>
        {canWrite && (
          <button type="button" aria-label={`Hapus pemberitahuan ${n.title}`} title="Hapus pemberitahuan"
            className="shrink-0 rounded-full p-1.5 text-text-muted transition hover:bg-danger/20 hover:text-danger"
            onClick={() => onDelete(n)}><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
    </li>
  )
}

/** Lonceng pemberitahuan sistem di header. Dibaca semua user; menulis/menghapus hanya superadmin. */
export function NotificationBell({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [compose, setCompose] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [err, setErr] = useState('')
  const [seen, setSeen] = useState<string>(readSeen)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const { data = [], isLoading } = useQuery({ queryKey: ['notifications'], queryFn: listNotifications })
  const unread = seen ? data.filter((n) => n.created_at > seen).length : data.length

  // tandai sudah dibaca saat panel dibuka
  useEffect(() => {
    if (!open || data.length === 0) return
    const newest = data[0].created_at
    if (newest > seen) { setSeen(newest); saveSeen(newest) }
  }, [open, data, seen])

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => {
      const t = e.target as Node
      if (!wrapRef.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  useEffect(() => { if (!open) setCompose(false) }, [open])

  const save = useMutation({
    mutationFn: () => createNotification(title.trim(), body.trim()),
    onSuccess: async () => {
      setCompose(false); setTitle(''); setBody(''); setErr('')
      await qc.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Gagal menyimpan pemberitahuan.'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: async () => { setErr(''); await qc.invalidateQueries({ queryKey: ['notifications'] }) },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Gagal menghapus pemberitahuan.'),
  })

  function del(n: NotificationItem) {
    if (!window.confirm(`Hapus pemberitahuan "${n.title}"?`)) return
    remove.mutate(n.id)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setErr('Judul pemberitahuan wajib diisi.'); return }
    save.mutate()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Pemberitahuan (${unread} belum dibaca)` : 'Pemberitahuan'}
        aria-haspopup="dialog" aria-expanded={open} title="Pemberitahuan sistem"
        className="relative rounded-xl bg-bg-dark p-2.5 text-text-muted transition hover:bg-highlight/25">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.65rem] font-bold leading-4 text-on-primary">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Pemberitahuan sistem"
          className="animate-notif-panel absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-2xl border border-border-muted bg-bg-light shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-primary" />Pemberitahuan</div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Tutup pemberitahuan" className="rounded-full p-1.5 hover:bg-highlight/25"><X className="h-4 w-4" /></button>
          </div>

          <ul className="max-h-[55vh] divide-y divide-border-muted overflow-y-auto">
            {data.map((n, i) => <Note key={n.id} n={n} index={i} canWrite={canWrite} onDelete={del} />)}
            {data.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-text-muted">{isLoading ? 'Memuat…' : 'Belum ada pemberitahuan.'}</li>
            )}
          </ul>

          <div className="border-t border-border-muted p-3">
            {err && <p role="alert" className="mb-2 text-xs text-danger">{err}</p>}
            {!canWrite ? (
              <p className="text-center text-xs text-text-muted">Pemberitahuan ditulis oleh superadmin.</p>
            ) : compose ? (
              <form onSubmit={submit} className="space-y-2">
                <input autoFocus className="input !py-1.5 text-sm" placeholder="Judul pemberitahuan" maxLength={120}
                  value={title} onChange={(e) => setTitle(e.target.value)} />
                <textarea className="w-full rounded-2xl border border-border bg-bg-dark px-3 py-2 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Isi pemberitahuan (opsional)" rows={3} maxLength={4000}
                  value={body} onChange={(e) => setBody(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-ghost !px-3 !py-1 text-sm" onClick={() => { setCompose(false); setErr('') }}>Batal</button>
                  <button type="submit" className="btn-primary !px-3 !py-1 text-sm disabled:opacity-50" disabled={save.isPending}>
                    <span className="flex items-center gap-1"><Check className="h-4 w-4" />{save.isPending ? 'Mengirim…' : 'Kirim'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="btn-ghost flex w-full items-center justify-center gap-1 !py-1.5 text-sm" onClick={() => setCompose(true)}>
                <Plus className="h-4 w-4" />Tulis pemberitahuan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
