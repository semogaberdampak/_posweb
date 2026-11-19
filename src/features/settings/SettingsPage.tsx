import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useTheme } from './theme'
import { PrintSheet } from '../print/views'
import { triggerPrint, usePrintPrefs } from '../print/printing'
import { SAMPLE, useInvoiceCfg, useReceiptCfg } from '../print/templates'
import { deviceLabel, pairedPrinter, pairUsbPrinter, printDirect, usbSupported } from '../../lib/webusb-printer'
import { useAuth } from '../auth/AuthProvider'

function ChangePassword() {
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(null)
    if (a.length < 8) return setMsg({ ok: false, text: 'Kata sandi minimal 8 karakter.' })
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

function PrinterSettings({ onTest, branchId }: { onTest: () => void; branchId: string | null }) {
  const { autoPrint, thermalOnly, usbDirect, changeAuto, changeThermalOnly, changeUsbDirect } = usePrintPrefs()
  const receipt = useReceiptCfg(branchId)
  const [usbName, setUsbName] = useState(''); const [usbMsg, setUsbMsg] = useState('')
  useEffect(() => { pairedPrinter().then((d) => setUsbName(d ? deviceLabel(d) : '')).catch(() => setUsbName('')) }, [])
  async function pair() { const r = await pairUsbPrinter(); if (r.device) { setUsbName(deviceLabel(r.device)); setUsbMsg('Printer dihubungkan.') } else setUsbMsg(r.reason ?? '') }
  async function testUsb() { setUsbMsg('Mencetak…'); const r = await printDirect(SAMPLE, receipt); setUsbMsg(r.ok ? 'Terkirim ke printer.' : `Gagal: ${r.reason}`) }
  return (
    <div className="space-y-3 rounded-2xl bg-bg-light p-4 shadow">
      <div className="font-medium">Printer struk (thermal) — khusus komputer ini</div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={autoPrint} onChange={(e) => changeAuto(e.target.checked)} /><span>Cetak struk otomatis setelah transaksi selesai</span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={thermalOnly} onChange={(e) => changeThermalOnly(e.target.checked)} /><span>Komputer ini hanya memakai printer thermal (sembunyikan tombol nota A4)</span></label>
      <button className="btn-ghost" onClick={onTest}>Cetak struk contoh</button>
      {usbSupported() && (
        <div className="space-y-2 rounded-2xl border border-border-muted p-3">
          <div className="text-sm font-medium">Cetak langsung via USB (eksperimental)</div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={usbDirect} onChange={(e) => changeUsbDirect(e.target.checked)} /><span>Kirim struk langsung ke printer USB; bila gagal, otomatis memakai cetak browser</span></label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost" onClick={pair}>Hubungkan printer USB</button>
            <button className="btn-ghost" disabled={!usbName} onClick={testUsb}>Tes cetak langsung</button>
            <span className="text-sm text-text-muted">{usbName ? `Terhubung: ${usbName}` : 'Belum ada printer terhubung'}</span>
          </div>
          {usbMsg && <p role="status" className="text-sm">{usbMsg}</p>}
          <p className="text-xs text-text-muted">Di Windows, WebUSB hanya bisa membuka printer yang memakai driver WinUSB; dengan driver bawaan pabrikan biasanya muncul "Access denied" dan aplikasi memakai cetak browser. Isi struk mengikuti Format Nota.</p>
        </div>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
        <li>Jadikan printer thermal sebagai <b>printer bawaan (default)</b> di Windows.</li>
        <li>Agar struk keluar <b>tanpa jendela dialog</b>, buka aplikasi lewat <code>scripts\kasir-kiosk.cmd</code> (Chrome/Edge mode cetak langsung). Tanpa itu, dialog cetak muncul tiap transaksi.</li>
        <li>Pengaturan ini tersimpan di browser komputer ini saja, tidak ikut akun.</li>
      </ol>
    </div>
  )
}

type StoreMemberCfg = { enabled?: boolean; code?: string | null; name?: string | null }
type KbsRow = { code: string; name: string }

function StoreMemberSettings({ branchId }: { branchId: string | null }) {
  const [enabled, setEnabled] = useState(false)
  const [code, setCode] = useState(''); const [name, setName] = useState('')
  const [q, setQ] = useState(''); const [rows, setRows] = useState<KbsRow[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setMsg(null); setRows(null)
    if (!branchId) { setEnabled(false); setCode(''); setName(''); return }
    supabase.rpc('store_member_get', { p_branch: branchId }).then(({ data, error }) => {
      if (!alive) return
      if (error) { setMsg({ ok: false, text: 'Gagal memuat pengaturan member toko.' }); return }
      const v = (data ?? {}) as StoreMemberCfg
      setEnabled(!!v.enabled); setCode(v.code ?? ''); setName(v.name ?? '')
    })
    return () => { alive = false }
  }, [branchId])

  async function search() {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('kbs_member_search', { p_query: q.trim() })
    setBusy(false)
    if (error) { setRows(null); setMsg({ ok: false, text: 'Gagal mencari data member toko.' }); return }
    setRows((data ?? []) as KbsRow[])
  }

  async function save() {
    if (!branchId) return
    if (enabled && !code) { setMsg({ ok: false, text: 'Pilih kode member toko dulu, atau hilangkan centang.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('store_member_save', { p_branch: branchId, p_enabled: enabled, p_code: enabled ? code : null })
    setBusy(false)
    if (error) { setMsg({ ok: false, text: `Gagal menyimpan: ${error.message}` }); return }
    setMsg({ ok: true, text: enabled ? `Member toko dipakai untuk transaksi tanpa diskon (${code}${name ? ` — ${name}` : ''}).` : 'Member toko dimatikan untuk cabang ini.' })
  }

  return (
    <div className="space-y-3 rounded-2xl bg-bg-light p-4 shadow">
      <div className="font-medium">Member toko (KBS)</div>
      <p className="text-sm text-text-muted">
        Bila dinyalakan, transaksi <b>tanpa diskon</b> otomatis memakai kode & nama toko ini pada struk
        (kolom pelanggan). Transaksi berdiskon tetap wajib memakai member TAKOM yang terdaftar.
      </p>
      {!branchId ? (
        <p className="text-sm text-warning">Pilih cabang aktif di header dulu.</p>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Gunakan member toko</span>
          </label>
          {enabled && (
            <div className="space-y-2 rounded-2xl border border-border-muted p-3">
              <div className="text-sm">
                {code ? <>Kode: <b>{code}</b>{name && <> — {name}</>}</> : <span className="text-text-muted">Belum memilih kode member toko.</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <input className="input min-w-0 flex-1" placeholder="Cari kode / nama toko KBS" value={q} maxLength={60}
                  onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search() } }} />
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => void search()}>Cari</button>
              </div>
              {rows && rows.length === 0 && (
                <p className="text-sm text-text-muted">Tidak ada data member toko. Superadmin perlu mengimpor data KBS terlebih dahulu.</p>
              )}
              {rows && rows.length > 0 && (
                <div className="space-y-1">
                  {rows.map((r) => (
                    <button type="button" key={r.code} className="btn-ghost w-full text-left"
                      onClick={() => { setCode(r.code); setName(r.name); setRows(null); setQ('') }}>
                      <b>{r.code}</b> — {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Menyimpan…' : 'Simpan pengaturan member toko'}
          </button>
          {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        </>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { allBranches, activeBranchId, profile } = useAuth()
  const cfgBranch = allBranches ? activeBranchId : profile?.branch_id ?? null // struk contoh memakai format cabang ini
  const receipt = useReceiptCfg(cfgBranch), invoice = useInvoiceCfg(cfgBranch)
  const [testing, setTesting] = useState(false)
  const test = () => { setTesting(true); triggerPrint() }
  return (
    <>
    <div className="mx-auto w-full max-w-xl space-y-6 p-6 print:hidden">
      <h1 className="text-center text-2xl font-semibold">Pengaturan</h1>
      <div className="flex items-center justify-between rounded-2xl bg-bg-light p-4 shadow">
        <div>
          <div className="font-medium">Tema tampilan</div>
          <div className="text-sm text-text-muted">Saat ini: {theme === 'dark' ? 'Gelap' : 'Terang'}</div>
        </div>
        <button className="btn-primary" onClick={toggle}>Ganti ke {theme === 'dark' ? 'Terang' : 'Gelap'}</button>
      </div>
      {(profile?.role_name === 'kasir' || profile?.role_name === 'superadmin') && (
        <StoreMemberSettings branchId={cfgBranch} />
      )}
      <PrinterSettings onTest={test} branchId={cfgBranch} />
      <ChangePassword />
    </div>
    {testing && <PrintSheet kind="receipt" data={SAMPLE} receipt={receipt} invoice={invoice} />}
    </>
  )
}
