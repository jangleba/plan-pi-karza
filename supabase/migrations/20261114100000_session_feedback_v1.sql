-- Session feedback v1: typed club/match feedback stored in real columns, not in notes.
-- activity_tags: multi-select club character (running_endurance, technical, tactical_game);
-- duration_source: whether duration_minutes is a user entry, a start/stop measurement or the
-- explicit 90-minute club default; match_minutes_played: actual minutes played (0 allowed),
-- independent of whole-session time; feedback_version: form generation (new RPE is 1-10,
-- legacy RPE 0 stays readable). Existing rows are not rewritten.
alter table public.session_logs
  add column if not exists activity_tags text[],
  add column if not exists duration_source text,
  add column if not exists match_minutes_played integer,
  add column if not exists feedback_version integer;

alter table public.session_logs
  drop constraint if exists session_logs_activity_tags_check,
  add constraint session_logs_activity_tags_check
    check (activity_tags is null or (
      cardinality(activity_tags) <= 3
      and activity_tags <@ array['running_endurance','technical','tactical_game']::text[])),
  drop constraint if exists session_logs_duration_source_check,
  add constraint session_logs_duration_source_check
    check (duration_source is null or duration_source in ('user','measured','club_default')),
  drop constraint if exists session_logs_match_minutes_check,
  add constraint session_logs_match_minutes_check
    check (match_minutes_played is null or match_minutes_played between 0 and 180),
  drop constraint if exists session_logs_feedback_version_check,
  add constraint session_logs_feedback_version_check
    check (feedback_version is null or feedback_version >= 1);

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
