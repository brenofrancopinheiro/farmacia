-- Execute este arquivo no SQL Editor do Supabase para corrigir o login da equipe.
create or replace function public.staff_login(p_username text, p_password text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if not exists (
    select 1 from public.venues
    where id = 'farma-original'
      and staff_username = trim(p_username)
      and staff_password_hash = extensions.crypt(p_password, staff_password_hash)
  ) then
    raise exception 'Senha inválida.';
  end if;
  delete from public.staff_sessions where expires_at < now();
  insert into public.staff_sessions (venue_id) values ('farma-original') returning token into v_token;
  return v_token;
end $$;
