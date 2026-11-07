import { useState } from 'react'

// Pengaturan per KOMPUTER (disimpan di browser komputer itu, bukan di akun): tiap komputer kasir punya printer sendiri.
const K_AUTO = 'pos.autoPrint', K_THERMAL = 'pos.thermalOnly'
const read = (k: string, def: boolean) => { try { const v = localStorage.getItem(k); return v === null ? def : v === '1' } catch { return def } }
const write = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); return true } catch { return false } }

export const getAutoPrint = () => read(K_AUTO, true)          // bawaan: struk tercetak otomatis setelah transaksi
export const setAutoPrint = (v: boolean) => write(K_AUTO, v)
export const getThermalOnly = () => read(K_THERMAL, false)    // true: komputer ini hanya untuk printer thermal -> tombol nota A4 disembunyikan
export const setThermalOnly = (v: boolean) => write(K_THERMAL, v)

export function usePrintPrefs() {
  const [auto, setAuto] = useState(getAutoPrint), [thermalOnly, setThermal] = useState(getThermalOnly)
  return {
    autoPrint: auto, thermalOnly,
    changeAuto: (v: boolean) => { setAutoPrint(v); setAuto(v) },
    changeThermalOnly: (v: boolean) => { setThermalOnly(v); setThermal(v) },
  }
}

/** Menjamin satu transaksi hanya dicetak otomatis sekali (meski komponen dirender ulang). */
export function createPrintGuard() {
  const seen = new Set<string>()
  return { once: (id: string) => (seen.has(id) ? false : (seen.add(id), true)) }
}

type Printer = { print: () => void }
let pending = false
/** Menjadwalkan window.print() setelah lembar cetak selesai dirender. Mengembalikan fungsi pembatal.
 *  - satu cetakan tertunda dalam satu waktu (klik ganda tidak mencetak dua kali)
 *  - shouldPrint dicek TEPAT SEBELUM mencetak (aman terhadap render ganda React StrictMode)
 *  - galat dari print() tidak membuat aplikasi macet */
export function triggerPrint(o: {
  delay?: number; win?: Printer; shouldPrint?: () => boolean; onError?: (e: unknown) => void
  schedule?: (fn: () => void, ms: number) => unknown; cancel?: (h: unknown) => void
} = {}): () => void {
  if (pending) return () => {}
  const schedule = o.schedule ?? ((fn, ms) => setTimeout(fn, ms)), cancel = o.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  pending = true
  const h = schedule(() => {
    pending = false
    if (o.shouldPrint && !o.shouldPrint()) return
    try { (o.win ?? window).print() } catch (e) { o.onError?.(e) }
  }, o.delay ?? 200)
  return () => { if (pending) { pending = false; cancel(h) } }
}
