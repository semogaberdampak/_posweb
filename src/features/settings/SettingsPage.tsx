import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useTheme } from './theme'

function ChangePassword() {
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(null)
    if (a.length < 12) return setMsg({ ok: false, text: 'Kata sandi minimal 12 karakter.' })
    if (a !== b) return setMsg({ ok: false, text: 'Konfirmasi kata sandi tidak sama.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) setMsg({ ok: false, text: 'Gagal mengganti kata sandi. Coba keluar lalu masuk lagi, kemudian ulangi.' })
    else { setMsg({ ok: true, text: 'Kata sandi berhasil diganti.' }); setA(''); setB('') }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-bg-light p-4 shadow">
      <div className="font-medium">Ganti kata sandi</div>
      <input className="input" type="password" autoComplete="new-password" placeholder="Kata sandi baru (min. 12 karakter)" value={a} onChange={(e) => setA(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Ulangi kata sandi baru" value={b} onChange={(e) => setB(e.target.value)} />
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kata sandi'}</button>
    </form>
  )
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  return (
    <div className="max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Pengaturan</h1>
      <div className="flex items-center justify-between rounded-2xl bg-bg-light p-4 shadow">
        <div>
          <div className="font-medium">Tema tampilan</div>
          <div className="text-sm text-text-muted">Saat ini: {theme === 'dark' ? 'Gelap' : 'Terang'}</div>
        </div>
        <button className="btn-primary" onClick={toggle}>Ganti ke {theme === 'dark' ? 'Terang' : 'Gelap'}</button>
      </div>
      <ChangePassword />
    </div>
  )
}
