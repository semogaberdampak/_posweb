-- Migrasi 024: PENGATURAN GLOBAL + URUTAN MENU SIDEBAR.
-- Tabel app_settings menyimpan pengaturan yang dipakai SEMUA user (bukan per komputer).
--   * Semua user login boleh MEMBACA (sidebar perlu urutannya).
--   * Penulisan HANYA lewat RPC `save_nav_order` dan HANYA superadmin.
-- Urutan disimpan sebagai array path menu, mis. ["/pos","/produk",...].
-- Aman diulang.

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
drop policy if exists app_settings_r on app_settings;
create policy app_settings_r on app_settings for select to authenticated using (true);
revoke all on app_settings from anon, authenticated;
grant select on app_settings to authenticated;

create or replace function save_nav_order(p_order jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int; v_seen text[] := '{}'; v_item text;
begin
  if not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_order is null or jsonb_typeof(p_order) <> 'array' then raise exception 'urutan menu tidak valid'; end if;
  v_n := jsonb_array_length(p_order);
  if v_n > 50 then raise exception 'terlalu banyak menu dalam urutan'; end if;

  for i in 0 .. v_n - 1 loop
    v_item := p_order->>i;
    if v_item is null or v_item !~ '^/[a-z0-9-]{1,60}$' then
      raise exception 'alamat menu tidak valid: %', coalesce(v_item, '(kosong)');
    end if;
    if v_item = any(v_seen) then raise exception 'alamat menu ganda: %', v_item; end if;
    v_seen := v_seen || v_item;
  end loop;

  insert into app_settings(key, value, updated_by, updated_at)
  values ('nav_order', p_order, auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  insert into audit_log(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), 'settings.nav_order', 'app_settings', 'nav_order',
          jsonb_build_object('order', p_order));
end $$;

revoke all on function save_nav_order(jsonb) from public, anon;
grant execute on function save_nav_order(jsonb) to authenticated;
