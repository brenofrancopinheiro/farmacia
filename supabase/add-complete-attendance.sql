-- Execute este arquivo uma vez no SQL Editor do Supabase.
create or replace function public.staff_complete(p_session uuid, p_ticket_number integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff_sessions where token = p_session and expires_at > now()) then
    raise exception 'Sessão expirada.';
  end if;
  update public.tickets
  set status = 'done', completed_at = now()
  where venue_id = 'farma-original' and ticket_number = p_ticket_number and status = 'called';
  if not found then raise exception 'Esse atendimento não está mais em conversa.'; end if;
end $$;

grant execute on function public.staff_complete(uuid, integer) to anon;
