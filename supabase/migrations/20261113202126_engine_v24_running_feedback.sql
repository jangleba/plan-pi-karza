-- Keep completed evidence pending until an RPE exists. A later RPE is handled
-- by the same idempotent write path, in either log/activity arrival order.
-- Existing consumed history is deliberately not replayed or rewritten.

-- A hard HIIT prescription is expected to feel hard. This conservative policy
-- holds its global progression level at the planned RPE 8-9; it does not infer
-- readiness to increase HIIT from that session. Incomplete/uneven work and RPE10
-- still use the existing regression safeguards. Only the pinned V2 prescription
-- can select this policy; a later request cannot replace the execution snapshot.
create or replace function public.next_running_level_for_session(
 current_level integer,rpe integer,results jsonb,execution_snapshot jsonb
) returns integer language plpgsql immutable security invoker set search_path='' as $$
declare recipe jsonb:=execution_snapshot->'runningRecipe'; hard_hiit boolean:=false;
begin
 if rpe is null then return greatest(0,least(3,current_level)); end if;
 if jsonb_typeof(execution_snapshot->'engineV2')='object'
  and execution_snapshot#>'{engineV2,roles}' @> '["endurance"]'::jsonb
  and recipe->>'schema'='ballwise-run-recipe-v1'
  and recipe->>'method'='short_hiit'
  and recipe->>'id' like 'v2:endurance:short_hiit:%'
  and recipe->>'paceSource'='field_mas'
  and jsonb_typeof(recipe->'blocks')='array' then
   if jsonb_array_length(recipe->'blocks')=1 then
    hard_hiit:=recipe#>'{blocks,0,intensity,rpe}'='[8,9]'::jsonb
     and recipe#>'{blocks,0,work,seconds}'='60'::jsonb
     and recipe#>'{blocks,0,recovery,seconds}'='60'::jsonb;
   end if;
 end if;
 if hard_hiit then
  return public.next_running_level(current_level,case when rpe>9 then rpe else null end,results);
 end if;
 return public.next_running_level(current_level,rpe,results);
end $$;
revoke all on function public.next_running_level_for_session(integer,integer,jsonb,jsonb) from public;
grant execute on function public.next_running_level_for_session(integer,integer,jsonb,jsonb) to authenticated,service_role;

create or replace function public.save_training_log(p_operation_id uuid,p_session_id uuid,p_expected_version bigint,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); current_row public.session_logs%rowtype; activity public.running_activities%rowtype;
 receipt public.training_write_receipts%rowtype; new_level integer;
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
 perform set_config('ballwise.versioned_write','on',true);
 insert into public.session_logs(user_id,session_id,completed,completion_status,rpe,notes,duration_minutes,activity_type,started_at,ended_at,updated_at,execution_snapshot)
 values(owner,p_session_id,coalesce((p_payload->>'completed')::boolean,false),p_payload->>'completion_status',(p_payload->>'rpe')::integer,p_payload->>'notes',
 (p_payload->>'duration_minutes')::integer,p_payload->>'activity_type',(p_payload->>'started_at')::timestamptz,(p_payload->>'ended_at')::timestamptz,
 coalesce((p_payload->>'updated_at')::timestamptz,clock_timestamp()),p_payload->'execution_snapshot')
 on conflict(user_id,session_id) do update set completed=excluded.completed,completion_status=excluded.completion_status,rpe=excluded.rpe,notes=excluded.notes,
 duration_minutes=excluded.duration_minutes,activity_type=excluded.activity_type,started_at=excluded.started_at,ended_at=excluded.ended_at,updated_at=excluded.updated_at,
 execution_snapshot=coalesce(public.session_logs.execution_snapshot,excluded.execution_snapshot)
 returning * into current_row;
 select * into activity from public.running_activities where user_id=owner and session_id=p_session_id for update;
 if current_row.completed and current_row.rpe is not null and activity.id is not null and not activity.is_field_mas_test and not activity.progression_applied then
  select public.next_running_level_for_session(running_progression_level,current_row.rpe,activity.interval_results,current_row.execution_snapshot) into new_level from public.athlete_profiles where user_id=owner for update;
  update public.athlete_profiles set running_progression_level=new_level,running_progression_updated_at=current_row.ended_at where user_id=owner and (field_mas_tested_at is null or activity.date>=field_mas_tested_at);
  update public.running_activities set progression_applied=true where id=activity.id;
 end if;
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
 if current_row.progression_applied then raise exception 'Completed running evidence is immutable' using errcode='40001'; end if;
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
  update public.athlete_profiles set field_mas_kmh=field_result,field_mas_tested_at=current_row.date,field_mas_source_session_id=sid,
   running_progression_level=0,running_progression_updated_at=coalesce(current_row.ended_at,clock_timestamp()) where user_id=owner
   and (field_mas_tested_at is null or current_row.date>field_mas_tested_at or
    (current_row.date=field_mas_tested_at and (field_mas_source_session_id=sid or
     coalesce(current_row.ended_at,current_row.date::timestamptz)>=coalesce((select a.ended_at from public.running_activities a where a.user_id=owner and a.session_id=public.athlete_profiles.field_mas_source_session_id),field_mas_tested_at::timestamptz))));
 elsif exists(select 1 from public.session_logs where user_id=owner and session_id=sid and completed and rpe is not null) then
  select public.next_running_level_for_session(p.running_progression_level,l.rpe,current_row.interval_results,l.execution_snapshot) into new_level
   from public.athlete_profiles p join public.session_logs l on l.user_id=p.user_id where p.user_id=owner and l.session_id=sid for update of p;
  update public.athlete_profiles set running_progression_level=new_level,running_progression_updated_at=coalesce(current_row.ended_at,clock_timestamp()) where user_id=owner and (field_mas_tested_at is null or current_row.date>=field_mas_tested_at);
  update public.running_activities set progression_applied=true where id=current_row.id returning * into current_row;
 end if;
 insert into public.training_write_receipts values(p_operation_id,owner,'running_activity',sid,current_row.write_version,now());
 return jsonb_build_object('activity',to_jsonb(current_row),'profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
end $$;
revoke all on function public.save_running_result(uuid,jsonb,bigint) from public;
grant execute on function public.save_running_result(uuid,jsonb,bigint) to authenticated;
