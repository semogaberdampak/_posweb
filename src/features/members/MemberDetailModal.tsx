import type { ReactNode } from 'react'
import { Modal } from '../../shared/Modal'
import { rupiah } from '../../shared/format'
import type { Member } from './api'

const tgl = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '—'

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-muted py-1.5 last:border-0">
      <span className="w-40 shrink-0 text-text-muted">{k}</span>
      <span className="min-w-0 flex-1 break-words">{v || '—'}</span>
    </div>
  )
}

/** Rincian lengkap satu member (semua kolom CSV), dibuka dengan klik dua kali pada baris tabel. */
export function MemberDetailModal({ member, canEdit, onEdit, onClose }: {
  member: Member; canEdit: boolean; onEdit: () => void; onClose: () => void
}) {
  const period = member.active_from || member.active_until
    ? `${member.active_from ? tgl(member.active_from) : 'tanpa awal'} s/d ${member.active_until ? tgl(member.active_until) : 'tanpa batas'}`
    : 'Tanpa batas'
  return (
    <Modal title="Data lengkap member" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Identitas</p>
          <Row k="Cust ID (nomor member)" v={<span className="font-mono">{member.member_no}</span>} />
          <Row k="Nama" v={member.name} />
          <Row k="Status" v={member.is_active
            ? <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">Aktif</span>
            : <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">Nonaktif</span>} />
          <Row k="Masa aktif" v={period} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Kontak</p>
          <Row k="Lembaga" v={member.institution} />
          <Row k="Alamat" v={member.address} />
          <Row k="Kota" v={member.city} />
          <Row k="Propinsi" v={member.province} />
          <Row k="Telp." v={member.phone} />
          <Row k="Sellular" v={member.mobile} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Segmentasi & saldo</p>
          <Row k="Segment" v={member.segment} />
          <Row k="Segment Detail" v={member.segment_detail} />
          <Row k="Balance (saldo)" v={member.balance ? rupiah(Number(member.balance)) : 'Rp 0'} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Tutup</button>
          {canEdit && <button className="btn-primary" onClick={onEdit}>Ubah data</button>}
        </div>
      </div>
    </Modal>
  )
}
