import { useEffect, useRef, useState } from 'react'

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

/** Tinggi elemen (px) yang terus diperbarui saat jendela / zoom browser berubah. */
export function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, h] as const
}
