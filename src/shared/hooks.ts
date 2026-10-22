import { useEffect, useState } from 'react'

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Panggil onIdle bila tidak ada aktivitas selama ms. */
export function useIdle(ms: number, onIdle: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    let t = setTimeout(onIdle, ms)
    const reset = () => { clearTimeout(t); t = setTimeout(onIdle, ms) }
    const ev = ['mousemove', 'keydown', 'click', 'touchstart']
    ev.forEach((e) => window.addEventListener(e, reset))
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, reset)) }
  }, [ms, onIdle, active])
}
