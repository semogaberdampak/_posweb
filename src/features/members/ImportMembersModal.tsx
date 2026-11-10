import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { importMembers, type MemberImportResult } from './api'
import { parseMemberCsv, type MemberCsvResult } from './csv'

export function ImportMembersModal({ canOverwrite, onClose }: { canOverwrite: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<MemberCsvResult | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [result, setResult] = useState<MemberImportResult | null>(null)
  // Baris bermasalah dilewati; impor tetap boleh jalan selama masih ada baris valid.
  const ready = !!parsed && parsed.rows.length > 0

  async function pick(f: File | undefined) {
    setResult(null); setErr(''); setParsed(null); setFileName(f?.name ?? '')
    if (!f) return
    if (f.size > 10_000_000) { setErr('File terlalu besar (maks. 10 MB).'); return }
    setParsed(parseMemberCsv(await f.text()))
  }

  async function run() {
    if (!ready || !parsed) return
    if (overwrite && !window.confirm(`Nama, status, dan kolom lain yang ada di file akan DITIMPA untuk member yang nomornya sudah ada${parsed.problems.length ? `; ${parsed.problems.length} baris bermasalah dilewati` : ''}. Lanjutkan?`)) return
    setBusy(true); setErr('')
    try {
      setResult(await importMembers(parsed.rows, overwrite))
      await qc.invalidateQueries({ queryKey: ['members'] })
    } catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mengimpor.') } finally { setBusy(false) }
  }

  return (
    <Modal title="Impor data member dari file (CSV)" onClose={onClose}>
      {result ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-success/20 px-4 py-2 text-success">Impor selesai.</p>
          <ul className="space-y-1 text-sm">
            <li>Member baru: <b>{result.inserted}</b></li>
            {overwrite && <li>Diperbarui: <b>{result.updated}</b></li>}
            {!overwrite && <li>Dilewati (nomor sudah ada): <b>{result.skipped}</b></li>}
            <li>Baris ditolak server: <b className={result.invalid ? 'text-warning' : ''}>{result.invalid}</b></li>
          </ul>
          {result.invalid > 0 && <p className="break-all text-xs text-text-muted">Contoh: {result.invalid_sample.join(', ')}</p>}
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Selesai</button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Kolom wajib: <b>Cust ID</b> (nomor member) dan <b>Nama</b>. Kolom lain ikut disimpan bila ada:
            <b>Lembaga, Alamat, Kota, Propinsi, Telp., Sellular, Segment, Segment Detail, Balance</b> (saldo).
            Kolom <b>status</b> (Y/N) opsional. Format ringkas <b>nomor,nama</b> juga diterima.
            Di Excel: Simpan sebagai → CSV. Kolom Cust ID sebaiknya berformat Teks agar nomor tidak rusak.
          </p>
          <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(e) => void pick(e.target.files?.[0])} />
          <label className={`flex items-start gap-2 text-sm ${canOverwrite ? '' : 'opacity-50'}`}>
            <input type="checkbox" className="mt-1" disabled={!canOverwrite} checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span><b>Timpa member yang sudah ada</b>: hanya kolom yang ada di file yang diperbarui (butuh hak Ubah). Bila tidak dicentang, nomor yang sudah ada dilewati.</span>
          </label>
          {parsed && (
            <div className="rounded-2xl border border-border-muted bg-bg-dark p-3 text-sm">
              <div>{fileName}: <b>{parsed.rows.length}</b> baris valid{parsed.inactive > 0 ? ` (${parsed.inactive} ditandai nonaktif)` : ''}{parsed.repaired > 0 ? ` · ${parsed.repaired} baris kolom kosong dirapikan otomatis` : ''}</div>
              {parsed.problems.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-danger">
                  {parsed.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
                  {parsed.problems.length > 8 && <li>… dan {parsed.problems.length - 8} masalah lain</li>}
                </ul>
              )}
              {parsed.problems.length > 0 && <div className="mt-2 text-text-muted">Baris bermasalah di atas akan <b>dilewati</b>; sisanya tetap diimpor. Perbaiki file lalu pilih ulang bila ingin baris itu ikut.</div>}
            </div>
          )}
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={!ready || busy} onClick={run}>{busy ? 'Mengimpor…' : 'Impor'}</button></div>
        </div>
      )}
    </Modal>
  )
}
