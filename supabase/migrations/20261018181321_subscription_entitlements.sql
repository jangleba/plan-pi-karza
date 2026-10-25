-- Verified store state is writable only by the backend service role, never the app.
create table if not exists public.billing_entitlements(
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check(status in ('trialing','active','grace','expired','no_subscription')),
  expires_at timestamptz,
  verified_at timestamptz not null,
  product_id text,
  store text,
  updated_at timestamptz not null default now()
);
alter table public.billing_entitlements enable row level security;
create policy billing_owner_read on public.billing_entitlements for select to authenticated
  using ((select auth.uid())=user_id);
grant select on public.billing_entitlements to authenticated;
grant all on public.billing_entitlements to service_role;
create table if not exists public.billing_events(
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null,
  processed_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
alter table public.billing_events enable row level security;
grant all on public.billing_events to service_role;
-- Invoker + service-role-only grant: no privileged public function endpoint.
create or replace function public.record_billing_entitlement(
  p_user_id uuid,p_status text,p_expires_at timestamptz,p_verified_at timestamptz,
  p_product_id text,p_store text,p_event_id text default null
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_event_id is not null and length(p_event_id)>200 then raise exception 'invalid event'; end if;
  if p_verified_at>now()+interval '5 minutes' then raise exception 'invalid verification time'; end if;
  insert into public.billing_entitlements(user_id,status,expires_at,verified_at,product_id,store)
  values(p_user_id,p_status,p_expires_at,p_verified_at,p_product_id,p_store)
  on conflict(user_id) do update set status=excluded.status,expires_at=excluded.expires_at,
    verified_at=excluded.verified_at,product_id=excluded.product_id,store=excluded.store,updated_at=now()
  where excluded.verified_at>=public.billing_entitlements.verified_at;
  if p_event_id is not null then
    insert into public.billing_events(event_id,user_id,verified_at) values(p_event_id,p_user_id,p_verified_at)
      on conflict(event_id,user_id) do nothing;
  end if;
end;
$$;
revoke all on function public.record_billing_entitlement(uuid,text,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.record_billing_entitlement(uuid,text,timestamptz,timestamptz,text,text,text) to service_role;

-- Explicit, per-device metadata backups; no global last-write-wins history blob.
create table if not exists public.module_backups(
 user_id uuid not null references auth.users(id) on delete cascade,
 module text not null check(module in ('fuel','iq','lab','reactive')),
 device_id uuid not null,
 revision bigint not null default 1 check(revision>0),
 operation_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=1048576),
 updated_at timestamptz not null default now(),
 primary key(user_id,module,device_id)
);
alter table public.module_backups enable row level security;
create policy module_backups_owned on public.module_backups for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.module_backups to authenticated;

-- Text is an explicit, optional extension of the current health-data consent.
-- Enforce it on the table as well as the RPC so a stale REST client cannot
-- restore a cloud copy after consent has been withdrawn. The shared owner lock
-- orders writes against withdrawal; statement locks run before UPDATE row locks.
create or replace function public.lock_module_backup_consent_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':training',0));
 end if;
 return null;
end;
$$;
revoke all on function public.lock_module_backup_consent_owner() from public,anon,authenticated;
create trigger aa_module_backup_consent_lock before insert or update or delete
 on public.module_backups for each statement execute function public.lock_module_backup_consent_owner();
create trigger aa_module_backup_consent_lock before insert or update
 on public.consent_logs for each statement execute function public.lock_module_backup_consent_owner();

create or replace function public.enforce_module_backup_text_consent()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and new.user_id is distinct from auth.uid() then
  raise exception 'Backup owner mismatch' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||':training',0));
 if new.payload->'includesUserText'='true'::jsonb
    and public.latest_consent_is_accepted_for_version(new.user_id,'health_data','2.3') is not true then
  raise exception 'Current health-data consent is required for cloud backups containing user text' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_module_backup_text_consent() from public,anon,authenticated;
create trigger module_backup_text_consent before insert or update
 on public.module_backups for each row execute function public.enforce_module_backup_text_consent();

create or replace function public.clear_module_backups_after_health_withdrawal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.consent_type='health_data' then
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||':training',0));
  if new.accepted is not true then
   delete from public.module_backups
    where user_id=new.user_id and payload->'includesUserText'='true'::jsonb;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.clear_module_backups_after_health_withdrawal() from public,anon,authenticated;
create trigger consent_logs_clear_module_backups_after_health_withdrawal after insert or update
 on public.consent_logs for each row execute function public.clear_module_backups_after_health_withdrawal();

create or replace function public.save_module_backup(p_module text,p_device_id uuid,p_expected_version bigint,p_operation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid();v_row public.module_backups%rowtype;
begin
 if v_owner is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_expected_version<0 or p_expected_version is null then raise exception 'invalid revision'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':training',0));
 if p_payload->'includesUserText'='true'::jsonb
    and coalesce((select accepted is true and version='2.3' from public.consent_logs
      where user_id=v_owner and consent_type='health_data'
      order by accepted_at desc,id desc limit 1),false) is not true then
  raise exception 'Current health-data consent is required for cloud backups containing user text' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':'||p_module||':'||p_device_id::text,0));
 select * into v_row from public.module_backups where user_id=v_owner and module=p_module and device_id=p_device_id;
 if found and v_row.operation_id=p_operation_id then return to_jsonb(v_row); end if;
 if coalesce(v_row.revision,0)<>p_expected_version then raise exception 'backup conflict; preserve local copy and reload' using errcode='40001'; end if;
 insert into public.module_backups(user_id,module,device_id,revision,operation_id,payload)
 values(v_owner,p_module,p_device_id,p_expected_version+1,p_operation_id,p_payload)
 on conflict(user_id,module,device_id) do update set revision=excluded.revision,operation_id=excluded.operation_id,payload=excluded.payload,updated_at=now()
 returning * into v_row;
 return to_jsonb(v_row);
end;
$$;
revoke all on function public.save_module_backup(text,uuid,bigint,uuid,jsonb) from public,anon;
grant execute on function public.save_module_backup(text,uuid,bigint,uuid,jsonb) to authenticated;
