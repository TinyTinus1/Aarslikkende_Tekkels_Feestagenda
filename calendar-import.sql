alter table public.events add column import_key text check(import_key is null or import_key ~ '^[a-f0-9]{64}$');
create unique index events_import_key_owner_idx on public.events(owner_id,import_key) where import_key is not null;
create function public.import_calendar_events(items jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare amount integer;
begin
 if auth.uid() is null or not agenda_private.is_admin() then raise exception 'Alleen beheerder mag importeren'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)<1 or jsonb_array_length(items)>200 then raise exception 'Importeer 1 tot 200 activiteiten'; end if;
 if exists(select 1 from jsonb_array_elements(items) x where x->>'import_key' is null) then raise exception 'Importcode ontbreekt'; end if;
 insert into public.events(title,starts_at,ends_at,location,description,import_key)
 select x.title,x.starts_at,x.ends_at,coalesce(x.location,''),coalesce(x.description,''),x.import_key
 from jsonb_to_recordset(items) as x(title text,starts_at timestamptz,ends_at timestamptz,location text,description text,import_key text)
 on conflict(owner_id,import_key) where import_key is not null do nothing;
 get diagnostics amount=row_count;return amount;
end;$$;
revoke all on function public.import_calendar_events(jsonb) from public,anon;
grant execute on function public.import_calendar_events(jsonb) to authenticated;
