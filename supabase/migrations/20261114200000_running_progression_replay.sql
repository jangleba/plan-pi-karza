-- Deterministic running progression. The level is derived from all valid evidence (completed
-- non-test run + completed session with RPE) folded in execution order from a base (the newest
-- MAS test, or the level held when this migration ran). Arrival order, retries, a late RPE, an
-- older run sent late and a corrected result all give the same level for the same evidence.
-- Ties are broken by the stable activity id. Evidence older than the base is treated as consumed
-- and is not replayed. Callers hold the per-owner training advisory lock.
alter table public.athlete_profiles
  add column if not exists running_progression_base_level integer,
  add column if not exists running_progression_base_at timestamptz;
update public.athlete_profiles
  set running_progression_base_level = running_progression_level, running_progression_base_at = now()
  where running_progression_base_at is null;

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
  where a.user_id=p_owner and not a.is_field_mas_test and l.completed and l.rpe is not null
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

create or replace function public.save_training_log(p_operation_id uuid,p_session_id uuid,p_expected_version bigint,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); current_row public.session_logs%rowtype; activity public.running_activities%rowtype;
 receipt public.training_write_receipts%rowtype; new_level integer;
 tags text[]; day_kind text; fv integer:=nullif(p_payload->>'feedback_version','')::integer;
begin
 if owner is null or p_operation_id is null then raise exception 'Authentication and operation ID required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into current_row from public.session_logs where user_id=owner and session_id=p_session_id for update;
 select * into receipt from public.training_write_receipts where operation_id=p_operation_id;
 if found then
  if receipt.kind<>'session_log' or receipt.target_id<>p_session_id then raise exception 'Operation ID reused' using errcode='22023'; end if;
  return to_jsonb(current_row)||jsonb_build_object('profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
 end if;
 if coalesce(current_row.write_version,0)<>public.training_expected_version('session_log',p_session_id,p_expected_version,p_payload) then raise exception 'Training result changed; reload before editing' using errcode='40001'; end if;
 if current_row.completed and coalesce((p_payload->>'completed')::boolean,false) is false then raise exception 'Completed workout cannot become unfinished' using errcode='40001'; end if;
 -- A stale device may still display an unstarted session from a replaced plan.
 -- Existing executions keep their pinned prescription and historical logging.
 if p_payload->>'completion_status'='started'
  and not coalesce((p_payload->>'completed')::boolean,false)
  and not coalesce(current_row.completed or current_row.completion_status in('started','completed'),false) then
  -- Direct plan replacement uses this owner lock; preserve the wrappers' lock order.
  perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
  if not exists(
   select 1 from public.training_sessions s
   join public.training_days d on d.id=s.training_day_id
   join public.training_plans p on p.id=d.plan_id
   where s.id=p_session_id and s.user_id=owner and d.user_id=owner
    and p.user_id=owner and p.active and p.status='active'
  ) then
   raise exception 'Plan zmienił się na innym urządzeniu. Odśwież plan.' using errcode='40001';
  end if;
 end if;
 -- Typed feedback (v1): tags, duration source, match minutes. Absent keys keep stored values.
 if p_payload ? 'activity_tags' and jsonb_typeof(p_payload->'activity_tags')='array' then
  tags:=array(select jsonb_array_elements_text(p_payload->'activity_tags'));
 end if;
 if coalesce(fv,0)>=1 and coalesce((p_payload->>'completed')::boolean,false) then
  if p_payload->>'rpe' is not null and ((p_payload->>'rpe')::integer<1 or (p_payload->>'rpe')::integer>10) then
   raise exception 'RPE must be between 1 and 10' using errcode='22023';
  end if;
  select d.day_type into day_kind from public.training_sessions s join public.training_days d on d.id=s.training_day_id where s.id=p_session_id and s.user_id=owner;
  if day_kind='match' and (p_payload->>'match_minutes_played') is null then
   raise exception 'Match minutes played are required' using errcode='22023';
  end if;
 end if;
 perform set_config('ballwise.versioned_write','on',true);
 insert into public.session_logs(user_id,session_id,completed,completion_status,rpe,notes,duration_minutes,activity_type,started_at,ended_at,updated_at,execution_snapshot,activity_tags,duration_source,match_minutes_played,feedback_version)
 values(owner,p_session_id,coalesce((p_payload->>'completed')::boolean,false),p_payload->>'completion_status',(p_payload->>'rpe')::integer,p_payload->>'notes',
 (p_payload->>'duration_minutes')::integer,p_payload->>'activity_type',(p_payload->>'started_at')::timestamptz,(p_payload->>'ended_at')::timestamptz,
 coalesce((p_payload->>'updated_at')::timestamptz,clock_timestamp()),p_payload->'execution_snapshot',
 tags,nullif(p_payload->>'duration_source',''),(p_payload->>'match_minutes_played')::integer,fv)
 on conflict(user_id,session_id) do update set completed=excluded.completed,completion_status=excluded.completion_status,rpe=excluded.rpe,notes=excluded.notes,
 duration_minutes=excluded.duration_minutes,activity_type=excluded.activity_type,started_at=excluded.started_at,ended_at=excluded.ended_at,updated_at=excluded.updated_at,
 execution_snapshot=coalesce(public.session_logs.execution_snapshot,excluded.execution_snapshot),
 activity_tags=case when p_payload ? 'activity_tags' then excluded.activity_tags else public.session_logs.activity_tags end,
 duration_source=case when p_payload ? 'duration_source' then excluded.duration_source else public.session_logs.duration_source end,
 match_minutes_played=case when p_payload ? 'match_minutes_played' then excluded.match_minutes_played else public.session_logs.match_minutes_played end,
 feedback_version=case when p_payload ? 'feedback_version' then excluded.feedback_version else public.session_logs.feedback_version end
 returning * into current_row;
 select * into activity from public.running_activities where user_id=owner and session_id=p_session_id for update;
 -- Derived running level: replayed from all evidence in execution order, so arrival order never matters.
 if current_row.completed and activity.id is not null then perform public.recompute_running_progression(owner); end if;
 insert into public.training_write_receipts values(p_operation_id,owner,'session_log',p_session_id,current_row.write_version,now());
 perform set_config('ballwise.versioned_write','off',true);
 return to_jsonb(current_row)||jsonb_build_object('profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
end $$;
revoke all on function public.save_training_log(uuid,uuid,bigint,jsonb) from public;
grant execute on function public.save_training_log(uuid,uuid,bigint,jsonb) to authenticated;

create or replace function public.save_running_result(p_operation_id uuid,p_payload jsonb,p_expected_version bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); current_row public.running_activities%rowtype; receipt public.training_write_receipts%rowtype;
 sid uuid:=(p_payload->>'session_id')::uuid; field_result numeric; test jsonb; is_test boolean:=coalesce((p_payload->>'is_field_mas_test')::boolean,false); new_level integer;
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
 is_test:=is_test or coalesce(current_row.is_field_mas_test,false);
 if is_test then
  select r into test from jsonb_array_elements(coalesce(p_payload->'interval_results','[]'::jsonb)) r
    where r->>'kind'='work' and (r->>'completed')::boolean and r->>'targetMode'='time' and (r->>'targetValue')::numeric=300
      and (r->>'durationSec')::numeric between 298 and 302 limit 1;
  if test is null then raise exception 'Complete five-minute interval evidence is required' using errcode='22023'; end if;
  field_result:=round((test->>'distanceM')::numeric/(test->>'durationSec')::numeric*3.6,2);
  if field_result not between 5 and 30 then raise exception 'Invalid field MAS result' using errcode='22023'; end if;
 end if;
 insert into public.running_activities(id,user_id,session_id,date,duration_sec,distance_m,avg_pace_sec_per_km,is_field_mas_test,interval_results,started_at,ended_at,write_version)
 values(coalesce(current_row.id,(p_payload->>'id')::uuid,gen_random_uuid()),owner,sid,(p_payload->>'date')::date,(p_payload->>'duration_sec')::integer,
 (p_payload->>'distance_m')::numeric,(p_payload->>'avg_pace_sec_per_km')::integer,is_test,coalesce(p_payload->'interval_results','[]'::jsonb),
 (p_payload->>'started_at')::timestamptz,(p_payload->>'ended_at')::timestamptz,coalesce(current_row.write_version,0)+1)
 on conflict(user_id,session_id) do update set duration_sec=excluded.duration_sec,distance_m=excluded.distance_m,avg_pace_sec_per_km=excluded.avg_pace_sec_per_km,
 is_field_mas_test=excluded.is_field_mas_test,interval_results=excluded.interval_results,started_at=excluded.started_at,ended_at=excluded.ended_at,write_version=excluded.write_version,
 server_updated_at=clock_timestamp() returning * into current_row;
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

create or replace function public.delete_running_activity_atomic(p_activity_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); activity public.running_activities%rowtype; cleared boolean:=false;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into activity from public.running_activities where id=p_activity_id and user_id=owner for update;
 if not found then return false; end if;
 update public.athlete_profiles set field_mas_kmh=null,field_mas_tested_at=null,field_mas_source_session_id=null,running_progression_level=0,running_progression_updated_at=null
 where user_id=owner and activity.is_field_mas_test and (field_mas_source_session_id=activity.session_id or
 (field_mas_source_session_id is null and field_mas_tested_at=activity.date and activity.id=(select id from public.running_activities where user_id=owner and is_field_mas_test and date=activity.date order by created_at desc,id desc limit 1)));
 cleared:=found;
 delete from public.running_activities where id=activity.id;
 perform public.recompute_running_progression(owner);
 return cleared;
end $$;

revoke all on function public.delete_running_activity_atomic(uuid) from public;
grant execute on function public.delete_running_activity_atomic(uuid) to authenticated;
