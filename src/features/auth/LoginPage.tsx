import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

const KEY = 'last_email' // hanya email yang diingat, TIDAK PERNAH kata sandi
const readEmail = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
const writeEmail = (v: string | null) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY) } catch { /* abaikan */ } }

export default function LoginPage() {
  const { session, profile } = useAuth()
  const nav = useNavigate()
  const [saved] = useState(readEmail)
  const [email, setEmail] = useState(saved)
  const [remember, setRemember] = useState(!!saved)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (session && profile) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    // pesan generik: jangan bocorkan apakah email terdaftar
    if (error) { setErr('Email atau kata sandi salah.'); return }
    writeEmail(remember ? email.trim() : null)
    nav('/', { replace: true })
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-8 shadow-lg dark:bg-slate-800">
        <h1 className="text-center text-2xl font-semibold">Masuk</h1>
        <div className="flex items-center gap-3">
          <input className="input flex-1" type="email" autoComplete="username" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required autoFocus={!saved} />
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Ingat
          </label>
        </div>
        <div className="relative">
          <input className="input !pr-12" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Kata sandi"
            value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={!!saved} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
      </form>
    </div>
  )
}
