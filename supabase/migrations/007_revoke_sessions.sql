-- Migrasi 007: keluarkan semua sesi login seorang user (dipakai Edge Function reset-password setelah kata sandi diganti).
-- HANYA bisa dipanggil oleh service_role (Edge Function), tidak oleh user biasa. Aman diulang.
create or replace function revoke_user_sessions(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke all on function revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function revoke_user_sessions(uuid) to service_role;
