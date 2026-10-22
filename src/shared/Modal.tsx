import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    // fase capture: Esc menutup modal saja, tidak diteruskan ke halaman di belakangnya
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 print:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`max-h-[90vh] w-full overflow-auto rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-800 ${wide ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={onClose} aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
