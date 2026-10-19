-- Execute uma vez no SQL Editor do Supabase.
-- Mantém ticket_number apenas como ordem interna da fila; o cliente vê ticket_code.
alter table public.tickets add column if not exists ticket_code text;

create or replace function public.new_ticket_code()
returns text language plpgsql volatile as $$
declare v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || lpad((floor(random() * 100)::integer)::text, 2, '0');
    exit when not exists (select 1 from public.tickets where ticket_code = v_code);
  end loop;
  return v_code;
end $$;

update public.tickets set ticket_code = public.new_ticket_code() where ticket_code is null;
alter table public.tickets alter column ticket_code set not null;
create unique index if not exists tickets_code_per_venue on public.tickets (venue_id, ticket_code);

drop function if exists public.join_queue(text, text, text, text);
create function public.join_queue(p_name text, p_phone text, p_topic text, p_details text default '')
returns table (token uuid, ticket_number integer, ticket_code text, name text, topic text, status text)
language plpgsql security definer set search_path = public as $$
declare v_number integer; v_ticket public.tickets;
begin
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 24 then raise exception 'Informe um nome entre 2 e 24 caracteres.'; end if;
  if p_topic not in ('Pedido', 'Preço', 'Entrega', 'Dúvida') then raise exception 'Assunto inválido.'; end if;
  if char_length(regexp_replace(p_phone, '\D', '', 'g')) < 10 then raise exception 'Informe um WhatsApp válido com DDD.'; end if;
  if char_length(trim(p_details)) > 400 then raise exception 'Descreva seu pedido em até 400 caracteres.'; end if;
  update public.venues set next_ticket = next_ticket + 1 where id = 'farma-original' and not paused returning next_ticket - 1 into v_number;
  if v_number is null then raise exception 'A fila está pausada.'; end if;
  insert into public.tickets (venue_id, ticket_number, ticket_code, customer_name, customer_phone, topic, request_details)
  values ('farma-original', v_number, public.new_ticket_code(), trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), p_topic, trim(p_details)) returning * into v_ticket;
  return query select v_ticket.customer_token, v_ticket.ticket_number, v_ticket.ticket_code, v_ticket.customer_name, v_ticket.topic, v_ticket.status;
end $$;

drop function if exists public.get_customer_ticket(uuid);
create function public.get_customer_ticket(p_token uuid)
returns table (ticket_number integer, ticket_code text, name text, topic text, status text, queue_position integer, eta_minutes integer)
language plpgsql security definer set search_path = public as $$
declare v_ticket public.tickets; v_ahead integer; v_minutes integer;
begin
  select * into v_ticket from public.tickets where customer_token = p_token;
  if not found then raise exception 'Senha não encontrada.'; end if;
  select minutes_per_ticket into v_minutes from public.venues where id = v_ticket.venue_id;
  select count(*) into v_ahead from public.tickets t where t.venue_id = v_ticket.venue_id and t.status = 'waiting' and (t.joined_at < v_ticket.joined_at or (t.joined_at = v_ticket.joined_at and t.ticket_number < v_ticket.ticket_number));
  return query select v_ticket.ticket_number, v_ticket.ticket_code, v_ticket.customer_name, v_ticket.topic, v_ticket.status, case when v_ticket.status = 'waiting' then v_ahead + 1 else null end, case when v_ticket.status = 'waiting' then (v_ahead + 1) * v_minutes else 0 end;
end $$;

drop function if exists public.public_queue_board();
create function public.public_queue_board()
returns table (waiting_count integer, eta_minutes integer, serving_code text, serving_name text, serving_topic text, paused boolean)
language sql security definer set search_path = public as $$ select (select count(*)::integer from public.tickets t where t.venue_id=v.id and t.status='waiting'), (select count(*)::integer from public.tickets t where t.venue_id=v.id and t.status='waiting') * v.minutes_per_ticket, (select t.ticket_code from public.tickets t where t.venue_id=v.id and t.status='called' order by t.called_at desc limit 1), (select t.customer_name from public.tickets t where t.venue_id=v.id and t.status='called' order by t.called_at desc limit 1), (select t.topic from public.tickets t where t.venue_id=v.id and t.status='called' order by t.called_at desc limit 1), v.paused from public.venues v where v.id='farma-original'; $$;

drop function if exists public.public_waiting_list();
create function public.public_waiting_list() returns table (ticket_code text, name text, topic text) language sql security definer set search_path = public as $$ select t.ticket_code, split_part(t.customer_name, ' ', 1), t.topic from public.tickets t where t.venue_id='farma-original' and t.status='waiting' order by t.joined_at, t.ticket_number; $$;

drop function if exists public.staff_board(uuid);
create function public.staff_board(p_session uuid) returns table (ticket_number integer, ticket_code text, name text, topic text, request_details text, customer_phone text, status text, joined_at timestamptz, paused boolean) language plpgsql security definer set search_path = public as $$ begin if not exists (select 1 from public.staff_sessions where token=p_session and expires_at>now()) then raise exception 'Sessão expirada.'; end if; return query select t.ticket_number, t.ticket_code, t.customer_name, t.topic, t.request_details, t.customer_phone, t.status, t.joined_at, v.paused from public.tickets t join public.venues v on v.id=t.venue_id where t.venue_id='farma-original' and t.status in ('waiting','called') order by t.joined_at; end $$;

grant execute on function public.join_queue(text, text, text, text), public.get_customer_ticket(uuid), public.public_queue_board(), public.public_waiting_list(), public.staff_board(uuid) to anon;
