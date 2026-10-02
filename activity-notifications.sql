
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create table agenda_private.activity_mail_jobs(
 id uuid primary key default gen_random_uuid(),transaction_id bigint not null,recipient text not null,items jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts int not null default 0,created_at timestamptz not null default now(),next_attempt_at timestamptz not null default now(),last_attempt_at timestamptz,lease uuid,sent_at timestamptz,
 unique(transaction_id,recipient));
alter table agenda_private.activity_mail_jobs enable row level security;
revoke all on agenda_private.activity_mail_jobs from public,anon,authenticated;
create index activity_mail_due_idx on agenda_private.activity_mail_jobs(next_attempt_at) where status in ('pending','sending');
create function agenda_private.queue_activity_mail() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not agenda_private.is_group_member() then raise exception 'Geen groepslid';end if;
 if new.birthday_user_id is not null then return new;end if;
 insert into agenda_private.activity_mail_jobs(transaction_id,recipient,items)
 select txid_current(),m.email,jsonb_build_array(jsonb_build_object('id',new.id,'title',new.title,'starts_at',new.starts_at,'location',new.location,'recurrence',new.recurrence,'author_name',new.author_name))
 from public.members m join auth.users u on lower(u.email)=m.email
 where u.email_confirmed_at is not null and u.id<>new.owner_id
 on conflict(transaction_id,recipient) do update set items=agenda_private.activity_mail_jobs.items||excluded.items;
 return new;
end;$$;
revoke all on function agenda_private.queue_activity_mail() from public,anon,authenticated;
create trigger queue_activity_mail after insert on public.events for each row execute function agenda_private.queue_activity_mail();
create function agenda_private.claim_activity_mail() returns setof jsonb language plpgsql security definer set search_path='' as $$
declare job agenda_private.activity_mail_jobs; remaining int; valid_items jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Geen toegang';end if;
 perform pg_advisory_xact_lock(428192);
 remaining:=least(5,100-(select count(*) from agenda_private.activity_mail_jobs where last_attempt_at>now()-interval '1 day'));
 if remaining<=0 then return;end if;
 for job in select * from agenda_private.activity_mail_jobs where ((status='pending' and next_attempt_at<=now()) or (status='sending' and last_attempt_at<now()-interval '10 minutes')) and attempts<5 order by created_at for update skip locked limit remaining loop
  if not exists(select 1 from public.members m join auth.users u on lower(u.email)=m.email where m.email=job.recipient and u.email_confirmed_at is not null) then
   update agenda_private.activity_mail_jobs set status='skipped' where id=job.id;continue;
  end if;
  select jsonb_agg(item) into valid_items from jsonb_array_elements(job.items) item where exists(select 1 from public.events e where e.id=(item->>'id')::uuid);
  if valid_items is null then update agenda_private.activity_mail_jobs set status='skipped' where id=job.id;continue;end if;
  job.lease:=gen_random_uuid();
  update agenda_private.activity_mail_jobs set status='sending',lease=job.lease,attempts=attempts+1,last_attempt_at=now() where id=job.id;
  return next jsonb_build_object('id',job.id,'lease',job.lease,'recipient',job.recipient,'items',valid_items);
 end loop;
end;$$;
revoke all on function agenda_private.claim_activity_mail() from public,anon,authenticated;
grant usage on schema agenda_private to service_role;
grant execute on function agenda_private.claim_activity_mail() to service_role;
create function public.claim_activity_mail() returns setof jsonb language sql security invoker set search_path='' as $$select * from agenda_private.claim_activity_mail();$$;
revoke all on function public.claim_activity_mail() from public,anon,authenticated;
grant execute on function public.claim_activity_mail() to service_role;
create function agenda_private.finish_activity_mail(job_id uuid,job_lease uuid,delivered boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'Geen toegang';end if;
 update agenda_private.activity_mail_jobs set status=case when delivered then 'sent' when attempts>=5 then 'failed' else 'pending' end,sent_at=case when delivered then now() else null end,next_attempt_at=now()+make_interval(mins=>10*attempts),lease=null where id=job_id and lease=job_lease and status='sending';
end;$$;
revoke all on function agenda_private.finish_activity_mail(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function agenda_private.finish_activity_mail(uuid,uuid,boolean) to service_role;
create function public.finish_activity_mail(job_id uuid,job_lease uuid,delivered boolean) returns void language sql security invoker set search_path='' as $$select agenda_private.finish_activity_mail(job_id,job_lease,delivered);$$;
revoke all on function public.finish_activity_mail(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_activity_mail(uuid,uuid,boolean) to service_role;
-- Worker has no recipient/content parameters. Only this database queue determines delivery.
select cron.schedule('agenda-activity-mail','* * * * *', $cron$
 select net.http_post(url:='https://gwzktuqlbwynzepgyewt.supabase.co/functions/v1/notify-activities',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3emt0dXFsYnd5bnplcGd5ZXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MTU3MjIsImV4cCI6MjEwNjQ5MTcyMn0.xiOFU1UIH9FdJFkro5yM21dR_YLYjIRjTMhmPcKUGEo"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=120000)
 where exists(select 1 from agenda_private.activity_mail_jobs where status in ('pending','sending') and next_attempt_at<=now())
 and (select count(*) from agenda_private.activity_mail_jobs where last_attempt_at>now()-interval '1 day')<100;
$cron$);

create policy "Geen directe toegang" on agenda_private.activity_mail_jobs for all to authenticated using(false) with check(false);
