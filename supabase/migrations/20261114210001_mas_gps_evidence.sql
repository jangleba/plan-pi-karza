-- MAS v1: privacy-preserving measurement summary, shared with masQuality.ts.
-- Acceptance thresholds are product heuristics; this is not laboratory VO2max validation.
-- Created by CLI; version advanced past already-deployed future-dated migrations to retain order.
alter table public.running_activities
 add column if not exists mas_test_attempt boolean not null default false,
 add column if not exists mas_test_evidence jsonb;
alter table public.running_activities add constraint mas_evidence_summary_only check (mas_test_evidence is null or (jsonb_typeof(mas_test_evidence)='object' and octet_length(mas_test_evidence::text)<=4096 and not mas_test_evidence ?| array['route','lat','lng','coordinates']));

create or replace function public.valid_mas_gps_evidence(e jsonb,t jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text;
begin
 if e is null or t is null or jsonb_typeof(e)<>'object' or jsonb_typeof(t)<>'object'
   or e->>'version' is distinct from '1' or e->>'source' is distinct from 'gps'
   or e->'interrupted' is distinct from 'false'::jsonb
   or not coalesce(e->>'recipeId' like 'v2:mas-test:%',false) then return false; end if;
 foreach k in array array['startElapsedSec','durationSec','wallDurationSec','coverageSec','maxGapSec','maxAccuracyM','pointCount','discontinuities','distanceM'] loop
   if jsonb_typeof(e->k) is distinct from 'number' then return false; end if;
 end loop;
 if jsonb_typeof(t->'distanceM') is distinct from 'number' then return false; end if;
 return (e->>'startElapsedSec')::numeric>=0
   and (e->>'durationSec')::numeric=300
   and (e->>'wallDurationSec')::numeric between 298 and 302
   and (e->>'coverageSec')::numeric between 294 and 300
   and (e->>'maxGapSec')::numeric between 0 and 10
   and (e->>'maxAccuracyM')::numeric between 0 and 35
   and (e->>'pointCount')::numeric>=20 and mod((e->>'pointCount')::numeric,1)=0
   and (e->>'discontinuities')::numeric=0
   and (e->>'distanceM')::numeric>=600
   and (e->>'distanceM')::numeric/300*3.6 between 7 and 26
   and abs((t->>'distanceM')::numeric-(e->>'distanceM')::numeric)<=0.1;
end $$;
revoke all on function public.valid_mas_gps_evidence(jsonb,jsonb) from public;
grant execute on function public.valid_mas_gps_evidence(jsonb,jsonb) to authenticated,service_role;

create or replace function public.recompute_running_progression(p_owner uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare prof public.athlete_profiles%rowtype; lvl integer; base_time timestamptz; mas_time timestamptz;
 last_time timestamptz; r record; ids uuid[]:=array[]::uuid[];
begin
 select * into prof from public.athlete_profiles where user_id=p_owner for update;
 if not found then return 0; end if;
 lvl:=coalesce(prof.running_progression_base_level,0);
 base_time:=coalesce(prof.running_progression_base_at,'-infinity'::timestamptz);
 if prof.field_mas_source_session_id is not null then
  select coalesce(a.ended_at,a.date::timestamptz) into mas_time from public.running_activities a
   where a.user_id=p_owner and a.session_id=prof.field_mas_source_session_id and a.is_field_mas_test limit 1;
 end if;
 if mas_time is null and prof.field_mas_tested_at is not null then mas_time:=prof.field_mas_tested_at::timestamptz; end if;
 -- A newer MAS test resets the reference: progression restarts from level 0 after it.
 if mas_time is not null and mas_time>=base_time then lvl:=0; base_time:=mas_time; end if;
 for r in
  select a.id, coalesce(l.ended_at,a.ended_at,a.date::timestamptz) as t, l.rpe, a.interval_results, l.execution_snapshot
  from public.running_activities a
  join public.session_logs l on l.user_id=a.user_id and l.session_id=a.session_id
  where a.user_id=p_owner and not a.is_field_mas_test and not a.mas_test_attempt and l.completed and l.rpe is not null
   and coalesce(l.ended_at,a.ended_at,a.date::timestamptz)>base_time
  order by coalesce(l.ended_at,a.ended_at,a.date::timestamptz), a.id
 loop
  lvl:=public.next_running_level_for_session(lvl,r.rpe,r.interval_results,r.execution_snapshot);
  last_time:=r.t; ids:=ids||r.id;
 end loop;
 update public.athlete_profiles set running_progression_level=lvl,
   running_progression_updated_at=coalesce(last_time,mas_time,running_progression_updated_at)
  where user_id=p_owner and (running_progression_level is distinct from lvl or running_progression_updated_at is distinct from coalesce(last_time,mas_time,running_progression_updated_at));
 update public.running_activities set progression_applied=true where user_id=p_owner and id=any(ids) and not progression_applied;
 return lvl;
end $$;
revoke all on function public.recompute_running_progression(uuid) from public;
grant execute on function public.recompute_running_progression(uuid) to authenticated, service_role;

create or replace function public.save_running_result(p_operation_id uuid,p_payload jsonb,p_expected_version bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); current_row public.running_activities%rowtype; receipt public.training_write_receipts%rowtype;
 sid uuid:=(p_payload->>'session_id')::uuid; field_result numeric; test jsonb; is_test boolean:=coalesce((p_payload->>'is_field_mas_test')::boolean,false); new_level integer; evidence jsonb:=p_payload->'mas_test_evidence'; pinned jsonb; attempt boolean:=coalesce((p_payload->>'mas_test_attempt')::boolean,false);
begin
 if owner is null or p_operation_id is null then raise exception 'Authentication and operation ID required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into current_row from public.running_activities where user_id=owner and session_id=sid for update;
 select * into receipt from public.training_write_receipts where operation_id=p_operation_id;
 if found then
  if receipt.kind<>'running_activity' or receipt.target_id<>sid then raise exception 'Operation ID reused' using errcode='22023'; end if;
  return jsonb_build_object('activity',to_jsonb(current_row),'profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
 end if;
 if coalesce(current_row.write_version,0)<>public.training_expected_version('running_activity',sid,p_expected_version,p_payload) then raise exception 'Running result changed; reload before editing' using errcode='40001'; end if;
 attempt:=attempt or is_test;
 if current_row.is_field_mas_test and not is_test then
   raise exception 'A calibrated MAS result cannot be overwritten by an incomplete attempt; remove it explicitly first' using errcode='40001';
 end if;
 if is_test then
  select r into test from jsonb_array_elements(coalesce(p_payload->'interval_results','[]'::jsonb)) r
    where r->>'kind'='work' and r->>'phase'='main' and r->>'completed'='true'
      and r->>'targetMode'='time' and r->>'targetValue'='300' and r->>'durationSec'='300'
      and r->>'recipeId'=evidence->>'recipeId' limit 1;
  select l.execution_snapshot->'runningRecipe' into pinned from public.session_logs l
    where l.user_id=owner and l.session_id=sid;
  if p_payload->>'started_at' is null or p_payload->>'ended_at' is null
    or extract(epoch from ((p_payload->>'ended_at')::timestamptz-(p_payload->>'started_at')::timestamptz)) < (evidence->>'startElapsedSec')::numeric+300
    or pinned->>'method' is distinct from 'field_mas_test' or pinned->>'id' is distinct from evidence->>'recipeId'
    or not public.valid_mas_gps_evidence(evidence,test) then
    raise exception 'Invalid MAS: a pinned five-minute recipe and continuous GPS evidence are required' using errcode='22023';
  end if;
  field_result:=round((evidence->>'distanceM')::numeric/300*3.6,2);
  if field_result is null or field_result not between 7 and 26 then raise exception 'Invalid MAS range' using errcode='22023'; end if;
 end if;
 insert into public.running_activities(id,user_id,session_id,date,duration_sec,distance_m,avg_pace_sec_per_km,is_field_mas_test,interval_results,started_at,ended_at,write_version,mas_test_attempt,mas_test_evidence)
 values(coalesce(current_row.id,(p_payload->>'id')::uuid,gen_random_uuid()),owner,sid,(p_payload->>'date')::date,(p_payload->>'duration_sec')::integer,
 (p_payload->>'distance_m')::numeric,(p_payload->>'avg_pace_sec_per_km')::integer,is_test,coalesce(p_payload->'interval_results','[]'::jsonb),
 (p_payload->>'started_at')::timestamptz,(p_payload->>'ended_at')::timestamptz,coalesce(current_row.write_version,0)+1,attempt,evidence)
 on conflict(user_id,session_id) do update set duration_sec=excluded.duration_sec,distance_m=excluded.distance_m,avg_pace_sec_per_km=excluded.avg_pace_sec_per_km,
 is_field_mas_test=excluded.is_field_mas_test,interval_results=excluded.interval_results,started_at=excluded.started_at,ended_at=excluded.ended_at,write_version=excluded.write_version,
 mas_test_attempt=excluded.mas_test_attempt,mas_test_evidence=excluded.mas_test_evidence,server_updated_at=clock_timestamp() returning * into current_row;
 if is_test then
  update public.athlete_profiles set field_mas_kmh=field_result,field_mas_tested_at=current_row.date,field_mas_source_session_id=sid
   where user_id=owner
   and (field_mas_tested_at is null or current_row.date>field_mas_tested_at or
    (current_row.date=field_mas_tested_at and (field_mas_source_session_id=sid or
     coalesce(current_row.ended_at,current_row.date::timestamptz)>=coalesce((select a.ended_at from public.running_activities a where a.user_id=owner and a.session_id=public.athlete_profiles.field_mas_source_session_id),field_mas_tested_at::timestamptz))));
 end if;
 perform public.recompute_running_progression(owner);
 insert into public.training_write_receipts values(p_operation_id,owner,'running_activity',sid,current_row.write_version,now());
 return jsonb_build_object('activity',to_jsonb(current_row),'profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
end $$;
revoke all on function public.save_running_result(uuid,jsonb,bigint) from public;
grant execute on function public.save_running_result(uuid,jsonb,bigint) to authenticated;

create or replace function public.legacy_mas_interval_kmh(t jsonb)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare d numeric; seconds numeric; kmh numeric;
begin
 if t->>'kind' is distinct from 'work' or t->>'completed' is distinct from 'true'
   or jsonb_typeof(t->'distanceM') is distinct from 'number'
   or jsonb_typeof(t->'durationSec') is distinct from 'number' then return null; end if;
 d:=(t->>'distanceM')::numeric; seconds:=(t->>'durationSec')::numeric;
 if d<600 or seconds not between 298 and 302 then return null; end if;
 kmh:=d/seconds*3.6;
 if kmh not between 7 and 26 then return null; end if;
 return round(kmh,2);
end $$;
revoke all on function public.legacy_mas_interval_kmh(jsonb) from public;
grant execute on function public.legacy_mas_interval_kmh(jsonb) to authenticated,service_role;

create or replace function public.delete_running_activity_atomic(p_activity_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); activity public.running_activities%rowtype; previous public.running_activities%rowtype;
 test jsonb; cleared boolean:=false;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into activity from public.running_activities where id=p_activity_id and user_id=owner for update;
 if not found then return false; end if;
 select exists(select 1 from public.athlete_profiles where user_id=owner and
   (field_mas_source_session_id=activity.session_id or (field_mas_source_session_id is null and field_mas_tested_at=activity.date and activity.is_field_mas_test))) into cleared;
 delete from public.running_activities where id=activity.id;
 if cleared then
   -- Historical tests keep their existing status. Missing distance/unsupported ranges cannot be restored.
   select a.* into previous from public.running_activities a
   where a.user_id=owner and a.is_field_mas_test and exists (
     select 1 from jsonb_array_elements(a.interval_results) r
     where public.legacy_mas_interval_kmh(r) is not null
       and (a.mas_test_evidence is null or public.valid_mas_gps_evidence(a.mas_test_evidence,r))
   ) order by a.date desc,coalesce(a.ended_at,a.created_at) desc,a.id desc limit 1;
   if previous.id is not null then
     select r into test from jsonb_array_elements(previous.interval_results) r
       where public.legacy_mas_interval_kmh(r) is not null limit 1;
   end if;
   update public.athlete_profiles set
     field_mas_kmh=case when previous.id is not null then round((test->>'distanceM')::numeric/(test->>'durationSec')::numeric*3.6,2) else null end,
     field_mas_tested_at=previous.date,field_mas_source_session_id=previous.session_id,
     running_progression_level=0,running_progression_updated_at=null
   where user_id=owner;
 end if;
 perform public.recompute_running_progression(owner);
 return cleared;
end $$;
revoke all on function public.delete_running_activity_atomic(uuid) from public;
grant execute on function public.delete_running_activity_atomic(uuid) to authenticated;
