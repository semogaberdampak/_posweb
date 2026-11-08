// Menjalankan server dev di port pertama yang BISA dipakai.
// Di Windows (Hyper-V/WSL/Docker) sebagian rentang port dicadangkan sistem (galat EACCES) dan daftarnya bisa berubah setelah restart,
// jadi port tidak ditetapkan mati. Paksa port tertentu:  npm run dev -- --port 3005
import net from 'node:net'
import { createServer } from 'vite'

const arg = process.argv.indexOf('--port')
const candidates = arg > 0 ? [Number(process.argv[arg + 1])] : [3000, 3001, 3002, 8080, 8081, 5500, 4000, 4001, 9000, 9001]
const host = '127.0.0.1'

const canListen = (port) => new Promise((resolve) => {
  const s = net.createServer()
  s.once('error', () => resolve(false)) // EACCES (port dicadangkan Windows), EADDRINUSE (sedang dipakai), dll.
  s.once('listening', () => s.close(() => resolve(true)))
  s.listen(port, host)
})

let port = null
for (const p of candidates) { if (Number.isInteger(p) && p > 0 && (await canListen(p))) { port = p; break } else console.log(`Port ${p} tidak bisa dipakai, mencoba yang lain…`) }
if (!port) { console.error('Tidak ada port yang bisa dipakai. Coba: npm run dev -- --port 3005'); process.exit(1) }

const server = await createServer({ server: { host, port, strictPort: true } })
await server.listen()
server.printUrls()
console.log(`\nBuka: http://${host}:${port}/`)
