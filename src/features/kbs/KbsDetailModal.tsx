import type { ReactNode } from 'react'
import { Modal } from '../../shared/Modal'
import type { KbsMember } from './api'

const waktu = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB'

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-muted py-1.5 last:border-0">
      <span className="w-32 shrink-0 text-text-muted">{k}</span>
      <span className="min-w-0 flex-1 break-words">{v}</span>
    </div>
  )
}

/** Rincian satu toko KBS, dibuka dengan klik dua kali pada baris tabel. */
export function KbsDetailModal({ member, canEdit, onEdit, onClose }: {
  member: KbsMember; canEdit: boolean; onEdit: () => void; onClose: () => void
}) {
  return (
    <Modal title="Data lengkap member KBS" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <Row k="Kode toko" v={<span className="font-mono">{member.code}</span>} />
          <Row k="Nama toko" v={member.name} />
          <Row k="Status" v={member.is_active
            ? <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">Aktif</span>
            : <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">Nonaktif</span>} />
          <Row k="Ditambahkan" v={waktu(member.created_at)} />
          <Row k="Terakhir diubah" v={waktu(member.updated_at)} />
        </div>
        <p className="rounded-2xl bg-bg-dark px-3 py-2 text-xs text-text-muted">
          File CSV KBS hanya berisi <b>kode</b> dan <b>nama toko</b>; kedua kolom itu (ditambah status aktif)
          adalah seluruh data yang tersimpan dan ditampilkan di sini.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Tutup</button>
          {canEdit && <button className="btn-primary" onClick={onEdit}>Ubah data</button>}
        </div>
      </div>
    </Modal>
  )
}
