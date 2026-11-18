-- Migrasi 025: PEMBERITAHUAN SISTEM (tombol lonceng di header).
--   * Semua user login boleh MEMBACA pemberitahuan.
--   * Hanya superadmin yang boleh MENULIS / MENGHAPUS, lewat RPC (tidak ada policy tulis di tabel).
-- Pemberitahuan bersifat global (bukan per cabang) dan menyimpan nama penulis agar bisa ditampilkan.
-- Aman diulang.

create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null default '',
  created_by      uuid references auth.users(id),
  created_by_name text,
  created_at      timestamptz not null default now(),
  check (char_length(title) between 1 and 120),
  check (char_length(body) <= 4000)
);
create index if not exists notifications_created_at_idx on notifications (created_at desc);

alter table notifications enable row level security;
drop policy if exists notifications_r on notifications;
create policy notifications_r on notifications for select to authenticated using (true);
revoke all on notifications from anon, authenticated;
grant select on notifications to authenticated;

create or replace function notification_save(p_title text, p_body text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_title text; v_body text; v_name text;
begin
  if not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_title := btrim(coalesce(p_title, ''));
  v_body  := btrim(coalesce(p_body, ''));
  if v_title = '' or length(v_title) > 120 then raise exception 'judul pemberitahuan wajib (maks. 120 huruf)'; end if;
  if length(v_body) > 4000 then raise exception 'isi pemberitahuan terlalu panjang (maks. 4000 huruf)'; end if;
  select full_name into v_name from profiles where id = auth.uid();
  insert into notifications(title, body, created_by, created_by_name)
  values (v_title, v_body, auth.uid(), v_name)
  returning id into v_id;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'notification.create', 'notifications', v_id::text,
          jsonb_build_object('title', v_title));
  return v_id;
end $$;

create or replace function notification_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from notifications where id = p_id returning title into v_title;
  if v_title is null then raise exception 'pemberitahuan tidak ditemukan'; end if;
  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'notification.delete', 'notifications', p_id::text,
          jsonb_build_object('title', v_title));
end $$;

revoke all on function notification_save(text, text) from public, anon;
revoke all on function notification_delete(uuid) from public, anon;
grant execute on function notification_save(text, text), notification_delete(uuid) to authenticated;
