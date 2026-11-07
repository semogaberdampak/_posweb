import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // VITE_BASE kosong = aplikasi di akar domain (Vercel, localhost). Isi "/_posweb/" hanya bila disajikan di subfolder (mis. hosting Apache / GitHub Pages).
  const raw = loadEnv(mode, process.cwd(), 'VITE_').VITE_BASE || '/'
  const base = `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
  return {
    plugins: [react(), tailwindcss()],
    base,
    build: { sourcemap: false }, // jangan publikasikan source map
    // 127.0.0.1 (IPv4): di sebagian Windows port pada alamat IPv6 (::1) diblokir -> "EACCES permission denied ::1:5173"
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1', port: 4173 },
  }
})
