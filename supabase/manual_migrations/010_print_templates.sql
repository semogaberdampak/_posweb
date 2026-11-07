-- Migrasi 010: format cetak (struk 80mm & nota A4) yang bisa diedit admin.
-- Semua user login boleh MEMBACA (kasir perlu untuk mencetak); hanya superadmin yang bisa MENULIS (lewat RPC).
create table if not exists print_templates (
  kind       text primary key check (kind in ('receipt','invoice')),
  config     jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table print_templates enable row level security;
drop policy if exists print_templates_r on print_templates;
create policy print_templates_r on print_templates for select to authenticated using (true);
revoke all on print_templates from anon, authenticated;
grant select on print_templates to authenticated;

create or replace function save_print_template(p_kind text, p_config jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _is_superadmin(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('receipt','invoice') then raise exception 'jenis format tidak valid'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'isi format tidak valid'; end if;
  if length(p_config::text) > 20000 then raise exception 'format terlalu besar'; end if;
  insert into print_templates(kind, config, updated_by, updated_at) values (p_kind, p_config, auth.uid(), now())
  on conflict (kind) do update set config = excluded.config, updated_by = excluded.updated_by, updated_at = now();
  insert into audit_log(actor_id, action, entity, entity_id) values (auth.uid(), 'print_template.save', 'print_templates', p_kind);
end $$;
revoke all on function save_print_template(text, jsonb) from public, anon;
grant execute on function save_print_template(text, jsonb) to authenticated;
