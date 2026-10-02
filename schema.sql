-- Eenmalig uitvoeren in de Supabase SQL Editor, als eigenaar van het project.
begin;
create schema agenda_private;
revoke all on schema agenda_private from public, anon, authenticated;
grant usage on schema agenda_private to authenticated;

create table public.members (
  email text primary key check (email = lower(trim(email))),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80)
);
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;
create policy "Leden zien hun eigen lidmaatschap" on public.members
  for select to authenticated using ((select auth.uid()) is not null and email = lower((select auth.jwt()) ->> 'email'));

create function agenda_private.is_group_member() returns boolean
language sql stable security invoker set search_path = ''
as $$ select (select auth.uid()) is not null and exists(select 1 from public.members where email = lower((select auth.jwt()) ->> 'email')); $$;
revoke all on function agenda_private.is_group_member() from public, anon;
grant execute on function agenda_private.is_group_member() to authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null,
  title text not null check (char_length(trim(title)) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  location text not null default '' check (char_length(location) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now()
);
create index events_starts_at_idx on public.events(starts_at);
create index events_owner_id_idx on public.events(owner_id);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;

create policy "Groepsleden lezen activiteiten" on public.events
  for select to authenticated using ((select agenda_private.is_group_member()));
create policy "Groepsleden voegen eigen activiteiten toe" on public.events
  for insert to authenticated with check ((select agenda_private.is_group_member()) and owner_id = (select auth.uid()));
create policy "Groepsleden wijzigen eigen activiteiten" on public.events
  for update to authenticated using ((select agenda_private.is_group_member()) and owner_id = (select auth.uid()))
  with check ((select agenda_private.is_group_member()) and owner_id = (select auth.uid()));
create policy "Groepsleden verwijderen eigen activiteiten" on public.events
  for delete to authenticated using ((select agenda_private.is_group_member()) and owner_id = (select auth.uid()));

-- Auteur wordt door de database bepaald, nooit vertrouwd uit de browser.
create function agenda_private.set_event_author() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  select display_name into new.author_name from public.members
    where email = lower(auth.jwt() ->> 'email');
  if new.author_name is null then raise exception 'Geen groepslid'; end if;
  if TG_OP = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function agenda_private.set_event_author() from public, anon, authenticated;
create trigger set_event_author before insert or update on public.events
  for each row execute function agenda_private.set_event_author();
commit;

-- Voeg daarna leden toe in de SQL Editor. Gebruik echte e-mailadressen:
-- insert into public.members (email, display_name) values
--   ('jij@voorbeeld.nl', 'Jij'),
--   ('vriend@voorbeeld.nl', 'Vriend')
-- on conflict (email) do update set display_name = excluded.display_name;

-- Toegang intrekken (activiteiten blijven bewaard):
-- delete from public.members where email = 'vriend@voorbeeld.nl';
