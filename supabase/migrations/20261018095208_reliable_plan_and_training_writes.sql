-- The source ID survives plan regeneration; no FK is used because historical
-- tests may predate the normalized session tables.
alter table public.athlete_profiles add column if not exists field_mas_source_session_id uuid;

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
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_days) <> 'array'
     or jsonb_typeof(p_sessions) <> 'array'
     or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'invalid plan payload' using errcode = '22023';
  end if;

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

  insert into public.training_plans (id, user_id, goal, month, plan_json, status, active)
  values (p_plan_id, v_user_id, p_goal, p_month, p_plan_json, 'active', true);

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
    insert into public.weekly_transitions
      (id,user_id,week_number,next_match_date,next_match_dates,no_match_next_week,confirmed_at)
    values ((p_transition->>'id')::uuid,v_user_id,(p_transition->>'weekNumber')::integer,
      (p_transition->>'nextMatchDate')::date,
      array(select jsonb_array_elements_text(p_transition->'nextMatchDates'))::date[],
      (p_transition->>'noMatchNextWeek')::boolean,(p_transition->>'confirmedAt')::timestamptz)
    on conflict (user_id,week_number) do update set
      next_match_date=excluded.next_match_date,next_match_dates=excluded.next_match_dates,
      no_match_next_week=excluded.no_match_next_week,confirmed_at=excluded.confirmed_at;
  end if;
end;
$$;

revoke all on function public.persist_training_plan_v2(uuid, text, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) from public;
grant execute on function public.persist_training_plan_v2(uuid, text, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) to authenticated;

-- Reject stale updates even from a legacy client replaying its offline queue.
create or replace function public.guard_training_write_order()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'session_logs' then
    if (old.completed = true and new.completed is distinct from true)
       or new.updated_at < old.updated_at then return old; end if;
  elsif tg_table_name = 'exercise_set_logs' then
    if new.performed_at < old.performed_at then return old; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_training_write_order() from public;
create trigger aa_guard_session_log_order before update on public.session_logs
  for each row execute function public.guard_training_write_order();
create trigger aa_guard_set_log_order before update on public.exercise_set_logs
  for each row execute function public.guard_training_write_order();

create index if not exists session_logs_owner_id_idx on public.session_logs(user_id,id);
create index if not exists running_activities_owner_date_id_idx
  on public.running_activities(user_id,date desc,id desc);

-- Deleting the current MAS source and clearing its derived values is one operation.
create or replace function public.delete_running_activity_atomic(p_activity_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_activity public.running_activities%rowtype;
  v_cleared boolean := false;
begin
  if v_owner is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_activity from public.running_activities
    where id=p_activity_id and user_id=v_owner for update;
  if not found then return false; end if;
  update public.athlete_profiles p set field_mas_kmh=null,field_mas_tested_at=null,
    field_mas_source_session_id=null,running_progression_level=0,running_progression_updated_at=null
    where p.user_id=v_owner and v_activity.is_field_mas_test and (
      p.field_mas_source_session_id=v_activity.session_id or
      (p.field_mas_source_session_id is null and p.field_mas_tested_at=v_activity.date and
       v_activity.id=(select a.id from public.running_activities a where a.user_id=v_owner
         and a.is_field_mas_test and a.date=v_activity.date order by a.created_at desc,a.id desc limit 1))
    );
  v_cleared := found;
  delete from public.running_activities where id=p_activity_id and user_id=v_owner;
  return v_cleared;
end;
$$;
revoke all on function public.delete_running_activity_atomic(uuid) from public;
grant execute on function public.delete_running_activity_atomic(uuid) to authenticated;
