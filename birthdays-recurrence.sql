
-- Recurring series and private birth dates. Existing events remain single events.
alter table public.events add column recurrence text not null default 'none' check(recurrence in ('none','daily','weekly','yearly'));
alter table public.events add column time_zone text not null default 'Europe/Amsterdam';
alter table public.events add column all_day boolean not null default false;
alter table public.events add column birthday_user_id uuid unique references auth.users(id) on delete cascade;
alter table public.membership_requests add column birth_date date;
grant insert(birth_date) on public.membership_requests to authenticated;
create table agenda_private.birthdates(user_id uuid primary key references auth.users(id) on delete cascade,birth_date date not null);
alter table agenda_private.birthdates enable row level security;
revoke all on agenda_private.birthdates from public,anon,authenticated;

-- Evaluate only the bounded display window, never materialize an infinite series.
create function agenda_private.event_occurrences(e public.events, window_start timestamptz, window_end timestamptz)
returns table(starts_at timestamptz,ends_at timestamptz) language plpgsql stable security invoker set search_path='' as $$
declare anchor timestamp; finish timestamp; span interval; n integer; lo integer; hi integer; candidate timestamp; step_days integer;
begin
 if window_end<=window_start or window_end-window_start>interval '370 days' then raise exception 'Ongeldige periode'; end if;
 anchor:=e.starts_at at time zone e.time_zone;finish:=e.ends_at at time zone e.time_zone;span:=finish-anchor;
 if e.recurrence='none' then
  if e.starts_at<window_end and e.ends_at>window_start then starts_at:=e.starts_at;ends_at:=e.ends_at;return next;end if;return;
 end if;
 if e.recurrence='yearly' then
  lo:=greatest(0,extract(year from (window_start at time zone e.time_zone)-span)::int-extract(year from anchor)::int-1);
  hi:=extract(year from window_end at time zone e.time_zone)::int-extract(year from anchor)::int+1;
 else
  step_days:=case when e.recurrence='weekly' then 7 else 1 end;
  lo:=greatest(0,floor(extract(epoch from ((window_start at time zone e.time_zone)-span-anchor))/(86400*step_days))::int-1);
  hi:=ceil(extract(epoch from ((window_end at time zone e.time_zone)-anchor))/(86400*step_days))::int+1;
 end if;
 for n in lo..hi loop
  candidate:=anchor+case when e.recurrence='yearly' then make_interval(years=>n) else make_interval(days=>n*step_days) end;
  starts_at:=candidate at time zone e.time_zone;ends_at:=(candidate+span) at time zone e.time_zone;
  -- An ambiguous/nonexistent DST wall time may normalize; preserve a positive duration.
  if ends_at<=starts_at then ends_at:=starts_at+(e.ends_at-e.starts_at);end if;
  if starts_at<window_end and ends_at>window_start then return next;end if;
 end loop;
end;$$;
revoke all on function agenda_private.event_occurrences(public.events,timestamptz,timestamptz) from public,anon;
grant execute on function agenda_private.event_occurrences(public.events,timestamptz,timestamptz) to authenticated;

alter table public.attendance add column occurrence_start timestamptz;
update public.attendance a set occurrence_start=e.starts_at from public.events e where a.event_id=e.id;
alter table public.attendance alter column occurrence_start set not null;
alter table public.attendance drop constraint attendance_pkey;
alter table public.attendance add primary key(event_id,user_id,occurrence_start);

create or replace function agenda_private.set_attendance_name() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ev public.events;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Alleen eigen aanwezigheid';end if;
 select display_name into new.display_name from public.members where email=lower(auth.jwt()->>'email');
 if new.display_name is null then raise exception 'Geen groepslid';end if;
 select * into ev from public.events where id=new.event_id;
 if not found then raise exception 'Geen activiteit';end if;
 new.occurrence_start:=coalesce(new.occurrence_start,ev.starts_at);
 if not exists(select 1 from agenda_private.event_occurrences(ev,new.occurrence_start,new.occurrence_start+interval '1 second') o where o.starts_at=new.occurrence_start) then raise exception 'Geen geldige datum in de reeks';end if;
 return new;
end;$$;

create or replace function agenda_private.set_event_author() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not agenda_private.is_group_member() then raise exception 'Geen groepslid';end if;
 if not exists(select 1 from pg_timezone_names where name=new.time_zone) then raise exception 'Ongeldige tijdzone';end if;
 if new.recurrence<>'none' and (new.ends_at-new.starts_at>interval '31 days' or (new.ends_at at time zone new.time_zone)<=(new.starts_at at time zone new.time_zone)) then raise exception 'Een reeks mag maximaal 31 dagen per activiteit duren';end if;
 if TG_OP='UPDATE' then
  new.created_at:=old.created_at;new.owner_id:=old.owner_id;new.author_name:=old.author_name;new.birthday_user_id:=old.birthday_user_id;
  if old.birthday_user_id is not null then new.starts_at:=old.starts_at;new.ends_at:=old.ends_at;new.recurrence:='yearly';new.time_zone:=old.time_zone;new.all_day:=true;end if;
 else
  if new.birthday_user_id is not null then
   if current_user<>'postgres' then raise exception 'Verjaardagen worden automatisch gemaakt';end if;
  else
   select display_name into new.author_name from public.members where email=lower(auth.jwt()->>'email');
   new.all_day:=false;
  end if;
 end if;
 return new;
end;$$;

-- Existing attendance survives unrelated edits; date/repeat changes invalidate old occurrence registrations.
create function agenda_private.clear_changed_occurrences() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Niet ingelogd';end if;
 if (new.starts_at,new.ends_at,new.recurrence,new.time_zone) is distinct from (old.starts_at,old.ends_at,old.recurrence,old.time_zone) then delete from public.attendance where event_id=new.id;end if;
 return new;
end;$$;
revoke all on function agenda_private.clear_changed_occurrences() from public,anon,authenticated;
create trigger clear_changed_occurrences after update on public.events for each row execute function agenda_private.clear_changed_occurrences();

create function public.calendar_occurrences(window_start timestamptz,window_end timestamptz) returns setof jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not agenda_private.is_group_member() then raise exception 'Geen groepslid';end if;
 if window_end<=window_start or window_end-window_start>interval '370 days' then raise exception 'Maximaal 370 dagen';end if;
 return query select to_jsonb(e)||jsonb_build_object('series_starts_at',e.starts_at,'series_ends_at',e.ends_at,'starts_at',o.starts_at,'ends_at',o.ends_at,'attendance',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name)) from public.attendance a where a.event_id=e.id and a.occurrence_start=o.starts_at),'[]'::jsonb))
 from public.events e cross join lateral agenda_private.event_occurrences(e,window_start,window_end) o order by o.starts_at,e.id;
end;$$;
revoke all on function public.calendar_occurrences(timestamptz,timestamptz) from public,anon;
grant execute on function public.calendar_occurrences(timestamptz,timestamptz) to authenticated;

create function agenda_private.create_birthday(person uuid,dob date,person_name text) returns void
language plpgsql security definer set search_path='' as $$
declare anchor date;
begin
 if auth.uid() is null or not agenda_private.is_admin() then raise exception 'Alleen beheerder';end if;
 if dob is null or dob<date '1900-01-01' or dob>current_date then raise exception 'Vul een geldige geboortedatum in';end if;
 insert into agenda_private.birthdates values(person,dob) on conflict(user_id) do update set birth_date=excluded.birth_date;
 anchor:=make_date(2000,extract(month from dob)::int,extract(day from dob)::int);
 insert into public.events(owner_id,author_name,title,starts_at,ends_at,recurrence,time_zone,all_day,birthday_user_id)
 values(person,person_name,'Verjaardag van '||person_name,anchor::timestamp at time zone 'Europe/Amsterdam',(anchor+1)::timestamp at time zone 'Europe/Amsterdam','yearly','Europe/Amsterdam',true,person)
 on conflict(birthday_user_id) do nothing;
end;$$;
revoke all on function agenda_private.create_birthday(uuid,date,text) from public,anon,authenticated;

create or replace function agenda_private.guard_membership_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
 if auth.uid() is null then raise exception 'Niet ingelogd';end if;
 if TG_OP='INSERT' then
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if verified_email is null or new.user_id<>auth.uid() or new.email<>verified_email then raise exception 'Bevestig eerst je e-mailadres';end if;
  if exists(select 1 from public.members where email=verified_email) then raise exception 'Je bent al groepslid';end if;
  if new.birth_date is null or new.birth_date<date '1900-01-01' or new.birth_date>current_date then raise exception 'Vul een geldige geboortedatum in';end if;
  new.status:='pending';new.created_at:=now();new.reviewed_at:=null;new.reviewed_by:=null;new.notification_sent_at:=null;new.notification_attempt_at:=null;
 else
  if not agenda_private.is_admin() or old.status<>'pending' or new.status not in ('approved','rejected') then raise exception 'Alleen beheerder kan beoordelen';end if;
  new.user_id:=old.user_id;new.email:=old.email;new.display_name:=old.display_name;new.birth_date:=old.birth_date;new.created_at:=old.created_at;
  new.reviewed_at:=now();new.reviewed_by:=auth.uid();new.notification_sent_at:=old.notification_sent_at;new.notification_attempt_at:=old.notification_attempt_at;
  if new.status='approved' then
   insert into public.members(email,display_name,is_admin) values(old.email,old.display_name,false) on conflict(email) do nothing;
   perform agenda_private.create_birthday(old.user_id,old.birth_date,old.display_name);
  end if;
 end if;
 return new;
end;$$;

create policy "Geen directe toegang" on agenda_private.birthdates for all to authenticated using(false) with check(false);
