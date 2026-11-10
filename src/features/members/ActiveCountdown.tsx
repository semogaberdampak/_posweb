import { useEffect, useState } from 'react'

/** Hitung mundur sisa masa aktif member (diperbarui tiap detik). */
export function ActiveCountdown({ until }: { until: string | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!until) return <span className="text-text-muted">Tanpa batas</span>
  const end = new Date(until + 'T23:59:59').getTime()
  const diff = end - now
  if (diff <= 0) return <span className="text-danger">Habis</span>
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return <span className="font-mono text-xs">{d} hr {h} jam {m} mnt {s} dtk</span>
}