import { useState, type FormEvent } from 'react'
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Modal } from '../../shared/Modal'
import { resetPassword, type UserRow } from './api'

function randomPassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' // tanpa karakter yang mirip (0/O, 1/l/I)
  const a = new Uint32Array(len); crypto.getRandomValues(a)
  return Array.from(a, (n) => chars[n % chars.length]).join('')
}

export function ResetPasswordModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [pw, setPw] = useState(''); const [show, setShow] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false); const [copied, setCopied] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 12) return setErr('Kata sandi minimal 12 karakter.')
    setBusy(true); setErr('')
    try { await resetPassword(user.id, pw); setDone(true) }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal.') } finally { setBusy(false) }
  }

  return (
    <Modal title={`Reset kata sandi: ${user.full_name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-success/20 px-4 py-2 text-sm text-success">Kata sandi berhasil diganti. Sesi login lama pengguna ini dikeluarkan.</p>
          <p className="text-sm text-text-muted">Sampaikan kata sandi ini lewat jalur yang aman, lalu minta pengguna menggantinya sendiri di menu Pengaturan. Kata sandi tidak akan ditampilkan lagi setelah jendela ini ditutup.</p>
          <div className="flex items-center gap-2 rounded-2xl border border-border-muted bg-bg-dark px-4 py-2 font-mono">
            <span className="min-w-0 flex-1 break-all">{pw}</span>
            <button className="btn-ghost !px-3 !py-1 flex items-center gap-1" onClick={async () => { try { await navigator.clipboard.writeText(pw); setCopied(true) } catch { /* abaikan */ } }}>
              <Copy className="h-4 w-4" />{copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Selesai</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-text-muted">{user.email}</p>
          <div className="relative">
            <input className="input !pr-12 font-mono" type={show ? 'text' : 'password'} placeholder="Kata sandi baru (min. 12 karakter)" value={pw}
              onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus required />
            <button type="button" aria-label={show ? 'Sembunyikan' : 'Tampilkan'} onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted hover:text-text">
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <button type="button" className="btn-ghost flex items-center gap-2" onClick={() => { setPw(randomPassword()); setShow(true) }}>
            <RefreshCw className="h-4 w-4" />Buat kata sandi acak
          </button>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Memproses…' : 'Reset kata sandi'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
