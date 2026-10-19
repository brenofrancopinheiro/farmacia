-- Execute este arquivo uma vez no SQL Editor do Supabase.
alter table public.tickets
  add column if not exists request_details text not null default '' check (char_length(request_details) <= 400);

drop function if exists public.join_queue(text, text);

create function public.join_queue(p_name text, p_topic text, p_details text default '')
returns table (token uuid, ticket_number integer, name text, topic text, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_number integer;
  v_ticket public.tickets;
begin
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 24 then
    raise exception 'Informe um nome entre 2 e 24 caracteres.';
  end if;
  if p_topic not in ('Pedido', 'Preço', 'Entrega', 'Dúvida') then
    raise exception 'Assunto inválido.';
  end if;
  if char_length(trim(p_details)) > 400 then
    raise exception 'Descreva seu pedido em até 400 caracteres.';
  end if;
  update public.venues set next_ticket = next_ticket + 1
  where id = 'farma-original' and not paused
  returning next_ticket - 1 into v_number;
  if v_number is null then raise exception 'A fila está pausada.'; end if;
  insert into public.tickets (venue_id, ticket_number, customer_name, topic, request_details)
  values ('farma-original', v_number, trim(p_name), p_topic, trim(p_details))
  returning * into v_ticket;
  return query select v_ticket.customer_token, v_ticket.ticket_number,
    v_ticket.customer_name, v_ticket.topic, v_ticket.status;
end $$;

grant execute on function public.join_queue(text, text, text) to anon;

drop function if exists public.staff_board(uuid);

create function public.staff_board(p_session uuid)
returns table (ticket_number integer, name text, topic text, request_details text, status text, joined_at timestamptz, paused boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff_sessions where token = p_session and expires_at > now()) then
    raise exception 'Sessão expirada.';
  end if;
  return query select t.ticket_number, t.customer_name, t.topic, t.request_details, t.status, t.joined_at, v.paused
  from public.tickets t join public.venues v on v.id = t.venue_id
  where t.venue_id = 'farma-original' and t.status in ('waiting', 'called')
  order by t.joined_at;
end $$;

grant execute on function public.staff_board(uuid) to anon;
