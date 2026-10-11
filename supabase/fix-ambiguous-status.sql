-- Execute este arquivo no SQL Editor do Supabase para corrigir a leitura da senha.
create or replace function public.get_customer_ticket(p_token uuid)
returns table (ticket_number integer, name text, topic text, status text, queue_position integer, eta_minutes integer)
language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.tickets;
  v_ahead integer;
  v_minutes integer;
begin
  select * into v_ticket from public.tickets where customer_token = p_token;
  if not found then raise exception 'Senha não encontrada.'; end if;
  select minutes_per_ticket into v_minutes from public.venues where id = v_ticket.venue_id;
  select count(*) into v_ahead from public.tickets as t
    where t.venue_id = v_ticket.venue_id and t.status = 'waiting'
    and (t.joined_at < v_ticket.joined_at or (t.joined_at = v_ticket.joined_at and t.ticket_number < v_ticket.ticket_number));
  return query select v_ticket.ticket_number, v_ticket.customer_name, v_ticket.topic, v_ticket.status,
    case when v_ticket.status = 'waiting' then v_ahead + 1 else null end,
    case when v_ticket.status = 'waiting' then (v_ahead + 1) * v_minutes else 0 end;
end $$;
