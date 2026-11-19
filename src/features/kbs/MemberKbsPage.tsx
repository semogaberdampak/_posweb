import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload } from 'lucide-react'
import { deleteKbsMember, listKbsMembers, saveKbsMember, type KbsMember } from './api'
import { KbsForm } from './KbsForm'
import { ImportKbsModal } from './ImportKbsModal'
import { KbsDetailModal } from './KbsDetailModal'
import { useAuth } from '../auth/AuthProvider'
import { useDebounced } from '../../shared/hooks'

export default function MemberKbsPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [onlyActive, setOnlyActive] = useState(false)
  const [form, setForm] = useState<{ member: KbsMember | null } | null>(null)
  const [detail, setDetail] = useState<KbsMember | null>(null)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const showActions = can('member_kbs', 'u') || can('member_kbs', 'd')

  const { data, isFetching, isError } = useQuery({
    queryKey: ['kbs-members', dq, onlyActive],
    queryFn: () => listKbsMembers(dq, onlyActive),
    placeholderData: keepPreviousData,
  })
  const rows = data?.rows ?? []

  const refresh = () => void qc.invalidateQueries({ queryKey: ['kbs-members'] })

  const toggle = useMutation({
    mutationFn: (m: KbsMember) => saveKbsMember({ id: m.id, code: m.code, name: m.name, is_active: !m.is_active }),
    onSuccess: () => { setMsg(''); refresh() },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Gagal mengubah status.'),
  })

  async function remove(m: KbsMember) {
    if (!window.confirm(`Hapus member KBS ${m.code} - ${m.name}? Toko yang masih dipakai pengaturan cabang tidak bisa dihapus.`)) return
    try { await deleteKbsMember(m.id); setMsg(''); refresh() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal menghapus.') }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-semibold">Member KBS</h1>
        <input className="input !w-64" placeholder="Cari kode / nama toko" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> hanya aktif
        </label>
        <div className="ml-auto flex items-center gap-2">
          {can('member_kbs', 'c') && <button className="btn-ghost flex items-center gap-1" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Impor CSV</button>}
          {can('member_kbs', 'c') && <button className="btn-primary flex items-center gap-1" onClick={() => setForm({ member: null })}><Plus className="h-4 w-4" />Tambah member</button>}
        </div>
      </div>

      {msg && <p role="alert" className="rounded-2xl bg-danger/20 px-4 py-2 text-sm text-danger">{msg}</p>}
      {isError && <p role="alert" className="rounded-2xl bg-danger/20 px-4 py-2 text-sm text-danger">Gagal memuat data member KBS.</p>}

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-3 rounded-2xl border border-border-muted bg-bg-light px-4 py-2">
          <span className="text-xs uppercase tracking-wide text-text-muted">Total toko</span>
          <b className="text-lg">{data ? data.total.toLocaleString('id-ID') : '—'}</b>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 px-4 py-2">
          <span className="text-xs uppercase tracking-wide text-text-muted">Aktif</span>
          <b className="text-lg text-success">{data ? data.active.toLocaleString('id-ID') : '—'}</b>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-2">
          <span className="text-xs uppercase tracking-wide text-text-muted">Nonaktif</span>
          <b className="text-lg text-warning">{data ? data.inactive.toLocaleString('id-ID') : '—'}</b>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-muted bg-bg-light">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-dark text-left text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Kode</th>
              <th className="px-3 py-2 font-medium">Nama toko</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {showActions && <th className="px-3 py-2 text-right font-medium">Tindakan</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} title="Klik dua kali untuk melihat data lengkap" onDoubleClick={() => setDetail(m)}
                className="cursor-pointer border-t border-border-muted hover:bg-highlight/25">
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.code}</td>
                <td className="px-3 py-2">{m.name}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {m.is_active
                    ? <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">Aktif</span>
                    : <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">Nonaktif</span>}
                </td>
                {showActions && (
                  <td className="whitespace-nowrap px-3 py-2 text-right" onDoubleClick={(e) => e.stopPropagation()}>
                    {can('member_kbs', 'u') && <button className="btn-ghost !px-3 !py-1" onClick={() => setForm({ member: m })}>Ubah</button>}
                    {can('member_kbs', 'u') && <button className="btn-ghost !px-3 !py-1" disabled={toggle.isPending} onClick={() => toggle.mutate(m)}>{m.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                    {can('member_kbs', 'd') && <button className="btn-ghost !px-3 !py-1 text-danger" onClick={() => void remove(m)}>Hapus</button>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showActions ? 4 : 3} className="px-4 py-6 text-center text-text-muted">
                {isFetching ? 'Memuat…' : dq || onlyActive ? 'Tidak ada toko yang cocok.' : 'Belum ada data member KBS. Tambah satu per satu atau impor dari file CSV.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        Menampilkan maksimal 200 toko{data && data.matched > rows.length ? ` dari ${data.matched.toLocaleString('id-ID')} hasil` : ''}; persempit dengan kata kunci. Klik dua kali pada baris untuk melihat data lengkap.
        Data ini dipakai pada opsi “Gunakan member toko” di Pengaturan cabang.
      </p>

      {detail && <KbsDetailModal member={detail} canEdit={can('member_kbs', 'u')}
        onEdit={() => { setForm({ member: detail }); setDetail(null) }} onClose={() => setDetail(null)} />}
      {form && <KbsForm member={form.member} onClose={() => setForm(null)} onSaved={refresh} />}
      {importing && <ImportKbsModal onClose={() => setImporting(false)} />}
    </div>
  )
}
