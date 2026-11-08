-- BallWise: a session the athlete started or completed after a plan modification
-- (swap, lighter, add) blocked every later plan snapshot with "Executed slots must
-- remain". The client retried on each app focus, so one athlete could send hundreds
-- of rejected full-plan writes. Such sessions live outside plan_json but stay attached
-- to their training_day; when the snapshot keeps that day row nothing is lost.
-- Only that check changes; the rest of the function is identical to 20261018181225.

create or replace function public.persist_training_plan_v2(
  p_plan_id uuid,
  p_goal text,
  p_month text,
  p_plan_json jsonb,
  p_days jsonb,
  p_sessions jsonb,
  p_exercises jsonb,
  p_expected_plan_id uuid default null,
  p_transition jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_plan uuid;
  v_new_sessions uuid[];
  v_cycle uuid;
  v_week_start date;
  v_week_end date;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_days) <> 'array'
     or jsonb_typeof(p_sessions) <> 'array'
     or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'invalid plan payload' using errcode = '22023';
  end if;

  v_cycle:=coalesce(nullif(p_plan_json->0->>'cycleId','')::uuid,p_plan_id);
  -- Serializes snapshots for one owner. Old clients can still read the previous RPC.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  if exists (select 1 from public.training_plans where id = p_plan_id and user_id = v_user_id) then
    return; -- same operation retried after a lost response
  end if;
  select id into v_existing_plan from public.training_plans
    where user_id = v_user_id and active = true order by created_at desc limit 1;
  if v_existing_plan is distinct from p_expected_plan_id then
    raise exception 'Plan changed on another device; reload before saving' using errcode = '40001';
  end if;
  if jsonb_typeof(p_plan_json) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'invalid plan snapshot' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.training_sessions old_session
    join public.training_days old_day on old_day.id=old_session.training_day_id
    join public.session_logs l on l.session_id=old_session.id and l.user_id=v_user_id
    where old_session.user_id=v_user_id and old_day.plan_id=v_existing_plan
      and (l.completed or l.completion_status='started')
      and exists(select 1 from jsonb_to_recordset(p_days) d(date date) where d.date=old_day.date)
      and not exists(select 1 from jsonb_to_recordset(p_sessions) n(id uuid) where n.id=old_session.id)
      -- A session created by a plan modification (swap, lighter, add) is not part of
      -- plan_json. It stays attached to its training_day, so when the snapshot keeps
      -- that day row the executed session and its log survive unchanged.
      and not (
        exists(select 1 from jsonb_to_recordset(p_days) k(id uuid) where k.id=old_day.id)
        and exists(
          select 1 from public.session_modifications m
          where m.user_id=v_user_id and m.date=old_day.date
            and old_session.id::text in (
              m.new_session_id,
              m.new_session_json->>'dbId',
              m.new_session_json->'secondSession'->>'dbId'
            )
        )
      )
  ) then raise exception 'Executed slots must remain in the plan snapshot' using errcode='40001'; end if;
  -- Existing IDs can be reused only by their owner, for the same immutable prescription.
  if exists (
    select 1 from jsonb_to_recordset(p_sessions) as x(id uuid, training_day_id uuid,
      session_type text, title text, goal text, duration_min integer, intensity text,
      warmup_json jsonb, main_work_json jsonb, cooldown_json jsonb, safety_notes text)
    join public.training_sessions s on s.id = x.id
    where s.user_id <> v_user_id or row(s.training_day_id,s.session_type,s.title,s.goal,
      s.duration_min,s.intensity,s.warmup_json,s.main_work_json,s.cooldown_json,s.safety_notes)
      is distinct from row(x.training_day_id,x.session_type,x.title,x.goal,x.duration_min,
        x.intensity,x.warmup_json,x.main_work_json,x.cooldown_json,x.safety_notes)
  ) then
    raise exception 'Cannot reuse a session ID for a different prescription' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_days) x(id uuid, date date)
    join public.training_days d on d.id = x.id
    where d.user_id <> v_user_id or d.date <> x.date
  ) then
    raise exception 'Invalid training day identity' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_sessions) x(training_day_id uuid)
    where not exists (select 1 from jsonb_to_recordset(p_days) d(id uuid) where d.id=x.training_day_id)
  ) then
    raise exception 'Session does not belong to a snapshot day' using errcode = '22023';
  end if;
  select coalesce(array_agg(x.id),array[]::uuid[]) into v_new_sessions
    from jsonb_to_recordset(p_sessions) x(id uuid)
    where not exists (select 1 from public.training_sessions s where s.id=x.id);

  update public.training_plans
  set status = 'archived', active = false
  where user_id = v_user_id and active = true;

  insert into public.training_plans (id, user_id, goal, month, plan_json, status, active,cycle_id)
  values (p_plan_id, v_user_id, p_goal, p_month, p_plan_json, 'active', true,v_cycle);

  insert into public.training_days
    (id, user_id, plan_id, date, day_type, decision_reason)
  select x.id, v_user_id, p_plan_id, x.date, x.day_type, x.decision_reason
  from jsonb_to_recordset(p_days) as x(
    id uuid, date date, day_type text, decision_reason text
  )
  on conflict (id) do update set plan_id=excluded.plan_id, day_type=excluded.day_type,
    decision_reason=excluded.decision_reason
  where public.training_days.user_id=v_user_id;

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
  ) on conflict (id) do nothing;

  if exists (
    select 1 from jsonb_to_recordset(p_sessions) x(id uuid)
    where not exists (select 1 from public.training_sessions s where s.id=x.id and s.user_id=v_user_id)
  ) then
    raise exception 'Session identity belongs to another account' using errcode = '42501';
  end if;

  insert into public.session_exercises
    (id, user_id, session_id, order_index, name, section, reps, duration,
     distance, rest, coaching_cues)
  select x.id, v_user_id, x.session_id, x.order_index, x.name, x.section,
         x.reps, x.duration, x.distance, x.rest, x.coaching_cues
  from jsonb_to_recordset(p_exercises) as x(
    id uuid, session_id uuid, order_index integer, name text, section text,
    reps text, duration text, distance text, rest text, coaching_cues text
  ) where x.session_id = any(v_new_sessions);
  if p_transition is not null and p_transition <> 'null'::jsonb then
    v_week_start:=coalesce((p_transition->>'weekStart')::date,
      (select date_trunc('week',min((d->>'date')::date))::date from jsonb_array_elements(p_days) d)+(p_transition->>'weekNumber')::integer*7);
    v_week_end:=coalesce((p_transition->>'weekEnd')::date,v_week_start+6);
    if exists(select 1 from jsonb_array_elements_text(coalesce(p_transition->'nextMatchDates','[]'::jsonb)) d where d::date<v_week_start or d::date>v_week_end) then raise exception 'Match date is outside confirmed week' using errcode='22023'; end if;
    if nullif(p_transition->>'cycleId','')::uuid is not null and (p_transition->>'cycleId')::uuid<>v_cycle then raise exception 'Transition belongs to another cycle' using errcode='22023'; end if;
    insert into public.weekly_transitions
      (id,user_id,week_number,next_match_date,next_match_dates,no_match_next_week,confirmed_at,cycle_id,week_start,week_end)
    values ((p_transition->>'id')::uuid,v_user_id,(p_transition->>'weekNumber')::integer,
      (p_transition->>'nextMatchDate')::date,
      coalesce(p_transition->'nextMatchDates','[]'::jsonb),
      (p_transition->>'noMatchNextWeek')::boolean,(p_transition->>'confirmedAt')::timestamptz,v_cycle,v_week_start,v_week_end)
    on conflict (user_id,cycle_id,week_number) do update set
      next_match_date=excluded.next_match_date,next_match_dates=excluded.next_match_dates,
      no_match_next_week=excluded.no_match_next_week,confirmed_at=excluded.confirmed_at,week_start=excluded.week_start,week_end=excluded.week_end;
  end if;
end;
$$;

revoke all on function public.persist_training_plan_v2(uuid, text, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) from public;
grant execute on function public.persist_training_plan_v2(uuid, text, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) to authenticated;
