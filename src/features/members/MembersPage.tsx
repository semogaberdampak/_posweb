import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload } from 'lucide-react'
import { deleteMember, draftOf, listMembers, saveMember, type Member } from './api'
import { MemberForm } from './MemberForm'
import { ExtendMemberModal } from './ExtendMemberModal'
import { ActiveCountdown } from './ActiveCountdown'
import { ImportMembersModal } from './ImportMembersModal'
import { useAuth } from '../auth/AuthProvider'
import { useDebounced } from '../../shared/hooks'
import { rupiah } from '../../shared/format'

export default function MembersPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [onlyActive, setOnlyActive] = useState(false)
  const [form, setForm] = useState<{ member: Member | null } | null>(null)
  const [extend, setExtend] = useState<Member | null>(null)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const showActions = can('members', 'u') || can('members', 'd')

  const { data = [], isFetching, isError } = useQuery({
    queryKey: ['members', dq, onlyActive], queryFn: () => listMembers(dq, onlyActive), placeholderData: keepPreviousData,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['members'] })

  const toggle = useMutation({
    mutationFn: (m: Member) => saveMember({ ...draftOf(m), is_active: !m.is_active }),
    onSuccess: () => { setMsg(''); refresh() },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Gagal mengubah status.'),
  })

  async function remove(m: Member) {
    if (!window.confirm(`Hapus member ${m.member_no} - ${m.name}? Bila sudah pernah dipakai transaksi, nonaktifkan saja.`)) return
    try { await deleteMember(m.id); setMsg(''); refresh() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Gagal menghapus.') }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-xl font-semibold">Membership</h1>
        <input className="input !w-64" placeholder="Cari nomor ID / nama / kota" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> hanya aktif
        </label>
        <div className="ml-auto flex items-center gap-2">
          {can('members', 'c') && <button className="btn-ghost flex items-center gap-1" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Impor CSV</button>}
          {can('members', 'c') && <button className="btn-primary flex items-center gap-1" onClick={() => setForm({ member: null })}><Plus className="h-4 w-4" />Tambah member</button>}
        </div>
      </div>

      {msg && <p role="alert" className="rounded-2xl bg-danger/20 px-4 py-2 text-sm text-danger">{msg}</p>}
      {isError && <p role="alert" className="rounded-2xl bg-danger/20 px-4 py-2 text-sm text-danger">Gagal memuat data member.</p>}

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-muted bg-bg-light">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-dark text-left text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Cust ID</th>
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Lembaga</th>
              <th className="px-3 py-2 font-medium">Kota</th>
              <th className="px-3 py-2 font-medium">Telp. / Sellular</th>
              <th className="px-3 py-2 font-medium">Segment</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Masa aktif</th>
              {showActions && <th className="px-3 py-2 text-right font-medium">Tindakan</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.id} className="border-t border-border-muted hover:bg-highlight/25">
                <td className="whitespace-nowrap px-3 py-2 font-mono">{m.member_no}</td>
                <td className="px-3 py-2">{m.name}</td>
                <td className="max-w-[16rem] truncate px-3 py-2 text-text-muted" title={m.institution ?? ''}>{m.institution ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{m.city ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{[m.phone, m.mobile].filter(Boolean).join(' / ') || '—'}</td>
                <td className="max-w-[12rem] truncate px-3 py-2" title={[m.segment, m.segment_detail].filter(Boolean).join(' · ')}>
                  {[m.segment, m.segment_detail].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{m.balance ? rupiah(Number(m.balance)) : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {m.is_active
                    ? <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">Aktif</span>
                    : <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">Nonaktif</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <ActiveCountdown until={m.active_until} />
                  {m.active_until && <div className="text-xs text-text-muted">s/d {m.active_until}</div>}
                </td>
                {showActions && (
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {can('members', 'u') && <button className="btn-ghost !px-3 !py-1" onClick={() => setForm({ member: m })}>Ubah</button>}
                    {can('members', 'u') && <button className="btn-ghost !px-3 !py-1" onClick={() => setExtend(m)}>Perpanjang</button>}
                    {can('members', 'u') && <button className="btn-ghost !px-3 !py-1" disabled={toggle.isPending} onClick={() => toggle.mutate(m)}>{m.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>}
                    {can('members', 'd') && <button className="btn-ghost !px-3 !py-1 text-danger" onClick={() => void remove(m)}>Hapus</button>}
                  </td>
                )}
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={showActions ? 10 : 9} className="px-4 py-6 text-center text-text-muted">
                {isFetching ? 'Memuat…' : dq ? 'Tidak ada member yang cocok.' : 'Belum ada data member. Tambah satu per satu atau impor dari file CSV.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        Menampilkan maksimal 200 member; persempit dengan kata kunci. Nomor ID disimpan kapital dan harus unik.
        {can('members', 'c') && ' Impor CSV: kolom Cust ID, Nama, Lembaga, Alamat, Kota, Propinsi, Telp., Sellular, Segment, Segment Detail, Balance.'}
      </p>

      {form && <MemberForm member={form.member} onClose={() => setForm(null)} onSaved={refresh} />}
      {extend && <ExtendMemberModal member={extend} onClose={() => setExtend(null)} onSaved={refresh} />}
      {importing && <ImportMembersModal canOverwrite={can('members', 'u')} onClose={() => setImporting(false)} />}
    </div>
  )
}
