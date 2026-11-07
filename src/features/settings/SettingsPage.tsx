import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useTheme } from './theme'
import { PrintSheet } from '../print/views'
import { triggerPrint, usePrintPrefs } from '../print/printing'
import { SAMPLE, useInvoiceCfg, useReceiptCfg } from '../print/templates'

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

function PrinterSettings({ onTest }: { onTest: () => void }) {
  const { autoPrint, thermalOnly, changeAuto, changeThermalOnly } = usePrintPrefs()
  return (
    <div className="space-y-3 rounded-2xl bg-bg-light p-4 shadow">
      <div className="font-medium">Printer struk (thermal) — khusus komputer ini</div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={autoPrint} onChange={(e) => changeAuto(e.target.checked)} /><span>Cetak struk otomatis setelah transaksi selesai</span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={thermalOnly} onChange={(e) => changeThermalOnly(e.target.checked)} /><span>Komputer ini hanya memakai printer thermal (sembunyikan tombol nota A4)</span></label>
      <button className="btn-ghost" onClick={onTest}>Cetak struk contoh</button>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
        <li>Jadikan printer thermal sebagai <b>printer bawaan (default)</b> di Windows.</li>
        <li>Agar struk keluar <b>tanpa jendela dialog</b>, buka aplikasi lewat <code>scripts\kasir-kiosk.cmd</code> (Chrome/Edge mode cetak langsung). Tanpa itu, dialog cetak muncul tiap transaksi.</li>
        <li>Pengaturan ini tersimpan di browser komputer ini saja, tidak ikut akun.</li>
      </ol>
    </div>
  )
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const receipt = useReceiptCfg(), invoice = useInvoiceCfg()
  const [testing, setTesting] = useState(false)
  const test = () => { setTesting(true); triggerPrint() }
  return (
    <>
    <div className="max-w-xl space-y-6 p-6 print:hidden">
      <h1 className="text-2xl font-semibold">Pengaturan</h1>
      <div className="flex items-center justify-between rounded-2xl bg-bg-light p-4 shadow">
        <div>
          <div className="font-medium">Tema tampilan</div>
          <div className="text-sm text-text-muted">Saat ini: {theme === 'dark' ? 'Gelap' : 'Terang'}</div>
        </div>
        <button className="btn-primary" onClick={toggle}>Ganti ke {theme === 'dark' ? 'Terang' : 'Gelap'}</button>
      </div>
      <PrinterSettings onTest={test} />
      <ChangePassword />
    </div>
    {testing && <PrintSheet kind="receipt" data={SAMPLE} receipt={receipt} invoice={invoice} />}
    </>
  )
}
