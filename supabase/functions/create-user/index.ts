// Edge Function: buat akun login + profil. BELUM DIUJI di Supabase (diuji hanya logikanya secara manual).
// Kunci service_role disediakan otomatis oleh Supabase sebagai env SUPABASE_SERVICE_ROLE_KEY — TIDAK pernah ada di repo/frontend.
import { createClient } from 'npm:@supabase/supabase-js@2'

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? '*' // isi dengan alamat web aplikasi saat produksi
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Metode tidak diizinkan' })

  const auth = req.headers.get('Authorization')
  if (!auth) return json(401, { error: 'Tidak terautentikasi' })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })

  // Hanya yang punya hak users.create (dicek di database atas nama pemanggil)
  const { data: allowed } = await caller.rpc('has_perm', { p_feature: 'users', p_action: 'c' })
  if (allowed !== true) return json(403, { error: 'Anda tidak punya izin membuat pengguna' })
  const { data: me } = await caller.auth.getUser()

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json(400, { error: 'Data tidak valid' }) }
  const full_name = String(b.full_name ?? '').trim(), email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? ''), role_id = String(b.role_id ?? ''), branch_id = String(b.branch_id ?? '')
  if (!full_name || full_name.length > 100) return json(400, { error: 'Nama wajib diisi (maks. 100 karakter)' })
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: 'Email tidak valid' })
  if (password.length < 12 || password.length > 72) return json(400, { error: 'Kata sandi 12–72 karakter' })
  if (!UUID.test(role_id) || !UUID.test(branch_id)) return json(400, { error: 'Role/cabang tidak valid' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: role } = await admin.from('roles').select('name').eq('id', role_id).maybeSingle()
  if (!role) return json(400, { error: 'Role tidak ditemukan' })
  if (role.name === 'superadmin') return json(403, { error: 'Superadmin dibuat manual lewat SQL, bukan dari aplikasi' })
  const { data: branch } = await admin.from('branches').select('id').eq('id', branch_id).eq('is_active', true).maybeSingle()
  if (!branch) return json(400, { error: 'Cabang tidak valid' })

  const { data: created, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (e1 || !created.user) return json(400, { error: /already|registered/i.test(e1?.message ?? '') ? 'Email sudah terdaftar' : 'Gagal membuat akun' })

  const { error: e2 } = await admin.from('profiles').insert({ id: created.user.id, full_name, branch_id, role_id, is_active: true })
  if (e2) { await admin.auth.admin.deleteUser(created.user.id); return json(500, { error: 'Gagal membuat profil; akun dibatalkan' }) }

  await admin.from('audit_log').insert({ actor_id: me.user?.id ?? null, action: 'user.create', entity: 'profiles', entity_id: created.user.id, detail: { email, role: role.name } })
  return json(200, { id: created.user.id })
})
