-- Execute este arquivo no SQL Editor do Supabase uma única vez.
-- Troque 'farma2026' por uma senha forte antes de executar em produção.

create extension if not exists pgcrypto;

create table if not exists public.venues (
  id text primary key,
  name text not null,
  minutes_per_ticket integer not null default 6,
  paused boolean not null default false,
  next_ticket integer not null default 1,
  staff_username text not null default 'atendimento',
  staff_password_hash text not null
);

insert into public.venues (id, name, staff_password_hash)
values ('farma-original', 'Farma Original', crypt('@farma2026A', gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id),
  customer_token uuid not null unique default gen_random_uuid(),
  ticket_number integer not null,
  customer_name text not null check (char_length(customer_name) between 2 and 24),
  customer_phone text not null,
  topic text not null check (topic in ('Pedido', 'Preço', 'Entrega', 'Dúvida')),
  request_details text not null default '' check (char_length(request_details) <= 400),
  status text not null default 'waiting' check (status in ('waiting', 'called', 'done', 'left')),
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  completed_at timestamptz
);

create unique index if not exists tickets_number_per_venue
  on public.tickets (venue_id, ticket_number);

create table if not exists public.staff_sessions (
  token uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id),
  expires_at timestamptz not null default now() + interval '12 hours'
);

alter table public.venues enable row level security;
alter table public.tickets enable row level security;
alter table public.staff_sessions enable row level security;

-- Nenhuma tabela é exposta diretamente ao navegador. O acesso ocorre apenas
-- pelas funções abaixo, que retornam o mínimo de dados necessário.

create or replace function public.join_queue(p_name text, p_phone text, p_topic text, p_details text default '')
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
  if char_length(regexp_replace(p_phone, '\\D', '', 'g')) < 10 then
    raise exception 'Informe um WhatsApp válido com DDD.';
  end if;
  if char_length(trim(p_details)) > 400 then
    raise exception 'Descreva seu pedido em até 400 caracteres.';
  end if;
  update public.venues set next_ticket = next_ticket + 1
  where id = 'farma-original' and not paused
  returning next_ticket - 1 into v_number;
  if v_number is null then raise exception 'A fila está pausada.'; end if;
  insert into public.tickets (venue_id, ticket_number, customer_name, customer_phone, topic, request_details)
  values ('farma-original', v_number, trim(p_name), regexp_replace(p_phone, '\\D', '', 'g'), p_topic, trim(p_details))
  returning * into v_ticket;
  return query select v_ticket.customer_token, v_ticket.ticket_number,
    v_ticket.customer_name, v_ticket.topic, v_ticket.status;
end $$;

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

create or replace function public.public_queue_board()
returns table (waiting_count integer, eta_minutes integer, serving_number integer, serving_name text, serving_topic text, paused boolean)
language sql security definer set search_path = public as $$
  select
    (select count(*)::integer from public.tickets t where t.venue_id = v.id and t.status = 'waiting'),
    (select count(*)::integer from public.tickets t where t.venue_id = v.id and t.status = 'waiting') * v.minutes_per_ticket,
    (select t.ticket_number from public.tickets t where t.venue_id = v.id and t.status = 'called' order by t.called_at desc limit 1),
    (select t.customer_name from public.tickets t where t.venue_id = v.id and t.status = 'called' order by t.called_at desc limit 1),
    (select t.topic from public.tickets t where t.venue_id = v.id and t.status = 'called' order by t.called_at desc limit 1),
    v.paused
  from public.venues v where v.id = 'farma-original';
$$;

create or replace function public.public_waiting_list()
returns table (ticket_number integer, name text, topic text)
language sql security definer set search_path = public as $$
  select t.ticket_number, split_part(t.customer_name, ' ', 1), t.topic
  from public.tickets t
  where t.venue_id = 'farma-original' and t.status = 'waiting'
  order by t.joined_at, t.ticket_number;
$$;

create or replace function public.staff_login(p_username text, p_password text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if not exists (select 1 from public.venues where id = 'farma-original' and staff_username = trim(p_username) and staff_password_hash = extensions.crypt(p_password, staff_password_hash)) then
    raise exception 'Senha inválida.';
  end if;
  delete from public.staff_sessions where expires_at < now();
  insert into public.staff_sessions (venue_id) values ('farma-original') returning token into v_token;
  return v_token;
end $$;

create or replace function public.staff_board(p_session uuid)
returns table (ticket_number integer, name text, topic text, request_details text, customer_phone text, status text, joined_at timestamptz, paused boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff_sessions where token = p_session and expires_at > now()) then
    raise exception 'Sessão expirada.';
  end if;
  return query select t.ticket_number, t.customer_name, t.topic, t.request_details, t.customer_phone, t.status, t.joined_at, v.paused
  from public.tickets t join public.venues v on v.id = t.venue_id
  where t.venue_id = 'farma-original' and t.status in ('waiting', 'called')
  order by t.joined_at;
end $$;

create or replace function public.staff_call_next(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ticket uuid;
begin
  if not exists (select 1 from public.staff_sessions where token = p_session and expires_at > now()) then raise exception 'Sessão expirada.'; end if;
  update public.tickets set status = 'done', completed_at = now() where venue_id = 'farma-original' and status = 'called';
  select id into v_ticket from public.tickets where venue_id = 'farma-original' and status = 'waiting' order by joined_at limit 1;
  if v_ticket is null then raise exception 'Não há pessoas aguardando.'; end if;
  update public.tickets set status = 'called', called_at = now() where id = v_ticket;
end $$;

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

create or replace function public.staff_toggle_pause(p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_paused boolean;
begin
  if not exists (select 1 from public.staff_sessions where token = p_session and expires_at > now()) then raise exception 'Sessão expirada.'; end if;
  update public.venues set paused = not paused where id = 'farma-original' returning paused into v_paused;
  return v_paused;
end $$;

grant execute on function public.join_queue(text, text) to anon;
grant execute on function public.get_customer_ticket(uuid) to anon;
grant execute on function public.public_queue_board() to anon;
grant execute on function public.public_waiting_list() to anon;
grant execute on function public.staff_login(text, text) to anon;
grant execute on function public.staff_board(uuid) to anon;
grant execute on function public.staff_call_next(uuid) to anon;
grant execute on function public.staff_complete(uuid, integer) to anon;
grant execute on function public.staff_toggle_pause(uuid) to anon;
