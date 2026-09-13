create or replace function public.persist_training_plan_atomic(
  p_plan_id uuid,
  p_goal text,
  p_month text,
  p_plan_json jsonb,
  p_days jsonb,
  p_sessions jsonb,
  p_exercises jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_days) <> 'array'
     or jsonb_typeof(p_sessions) <> 'array'
     or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'invalid plan payload' using errcode = '22023';
  end if;

  update public.training_plans
  set status = 'archived', active = false
  where user_id = v_user_id and active = true;

  insert into public.training_plans (id, user_id, goal, month, plan_json, status, active)
  values (p_plan_id, v_user_id, p_goal, p_month, p_plan_json, 'active', true);

  insert into public.training_days
    (id, user_id, plan_id, date, day_type, decision_reason)
  select x.id, v_user_id, p_plan_id, x.date, x.day_type, x.decision_reason
  from jsonb_to_recordset(p_days) as x(
    id uuid, date date, day_type text, decision_reason text
  );

  insert into public.training_sessions
    (id, user_id, training_day_id, session_type, title, goal, duration_min,
     intensity, warmup_json, main_work_json, cooldown_json, safety_notes)
  select x.id, v_user_id, x.training_day_id, x.session_type, x.title, x.goal,
         x.duration_min, x.intensity, x.warmup_json, x.main_work_json,
         x.cooldown_json, x.safety_notes
  from jsonb_to_recordset(p_sessions) as x(
    id uuid, training_day_id uuid, session_type text, title text, goal text,
    duration_min integer, intensity text, warmup_json jsonb,
    main_work_json jsonb, cooldown_json jsonb, safety_notes text
  );

  insert into public.session_exercises
    (id, user_id, session_id, order_index, name, section, reps, duration,
     distance, rest, coaching_cues)
  select x.id, v_user_id, x.session_id, x.order_index, x.name, x.section,
         x.reps, x.duration, x.distance, x.rest, x.coaching_cues
  from jsonb_to_recordset(p_exercises) as x(
    id uuid, session_id uuid, order_index integer, name text, section text,
    reps text, duration text, distance text, rest text, coaching_cues text
  );
end;
$$;

revoke all on function public.persist_training_plan_atomic(uuid, text, text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.persist_training_plan_atomic(uuid, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
