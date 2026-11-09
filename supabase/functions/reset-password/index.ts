// Edge Function: HANYA superadmin yang boleh mereset kata sandi user mana pun (semua role). BELUM DIUJI di Supabase.
// Kunci service_role disediakan otomatis oleh Supabase (env SUPABASE_SERVICE_ROLE_KEY); tidak ada di repo/frontend.
import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS: hanya origin aplikasi yang dilayani. Isi secret ALLOWED_ORIGIN (mis. https://pos.takom.id);
// beberapa origin dipisah koma. Bila secret belum diisi, fungsi MENOLAK permintaan (fail-closed) —
// bukan lagi diam-diam terbuka untuk semua situs seperti default '*'.
const ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const cors: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
  if (origin && ALLOWED.includes(origin)) cors['Access-Control-Allow-Origin'] = origin
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (ALLOWED.length === 0) return json(503, { error: 'Server belum dikonfigurasi: secret ALLOWED_ORIGIN belum diisi' })
  if (origin && !ALLOWED.includes(origin)) return json(403, { error: 'Origin tidak diizinkan' })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Metode tidak diizinkan' })

  const auth = req.headers.get('Authorization')
  if (!auth) return json(401, { error: 'Tidak terautentikasi' })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: me } = await caller.auth.getUser()
  if (!me.user) return json(401, { error: 'Tidak terautentikasi' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Hanya superadmin aktif (dicek langsung ke database, bukan dari klaim di token)
  const { data: who } = await admin.from('profiles').select('is_active, roles(name)').eq('id', me.user.id).maybeSingle()
  const roleName = (who as { roles?: { name?: string } | null } | null)?.roles?.name
  if (!who?.is_active || roleName !== 'superadmin') return json(403, { error: 'Hanya superadmin yang boleh mereset kata sandi' })

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json(400, { error: 'Data tidak valid' }) }
  const user_id = String(b.user_id ?? ''), password = String(b.password ?? '')
  if (!UUID.test(user_id)) return json(400, { error: 'Pengguna tidak valid' })
  if (password.length < 12 || password.length > 72) return json(400, { error: 'Kata sandi 12–72 karakter' })

  const { data: target } = await admin.from('profiles').select('id, full_name').eq('id', user_id).maybeSingle()
  if (!target) return json(404, { error: 'Pengguna tidak ditemukan' })

  const { error: e1 } = await admin.auth.admin.updateUserById(user_id, { password })
  if (e1) return json(400, { error: 'Gagal mengganti kata sandi' })

  const { error: e2 } = await admin.rpc('revoke_user_sessions', { p_user: user_id }) // keluarkan sesi lama
  await admin.from('audit_log').insert({ actor_id: me.user.id, action: 'user.password_reset', entity: 'profiles', entity_id: user_id, detail: { sessions_revoked: !e2 } }) // password TIDAK dicatat
  return json(200, { ok: true, sessions_revoked: !e2 })
})
