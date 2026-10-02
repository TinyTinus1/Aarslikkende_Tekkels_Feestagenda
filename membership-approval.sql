create table public.membership_requests (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 email text not null default lower(auth.jwt()->>'email'),
 display_name text not null check (char_length(trim(display_name)) between 1 and 80),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid,
 notification_sent_at timestamptz, notification_attempt_at timestamptz
);
alter table public.membership_requests enable row level security;
revoke all on public.membership_requests from public,anon,authenticated;
grant select on public.membership_requests to authenticated;
grant insert (display_name) on public.membership_requests to authenticated;
grant update (status) on public.membership_requests to authenticated;
grant all on public.membership_requests to service_role;
create policy "Eigen aanvraag of beheerder" on public.membership_requests for select to authenticated
 using ((select auth.uid()) is not null and (user_id=(select auth.uid()) or (select agenda_private.is_admin())));
create policy "Eigen nieuwe aanvraag" on public.membership_requests for insert to authenticated
 with check (user_id=(select auth.uid()) and email=lower((select auth.jwt())->>'email') and status='pending' and not (select agenda_private.is_group_member()));
create policy "Alleen beheerder beoordeelt" on public.membership_requests for update to authenticated
 using ((select agenda_private.is_admin()) and status='pending')
 with check ((select agenda_private.is_admin()) and status in ('approved','rejected'));
-- Privileged trigger is internal only. Approval must insert into the otherwise read-only members table.
create function agenda_private.guard_membership_request() returns trigger
 language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
 if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
 if TG_OP='INSERT' then
   select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
   if verified_email is null or new.user_id<>auth.uid() or new.email<>verified_email then raise exception 'Bevestig eerst je e-mailadres'; end if;
   if exists(select 1 from public.members where email=verified_email) then raise exception 'Je bent al groepslid'; end if;
   new.status:='pending';new.created_at:=now();new.reviewed_at:=null;new.reviewed_by:=null;new.notification_sent_at:=null;new.notification_attempt_at:=null;
 else
   if not agenda_private.is_admin() or old.status<>'pending' or new.status not in ('approved','rejected') then raise exception 'Alleen beheerder kan beoordelen'; end if;
   new.user_id:=old.user_id;new.email:=old.email;new.display_name:=old.display_name;new.created_at:=old.created_at;
   new.reviewed_at:=now();new.reviewed_by:=auth.uid();new.notification_sent_at:=old.notification_sent_at;new.notification_attempt_at:=old.notification_attempt_at;
   if new.status='approved' then
     insert into public.members(email,display_name,is_admin) values(old.email,old.display_name,false) on conflict(email) do nothing;
   end if;
 end if;
 return new;
end;$$;
revoke all on function agenda_private.guard_membership_request() from public,anon,authenticated;
create trigger membership_request_guard before insert or update of status on public.membership_requests
 for each row execute function agenda_private.guard_membership_request();
-- Mail reservation is service-role-only, idempotent and rate-limited across the project.
create function public.claim_membership_notification(p_user_id uuid) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare claimed uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Geen toegang'; end if;
 perform pg_advisory_xact_lock(428190);
 if (select count(*) from public.membership_requests where notification_attempt_at>now()-interval '1 hour')>=10 then return false; end if;
 update public.membership_requests set notification_attempt_at=now()
 where user_id=p_user_id and status='pending' and notification_sent_at is null
 and (notification_attempt_at is null or notification_attempt_at<now()-interval '1 hour') returning user_id into claimed;
 return claimed is not null;
end;$$;
revoke all on function public.claim_membership_notification(uuid) from public,anon,authenticated;
grant execute on function public.claim_membership_notification(uuid) to service_role;
