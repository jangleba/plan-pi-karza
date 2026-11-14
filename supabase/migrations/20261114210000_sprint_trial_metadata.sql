-- Sprint trial metadata. A time is attached to one planned repetition (set_number) and now also
-- records the distance, the kind of start and how it was measured, so only trials with matching
-- conditions are compared. Older rows keep NULL here and are never treated as comparable.
-- Re-saving the same repetition updates the same row (unique on session, exercise, set number).
alter table public.exercise_set_logs
  add column if not exists distance_m numeric,
  add column if not exists start_type text,
  add column if not exists measurement_method text;
alter table public.exercise_set_logs
  drop constraint if exists exercise_set_logs_distance_check,
  add constraint exercise_set_logs_distance_check check (distance_m is null or (distance_m > 0 and distance_m <= 100)),
  drop constraint if exists exercise_set_logs_start_type_check,
  add constraint exercise_set_logs_start_type_check check (start_type is null or start_type in ('standing','flying')),
  drop constraint if exists exercise_set_logs_measurement_method_check,
  add constraint exercise_set_logs_measurement_method_check check (measurement_method is null or measurement_method in ('manual_stopwatch','video_reviewed'));

create or replace function public.save_exercise_set(p_operation_id uuid,p_payload jsonb,p_expected_version bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); current_row public.exercise_set_logs%rowtype; receipt public.training_write_receipts%rowtype; target uuid;
begin
 if owner is null or p_operation_id is null then raise exception 'Authentication and operation ID required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into current_row from public.exercise_set_logs where user_id=owner and session_id is not distinct from (p_payload->>'session_id')::uuid
 and exercise_key=p_payload->>'exercise_key' and set_number=(p_payload->>'set_number')::integer for update;
 select * into receipt from public.training_write_receipts where operation_id=p_operation_id;
 if found then
  if receipt.kind<>'exercise_set_log' or receipt.target_id is distinct from current_row.id then raise exception 'Operation ID reused' using errcode='22023'; end if;
  return to_jsonb(current_row);
 end if;
 if coalesce(current_row.write_version,0)<>public.training_expected_version('exercise_set_log',current_row.id,p_expected_version,p_payload) then raise exception 'Set changed; reload before editing' using errcode='40001'; end if;
 target:=coalesce(current_row.id,gen_random_uuid());
 perform set_config('ballwise.versioned_write','on',true);
 insert into public.exercise_set_logs(id,user_id,session_id,exercise_key,exercise_name,set_number,weight_kg,reps,rir,metric_kind,metric_value,performed_at,write_version,distance_m,start_type,measurement_method)
 values(target,owner,(p_payload->>'session_id')::uuid,p_payload->>'exercise_key',p_payload->>'exercise_name',(p_payload->>'set_number')::integer,
 (p_payload->>'weight_kg')::numeric,(p_payload->>'reps')::integer,(p_payload->>'rir')::integer,p_payload->>'metric_kind',(p_payload->>'metric_value')::numeric,
 coalesce((p_payload->>'performed_at')::timestamptz,clock_timestamp()),1,
 (p_payload->>'distance_m')::numeric,nullif(p_payload->>'start_type',''),nullif(p_payload->>'measurement_method',''))
 on conflict(user_id,session_id,exercise_key,set_number) do update set weight_kg=excluded.weight_kg,reps=excluded.reps,rir=excluded.rir,
 metric_kind=excluded.metric_kind,metric_value=excluded.metric_value,performed_at=excluded.performed_at,
  distance_m=case when p_payload ? 'distance_m' then excluded.distance_m else public.exercise_set_logs.distance_m end,
  start_type=case when p_payload ? 'start_type' then excluded.start_type else public.exercise_set_logs.start_type end,
  measurement_method=case when p_payload ? 'measurement_method' then excluded.measurement_method else public.exercise_set_logs.measurement_method end
 returning * into current_row;
 insert into public.training_write_receipts values(p_operation_id,owner,'exercise_set_log',current_row.id,current_row.write_version,now());
 perform set_config('ballwise.versioned_write','off',true);
 return to_jsonb(current_row);
end $$;
revoke all on function public.save_exercise_set(uuid,jsonb,bigint) from public;
grant execute on function public.save_exercise_set(uuid,jsonb,bigint) to authenticated;
