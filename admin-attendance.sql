-- Aanvulling op schema.sql. Voor het bestaande project al door Codex toegepast.
alter table public.members add column is_admin boolean not null default false;

create function agenda_private.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.members where email = lower((select auth.jwt())->>'email') and is_admin
  );
$$;
revoke all on function agenda_private.is_admin() from public, anon;
grant execute on function agenda_private.is_admin() to authenticated;

drop policy "Groepsleden wijzigen eigen activiteiten" on public.events;
create policy "Eigenaar of beheerder wijzigt activiteiten" on public.events
for update to authenticated
using ((select agenda_private.is_group_member()) and (owner_id = (select auth.uid()) or (select agenda_private.is_admin())))
with check ((select agenda_private.is_group_member()) and (owner_id = (select auth.uid()) or (select agenda_private.is_admin())));
drop policy "Groepsleden verwijderen eigen activiteiten" on public.events;
create policy "Eigenaar of beheerder verwijdert activiteiten" on public.events
for delete to authenticated
using ((select agenda_private.is_group_member()) and (owner_id = (select auth.uid()) or (select agenda_private.is_admin())));

create or replace function agenda_private.set_event_author() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not agenda_private.is_group_member() then raise exception 'Geen groepslid'; end if;
  if TG_OP = 'UPDATE' then
    new.created_at := old.created_at;
    new.owner_id := old.owner_id;
    new.author_name := old.author_name;
  else
    select display_name into new.author_name from public.members where email = lower(auth.jwt()->>'email');
  end if;
  return new;
end;
$$;

create table public.attendance (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null,
  primary key (event_id,user_id)
);
create index attendance_user_id_idx on public.attendance(user_id);
alter table public.attendance enable row level security;
revoke all on public.attendance from anon,authenticated;
grant select,insert,delete on public.attendance to authenticated;
create policy "Groepsleden lezen aanwezigen" on public.attendance for select to authenticated
using ((select agenda_private.is_group_member()));
create policy "Groepsleden melden zichzelf aan" on public.attendance for insert to authenticated
with check ((select agenda_private.is_group_member()) and user_id = (select auth.uid()));
create policy "Groepsleden melden zichzelf af" on public.attendance for delete to authenticated
using ((select agenda_private.is_group_member()) and user_id = (select auth.uid()));
create function agenda_private.set_attendance_name() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Alleen eigen aanwezigheid'; end if;
  select display_name into new.display_name from public.members where email = lower(auth.jwt()->>'email');
  if new.display_name is null then raise exception 'Geen groepslid'; end if;
  return new;
end;
$$;
revoke all on function agenda_private.set_attendance_name() from public,anon,authenticated;
create trigger set_attendance_name before insert on public.attendance
for each row execute function agenda_private.set_attendance_name();
