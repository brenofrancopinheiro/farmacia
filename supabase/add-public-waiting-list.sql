-- Execute este arquivo uma vez no SQL Editor do Supabase.
create or replace function public.public_waiting_list()
returns table (ticket_number integer, name text, topic text)
language sql security definer set search_path = public as $$
  select t.ticket_number, split_part(t.customer_name, ' ', 1), t.topic
  from public.tickets t
  where t.venue_id = 'farma-original' and t.status = 'waiting'
  order by t.joined_at, t.ticket_number;
$$;

grant execute on function public.public_waiting_list() to anon;
