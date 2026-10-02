
alter table agenda_private.activity_mail_jobs add column kind text not null default 'activity' check(kind in ('activity','approval'));
alter table agenda_private.activity_mail_jobs add column approval_user_id uuid references auth.users(id) on delete cascade;
alter table agenda_private.activity_mail_jobs add constraint approval_job_identity check((kind='activity' and approval_user_id is null) or (kind='approval' and approval_user_id is not null));
create unique index approval_mail_once_idx on agenda_private.activity_mail_jobs(approval_user_id) where kind='approval';
create function agenda_private.queue_approval_mail() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not agenda_private.is_admin() then raise exception 'Alleen beheerder';end if;
 if old.status='pending' and new.status='approved' then
  insert into agenda_private.activity_mail_jobs(transaction_id,recipient,items,kind,approval_user_id)
  select -txid_current(),new.email,jsonb_build_array(jsonb_build_object('display_name',new.display_name)),'approval',new.user_id
  from auth.users u join public.members m on m.email=lower(u.email)
  where u.id=new.user_id and lower(u.email)=new.email and u.email_confirmed_at is not null
  on conflict(approval_user_id) where kind='approval' do nothing;
 end if;
 return new;
end;$$;
revoke all on function agenda_private.queue_approval_mail() from public,anon,authenticated;
create trigger queue_approval_mail after update of status on public.membership_requests
 for each row when(old.status='pending' and new.status='approved') execute function agenda_private.queue_approval_mail();
create or replace function agenda_private.claim_activity_mail() returns setof jsonb language plpgsql security definer set search_path='' as $$
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
  if job.kind='approval' then
   if not exists(select 1 from public.membership_requests r join auth.users u on u.id=r.user_id where r.user_id=job.approval_user_id and r.status='approved' and r.email=job.recipient and lower(u.email)=job.recipient and u.email_confirmed_at is not null) then
    update agenda_private.activity_mail_jobs set status='skipped' where id=job.id;continue;
   end if;
   valid_items:=job.items;
  else
   select jsonb_agg(item) into valid_items from jsonb_array_elements(job.items) item where exists(select 1 from public.events e where e.id=(item->>'id')::uuid);
  end if;
  if valid_items is null then update agenda_private.activity_mail_jobs set status='skipped' where id=job.id;continue;end if;
  job.lease:=gen_random_uuid();
  update agenda_private.activity_mail_jobs set status='sending',lease=job.lease,attempts=attempts+1,last_attempt_at=now() where id=job.id;
  return next jsonb_build_object('id',job.id,'lease',job.lease,'recipient',job.recipient,'items',valid_items,'kind',job.kind);
 end loop;
end;$$;
