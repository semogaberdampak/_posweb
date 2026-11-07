-- Migrasi 006: semua akun BARU wajib berakhiran @takom.id (dijaga langsung di database).
-- Tidak mengubah akun yang sudah ada. Ganti domain: ubah teks 'takom\.id' di bawah lalu jalankan ulang file ini
-- (dan samakan dengan EMAIL_DOMAIN di Edge Function create-user serta konstanta di LoginPage/users api).
create or replace function enforce_email_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and lower(new.email) !~ '^[a-z0-9._+-]+@takom\.id$' then
    raise exception 'Email harus berakhiran @takom.id';
  end if;
  return new;
end $$;

drop trigger if exists enforce_email_domain on auth.users;
create trigger enforce_email_domain before insert on auth.users
  for each row execute function enforce_email_domain();
