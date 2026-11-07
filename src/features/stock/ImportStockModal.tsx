import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../shared/Modal'
import { importStock, type ImportResult } from './api'
import { parseStockCsv, type CsvResult } from './csv'
import type { Branch } from '../users/api'

export function ImportStockModal({ branches, defaultBranchId, onClose }: { branches: Branch[]; defaultBranchId: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [branch, setBranch] = useState(defaultBranchId ?? branches[0]?.id ?? '')
  const [mode, setMode] = useState<'fill' | 'set'>('fill')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<CsvResult | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const branchName = branches.find((b) => b.id === branch)?.name ?? ''
  const ready = !!parsed && parsed.rows.length > 0 && parsed.problems.length === 0 && !!branch

  async function pick(f: File | undefined) {
    setResult(null); setErr(''); setParsed(null); setFileName(f?.name ?? '')
    if (!f) return
    if (f.size > 5_000_000) { setErr('File terlalu besar (maks. 5 MB).'); return }
    setParsed(parseStockCsv(await f.text()))
  }
  async function run() {
    if (!ready || !parsed) return
    if (mode === 'set' && !window.confirm(`Stok ${branchName} akan DITIMPA dengan angka di file. Lanjutkan?`)) return
    setBusy(true); setErr('')
    try { setResult(await importStock(branch, parsed.rows, mode)); await qc.invalidateQueries({ queryKey: ['stock-branches'] }) }
    catch (x) { setErr(x instanceof Error ? x.message : 'Gagal mengimpor.') } finally { setBusy(false) }
  }

  return (
    <Modal title="Impor stok dari file (CSV)" onClose={onClose}>
      {result ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-success/20 px-4 py-2 text-success">Selesai untuk {branchName}.</p>
          <ul className="space-y-1 text-sm">
            <li>Stok baru terisi: <b>{result.inserted}</b></li>
            {mode === 'set' && <li>Stok diperbarui: <b>{result.updated}</b> (sama: {result.same})</li>}
            {mode === 'fill' && <li>Dilewati (sudah punya stok / jumlah 0): <b>{result.skipped}</b></li>}
            <li>Kode tidak dikenal: <b className={result.unknown_count ? 'text-warning' : ''}>{result.unknown_count}</b></li>
          </ul>
          {result.unknown_count > 0 && <p className="break-all text-xs text-text-muted">Contoh: {result.unknown.slice(0, 10).join(', ')}{result.unknown_count > 10 ? ', …' : ''}</p>}
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Selesai</button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">File berisi dua kolom: <b>kode</b> dan <b>jumlah</b> (hasil hitung fisik satu cabang). Di Excel: Simpan sebagai → CSV. Kolom kode wajib berformat Teks.</p>
          <label className="block text-sm">Cabang
            <select className="input mt-1" value={branch} onChange={(e) => setBranch(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
          <fieldset className="space-y-1 text-sm">
            <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={mode === 'fill'} onChange={() => setMode('fill')} /><span><b>Isi stok awal saja</b> (aman): hanya produk yang belum punya stok di cabang ini; yang sudah ada tidak diubah.</span></label>
            <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={mode === 'set'} onChange={() => setMode('set')} /><span><b>Timpa dengan hasil hitung</b> (stok opname): stok produk di file diganti sesuai angkanya; selisih tercatat.</span></label>
          </fieldset>
          <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(e) => void pick(e.target.files?.[0])} />
          {parsed && (
            <div className="rounded-2xl border border-border-muted bg-bg-dark p-3 text-sm">
              <div>{fileName}: <b>{parsed.rows.length}</b> baris valid, total <b>{parsed.totalQty}</b> pcs</div>
              {parsed.problems.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-danger">
                  {parsed.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
                  {parsed.problems.length > 8 && <li>… dan {parsed.problems.length - 8} masalah lain</li>}
                </ul>
              )}
              {parsed.problems.length > 0 && <div className="mt-2 text-text-muted">Perbaiki file lalu pilih ulang. Impor tidak dijalankan selama masih ada masalah.</div>}
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
