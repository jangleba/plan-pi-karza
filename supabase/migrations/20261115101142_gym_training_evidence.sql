-- Training preferences, equipment and observations. No health questionnaire or diagnosis.
create or replace function public.valid_gym_record(d jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb; x jsonb; k text:=d->>'kind';
begin
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>32000 or d->>'version' is distinct from '1' then return false; end if;
 if k='equipment' then
  if coalesce(d->>'exerciseId','')='' or length(d->>'exerciseId')>160 or
   coalesce(d->>'id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
   coalesce(d->>'label','')='' or length(d->>'label')>160 or
   coalesce(d->>'convention','') not in ('total','per_hand','machine') then return false; end if;
  if not (d?'incrementKg' or d?'availableWeightsKg') then return false; end if;
  if d?'incrementKg' and (jsonb_typeof(d->'incrementKg') is distinct from 'number' or (d->>'incrementKg')::numeric not between 0.05 and 100) then return false; end if;
  if d?'availableWeightsKg' then
   if jsonb_typeof(d->'availableWeightsKg') is distinct from 'array' or jsonb_array_length(d->'availableWeightsKg') not between 1 and 200 then return false; end if;
   for x in select value from jsonb_array_elements(d->'availableWeightsKg') loop
    if jsonb_typeof(x) is distinct from 'number' or x::numeric not between 0.05 and 1000 then return false; end if;
   end loop;
  end if;
  return true;
 elsif k='band_setup' then
  s:=d->'setup';
  if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
   coalesce(s->>'exerciseId','')='' or coalesce(s->>'bandId','')='' or coalesce(s->>'stationId','')='' or
   length(s->>'exerciseId')>160 or length(s->>'bandId')>160 or length(s->>'stationId')>160 or
   coalesce(s->>'direction','') not in ('assistance','resistance') or
   coalesce(s->>'measuredOn','')!~'^\d{4}-\d{2}-\d{2}$' then return false; end if;
  if (s->>'measuredOn')::date::text<>s->>'measuredOn' then return false; end if;
  if jsonb_typeof(s->'positions') is distinct from 'array' or jsonb_array_length(s->'positions')<>2 or
   coalesce(s#>>'{positions,0}','')='' or coalesce(s#>>'{positions,1}','')='' or
   length(s#>>'{positions,0}')>160 or length(s#>>'{positions,1}')>160 or s#>'{positions,0}'=s#>'{positions,1}' then return false; end if;
  if jsonb_typeof(s->'lengthsCm') is distinct from 'array' or jsonb_array_length(s->'lengthsCm')<>2 or
   jsonb_typeof(s->'forceNewtons') is distinct from 'array' or jsonb_array_length(s->'forceNewtons')<>2 then return false; end if;
  for x in select value from jsonb_array_elements(s->'lengthsCm') loop
   if jsonb_typeof(x) is distinct from 'number' or x::numeric not between 0.1 and 1000 then return false; end if;
  end loop;
  for x in select value from jsonb_array_elements(s->'forceNewtons') loop
   if jsonb_typeof(x) is distinct from 'number' or x::numeric not between 0.1 and 5000 then return false; end if;
  end loop;
  return true;
 elsif k='band_selection' then
  return coalesce(d->>'exerciseId','')<>'' and length(d->>'exerciseId')<=160 and d?'setupId' and
   (d->'setupId'='null'::jsonb or coalesce(d->>'setupId','')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
 elsif k in ('response','observation') then
  if coalesce(d->>'sessionId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
   coalesce(d->>'exerciseId','')='' or length(d->>'exerciseId')>160 then return false; end if;
  if k='response' then
   return public.valid_gym_record(d->'equipment') and d#>>'{equipment,exerciseId}'=d->>'exerciseId' and
    coalesce(d->>'decision','') in ('accept','hold','lighter','unanswered') and
    (not d?'reason' or d->>'reason' in ('preference','not_ready','unable')) and
    jsonb_typeof(d->'chosenKg')='number' and (d->>'chosenKg')::numeric between 0 and 1000 and
    (not d?'suggestedKg' or (jsonb_typeof(d->'suggestedKg')='number' and (d->>'suggestedKg')::numeric between 0 and 1000)) and
    jsonb_typeof(d->'prescriptionKey')='string' and length(d->>'prescriptionKey')<=8000 and
    jsonb_typeof(d->'suggestionKey')='string' and length(d->>'suggestionKey')<=8000;
  end if;
  s:=d->'observation';
  if jsonb_typeof(s) is distinct from 'object' or s->>'sessionId'<>d->>'sessionId' or s->>'exerciseId'<>d->>'exerciseId' or
    coalesce(s->>'source','') not in ('athlete_observed','video_reviewed') or jsonb_typeof(s->'sets') is distinct from 'array' or jsonb_array_length(s->'sets')>40 then return false; end if;
  if s?'controlLossReported' and s->'controlLossReported'<>'true'::jsonb then return false; end if;
  for x in select value from jsonb_array_elements(s->'sets') loop
   if jsonb_typeof(x->'setNumber') is distinct from 'number' or (x->>'setNumber')::numeric<>trunc((x->>'setNumber')::numeric) or
    (x->>'setNumber')::numeric not between 1 and 20 or coalesce(x->>'side','') not in ('both','left','right') or
    coalesce(x->>'control','') not in ('stable','lost','unknown') or jsonb_typeof(x->'completed') is distinct from 'number' or
    (x->>'completed')::numeric not between 0 and 120 then return false; end if;
  end loop;
  for x in select v from (
   select value->'metric' v from jsonb_array_elements(s->'sets') where value?'metric'
   union all select s->'minimumMetric' where s?'minimumMetric'
  ) metrics loop
   if jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'kind','') not in ('jump_height_cm','cycles_per_second') or
    coalesce(x->>'method','') not in ('video_reviewed','device') or jsonb_typeof(x->'value') is distinct from 'number' or
    (x->>'value')::numeric not between 0.01 and 200 then return false; end if;
  end loop;
  return true;
 end if;
 return false;
exception when others then return false;
end $$;
create or replace function public.gym_record_key(d jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select case when d->>'kind'='band_setup' then 'band_setup:'||(d#>>'{setup,id}')
 when d->>'kind' in ('equipment','band_selection') then (d->>'kind')||':'||(d->>'exerciseId')
 else (d->>'kind')||':'||(d->>'sessionId')||':'||(d->>'exerciseId') end
$$;
create table public.gym_records(
 user_id uuid not null references auth.users(id) on delete cascade,
 record_key text not null check(length(record_key)<=320),
 payload jsonb not null check(public.valid_gym_record(payload) is true),
 revision bigint not null default 1 check(revision>=1),
 last_operation_id uuid not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,record_key),
 check(record_key=public.gym_record_key(payload))
);
create index gym_records_owner_kind_date on public.gym_records(user_id,(payload->>'kind'),updated_at desc);
create table public.gym_record_receipts(
 operation_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 record_key text not null, created_at timestamptz not null default now()
);
create index gym_record_receipts_owner on public.gym_record_receipts(user_id,record_key);
alter table public.gym_records enable row level security;
alter table public.gym_record_receipts enable row level security;
create or replace function public.gym_record_session_owned(d jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select case when d->>'kind' not in ('response','observation') then true else exists(
  select 1 from public.training_sessions s join public.session_logs l on l.session_id=s.id and l.user_id=s.user_id
  where s.user_id=(select auth.uid()) and s.id=(d->>'sessionId')::uuid
   and (l.completed or l.completion_status='started')
   and (l.execution_snapshot#>'{engineV2,roles}' @> '["strengthA"]'::jsonb or l.execution_snapshot#>'{engineV2,roles}' @> '["strengthB"]'::jsonb)
   and exists(select 1 from jsonb_array_elements(l.execution_snapshot#>'{engineV2,exercises}') e where e->>'exerciseId'=d->>'exerciseId')
 ) end
$$;
create policy gym_records_read on public.gym_records for select to authenticated using((select auth.uid())=user_id);
create policy gym_records_insert on public.gym_records for insert to authenticated with check((select auth.uid())=user_id and public.gym_record_session_owned(payload));
create policy gym_records_update on public.gym_records for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id and public.gym_record_session_owned(payload));
create policy gym_receipts_read on public.gym_record_receipts for select to authenticated using((select auth.uid())=user_id);
create policy gym_receipts_insert on public.gym_record_receipts for insert to authenticated with check((select auth.uid())=user_id);
revoke all on public.gym_records,public.gym_record_receipts from anon,authenticated;
grant select,insert,update on public.gym_records to authenticated;
grant select,insert on public.gym_record_receipts to authenticated;
create or replace function public.save_gym_record(p_operation_id uuid,p_expected_version bigint,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); k text:=p_payload->>'record_key'; d jsonb:=p_payload->'payload'; current_row public.gym_records;
begin
 if owner is null or p_payload->>'user_id' is distinct from owner::text then raise exception 'Not authorised' using errcode='42501'; end if;
 if p_operation_id is null or p_expected_version is null or p_expected_version<0 or public.valid_gym_record(d) is not true or k is distinct from public.gym_record_key(d) then
  raise exception 'Invalid gym record' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':'||k,0));
 select * into current_row from public.gym_records where user_id=owner and record_key=k for update;
 if exists(select 1 from public.gym_record_receipts where user_id=owner and record_key=k and operation_id=p_operation_id) then return to_jsonb(current_row); end if;
 if coalesce(current_row.revision,0)<>p_expected_version and not exists(
  select 1 from jsonb_array_elements_text(case when jsonb_typeof(p_payload->'_predecessor_operation_ids')='array' then p_payload->'_predecessor_operation_ids' else '[]'::jsonb end) p
  join public.gym_record_receipts r on r.operation_id::text=p.value and r.user_id=owner and r.record_key=k
  where r.operation_id=current_row.last_operation_id
 ) then raise exception 'Gym record changed on another device' using errcode='40001'; end if;
 insert into public.gym_records(user_id,record_key,payload,revision,last_operation_id,updated_at)
 values(owner,k,d,coalesce(current_row.revision,0)+1,p_operation_id,clock_timestamp())
 on conflict(user_id,record_key) do update set payload=excluded.payload,revision=excluded.revision,last_operation_id=excluded.last_operation_id,updated_at=excluded.updated_at
 returning * into current_row;
 insert into public.gym_record_receipts(operation_id,user_id,record_key) values(p_operation_id,owner,k);
 return to_jsonb(current_row);
end $$;
revoke all on function public.valid_gym_record(jsonb),public.gym_record_key(jsonb),public.gym_record_session_owned(jsonb),public.save_gym_record(uuid,bigint,jsonb) from public,anon;
grant execute on function public.valid_gym_record(jsonb),public.gym_record_key(jsonb),public.gym_record_session_owned(jsonb),public.save_gym_record(uuid,bigint,jsonb) to authenticated;
