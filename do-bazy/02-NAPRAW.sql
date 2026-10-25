begin;
set local lock_timeout='15s';
set local statement_timeout='120s';

do $$
declare t text; signature text;
begin
 if to_regprocedure('public.save_profile_and_plan(jsonb,jsonb,jsonb,timestamp with time zone,boolean,date)') is not null then
  raise exception 'Runtime upgrade is already present or partially installed. Stop; inspect version and run 03-verification.sql. Do not reapply blindly.';
 end if;
 foreach t in array array['profiles','athlete_profiles','onboarding_answers','training_plans','training_days','training_sessions','session_exercises','session_logs','exercise_set_logs','running_activities','session_modifications','exercise_replacements','weekly_transitions','readiness_logs','pain_logs','consent_logs'] loop
  if to_regclass('public.'||t) is null then raise exception 'Required baseline table is missing: %; run staging preflight first',t; end if;
 end loop;
 foreach signature in array array['auth.uid()','auth.jwt()','public.record_consent(text,boolean)','public.latest_consent_is_accepted(uuid,text)','public.sanitize_session_log_lifecycle()','public.enforce_session_notes_health_consent()'] loop
  if to_regprocedure(signature) is null then raise exception 'Required baseline function is missing: %; this kit is not a fresh Supabase initializer',signature; end if;
 end loop;
 if exists(select 1 from public.session_logs where session_id is not null group by user_id,session_id having count(*)>1) then raise exception 'Duplicate session results need reviewed reconciliation; no result was removed'; end if;
end $$;



set local lock_timeout = '15s';
set local statement_timeout = '120s';

do $$
declare item record; rule record; current_type text;
begin
  for item in select * from (values
    ('athlete_profiles','unavailable_days'),('athlete_profiles','unavailable_equipment_ids'),
    ('athlete_profiles','food_allergies'),('athlete_profiles','food_intolerances'),
    ('athlete_profiles','food_exclusions'),('athlete_profiles','match_dates'),
    ('readiness_logs','red_flags'),('weekly_transitions','next_match_dates')
  ) v(table_name,column_name) loop
    select data_type into current_type from information_schema.columns
      where table_schema='public' and table_name=item.table_name and column_name=item.column_name;
    for rule in select c.conname from pg_constraint c join pg_class t on t.oid=c.conrelid
      join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname=item.table_name and c.contype='c'
        and pg_get_constraintdef(c.oid) ~ ('\m'||item.column_name||'\M') loop
      execute format('alter table public.%I drop constraint %I',item.table_name,rule.conname);
    end loop;
    execute format('alter table public.%I alter column %I drop default',item.table_name,item.column_name);
    if current_type <> 'jsonb' then
      execute format('alter table public.%I alter column %I type jsonb using coalesce(to_jsonb(%I),''[]''::jsonb)',item.table_name,item.column_name,item.column_name);
    end if;
    execute format('update public.%I set %I=''[]''::jsonb where %I is null or %I in (''{}''::jsonb,''null''::jsonb)',item.table_name,item.column_name,item.column_name,item.column_name);
    execute format('alter table public.%I alter column %I set default ''[]''::jsonb, alter column %I set not null',item.table_name,item.column_name,item.column_name);
  end loop;
end $$;

create or replace function public.valid_training_list(value jsonb, maximum integer)
returns boolean language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(value)='array' then jsonb_array_length(value)<=maximum else false end;
$$;
revoke all on function public.valid_training_list(jsonb,integer) from public;
grant execute on function public.valid_training_list(jsonb,integer) to authenticated,service_role;
alter table public.athlete_profiles
  add constraint athlete_unavailable_days_json check (public.valid_training_list(unavailable_days,7) and unavailable_days <@ '[1,2,3,4,5,6,7]'::jsonb),
  add constraint athlete_equipment_json check (public.valid_training_list(unavailable_equipment_ids,100)),
  add constraint athlete_allergies_json check (public.valid_training_list(food_allergies,64)),
  add constraint athlete_intolerances_json check (public.valid_training_list(food_intolerances,64)),
  add constraint athlete_exclusions_json check (public.valid_training_list(food_exclusions,64)),
  add constraint athlete_matches_json check (public.valid_training_list(match_dates,64)),
  add constraint athlete_allergies_consistent_json check ((fuel_allergy_status='has_allergies' and jsonb_array_length(food_allergies)>0) or (fuel_allergy_status<>'has_allergies' and food_allergies='[]'::jsonb));
alter table public.readiness_logs add constraint readiness_red_flags_json check (
  public.valid_training_list(red_flags,5) and red_flags <@ '["chest_pain","fainting","breathlessness","head_injury","deformity_or_no_weight"]'::jsonb);
alter table public.weekly_transitions add constraint weekly_matches_json check (public.valid_training_list(next_match_dates,2));
alter table public.athlete_profiles add column if not exists field_mas_source_session_id uuid;
alter table public.athlete_profiles add column if not exists pain_locations jsonb not null default '[]'::jsonb;
alter table public.athlete_profiles add constraint athlete_pain_locations_json check (
 public.valid_training_list(pain_locations,8) and pain_locations <@ '["knee","back","ankle","hamstring","groin","hip","shoulder","other"]'::jsonb);

do $$ begin
 if exists(select 1 from public.session_logs where session_id is not null group by user_id,session_id having count(*)>1) then
  raise exception 'Duplicate session logs require reviewed reconciliation before migration';
 end if;
end $$;
create unique index if not exists session_logs_owner_session_key on public.session_logs(user_id,session_id);

alter table public.training_plans add column if not exists cycle_id uuid;
update public.training_plans set cycle_id=coalesce(nullif(plan_json->0->>'cycleId','')::uuid,id) where cycle_id is null;
alter table public.training_plans alter column cycle_id set not null;
alter table public.training_plans alter column cycle_id set default gen_random_uuid();
with ranked as (select id,row_number() over(partition by user_id order by created_at desc,id desc) as n from public.training_plans where active)
 update public.training_plans p set active=false,status='archived' from ranked r where r.id=p.id and r.n>1;
create unique index if not exists training_plans_one_active_owner on public.training_plans(user_id) where active;
alter table public.weekly_transitions add column if not exists cycle_id uuid,
 add column if not exists week_start date, add column if not exists week_end date;
do $$ declare r record; begin
 for r in select conname from pg_constraint where conrelid='public.weekly_transitions'::regclass and contype='u' loop
  execute format('alter table public.weekly_transitions drop constraint %I',r.conname);
 end loop;
end $$;
create unique index if not exists weekly_transitions_owner_cycle_week on public.weekly_transitions(user_id,cycle_id,week_number);
alter table public.weekly_transitions add constraint weekly_transition_scope check (
 (cycle_id is null and week_start is null and week_end is null) or
 (cycle_id is not null and week_start is not null and week_end between week_start and week_start+6));

alter table public.session_logs add column if not exists write_version bigint not null default 0,
 add column if not exists server_updated_at timestamptz not null default now(),
 add column if not exists execution_snapshot jsonb;
alter table public.exercise_set_logs add column if not exists write_version bigint not null default 0,
 add column if not exists server_updated_at timestamptz not null default now();
alter table public.running_activities add column if not exists write_version bigint not null default 0,
 add column if not exists server_updated_at timestamptz not null default now(),
 add column if not exists interval_results jsonb not null default '[]'::jsonb,
 add column if not exists started_at timestamptz, add column if not exists ended_at timestamptz,
 add column if not exists progression_applied boolean not null default false;
alter table public.running_activities add constraint running_interval_summary_json check(public.valid_training_list(interval_results,200));

create table if not exists public.training_write_receipts(
 operation_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,target_id uuid not null,result_version bigint not null,created_at timestamptz not null default now());
alter table public.training_write_receipts enable row level security;
create policy own_training_write_receipts on public.training_write_receipts for all to authenticated
 using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert on public.training_write_receipts to authenticated;
grant all on public.training_write_receipts to service_role;
create index training_write_receipts_owner_target on public.training_write_receipts(user_id,kind,target_id);

create or replace function public.sanitize_session_log_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then new.user_id:=auth.uid(); end if;
 if tg_op='UPDATE' then
  new.write_version:=old.write_version+1;
  if old.execution_snapshot is not null then new.execution_snapshot:=old.execution_snapshot; end if;
 else new.write_version:=1; end if;
 new.server_updated_at:=clock_timestamp();
 new.updated_at:=coalesce(new.updated_at,new.server_updated_at);
 if new.updated_at>now()+interval '5 minutes' then raise exception 'Future event timestamp' using errcode='22023'; end if;
 if new.completion_status='started' then
  new.completed:=false;
  new.started_at:=case when tg_op='UPDATE' then coalesce(old.started_at,new.started_at,new.updated_at) else coalesce(new.started_at,new.updated_at) end;
  new.ended_at:=null;
 elsif new.completion_status='completed' then
  new.completed:=true;
  new.started_at:=case when tg_op='UPDATE' then coalesce(old.started_at,new.started_at,new.updated_at) else coalesce(new.started_at,new.updated_at) end;
  new.ended_at:=coalesce(new.ended_at,case when tg_op='UPDATE' then old.ended_at else null end,new.updated_at);
 else new.completed:=false; new.ended_at:=null;
 end if;
 if new.started_at>now()+interval '5 minutes' or new.ended_at>now()+interval '5 minutes' or new.ended_at<new.started_at then
  raise exception 'Invalid session chronology' using errcode='22023';
 end if;
 return new;
end $$;
create or replace function public.guard_training_write_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='session_logs' then
  if old.completed and not new.completed then return null; end if;
  if current_setting('ballwise.versioned_write',true) is distinct from 'on' and new.updated_at<old.updated_at then return null; end if;
 elsif tg_table_name='exercise_set_logs' then
  if current_setting('ballwise.versioned_write',true) is distinct from 'on' and new.performed_at<old.performed_at then return null; end if;
  new.write_version:=old.write_version+1; new.server_updated_at:=clock_timestamp();
 end if;
 return new;
end $$;

drop trigger if exists aa_guard_session_log_order on public.session_logs;
create trigger aa_guard_session_log_order before update on public.session_logs for each row execute function public.guard_training_write_order();
drop trigger if exists aa_guard_set_log_order on public.exercise_set_logs;
create trigger aa_guard_set_log_order before update on public.exercise_set_logs for each row execute function public.guard_training_write_order();

create or replace function public.check_training_parent_owner()
returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_owner uuid;
begin
 if tg_op='UPDATE' and new.user_id=old.user_id then
  case tg_table_name
   when 'training_days' then if new.plan_id is not distinct from old.plan_id then return new; end if;
   when 'training_sessions' then if new.training_day_id is not distinct from old.training_day_id then return new; end if;
   else if new.session_id is not distinct from old.session_id then return new; end if;
  end case;
 end if;
 if tg_table_name='training_days' then
  select user_id into parent_owner from public.training_plans where id=new.plan_id;
 elsif tg_table_name='training_sessions' then
  select user_id into parent_owner from public.training_days where id=new.training_day_id;
 elsif tg_table_name in('session_logs','exercise_set_logs','running_activities','session_exercises') then
  if new.session_id is null and tg_table_name='exercise_set_logs' then return new; end if;
  select user_id into parent_owner from public.training_sessions where id=new.session_id;
 end if;
 if parent_owner is null or parent_owner is distinct from new.user_id then raise exception 'Invalid training parent owner' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public.check_training_parent_owner() from public;
do $$ declare t text; begin
 foreach t in array array['training_days','training_sessions','session_logs','exercise_set_logs','running_activities','session_exercises'] loop
  execute format('create trigger aa_parent_owner before insert or update on public.%I for each row execute function public.check_training_parent_owner()',t);
 end loop;
end $$;

create or replace function public.enforce_pain_location_consent()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.latest_consent_is_accepted(auth.uid(),'health_data') then new.pain_locations:='[]'::jsonb; end if;
 return new;
end $$;
revoke all on function public.enforce_pain_location_consent() from public;
create trigger athlete_pain_location_consent before insert or update on public.athlete_profiles for each row execute function public.enforce_pain_location_consent();
create or replace function public.clear_session_notes_after_health_withdrawal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.consent_type='health_data' and not new.accepted then
  update public.athlete_profiles set pain_locations='[]'::jsonb where user_id=new.user_id;
  update public.session_logs set notes=null where user_id=new.user_id and notes is not null;
 end if; return new;
end $$;

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
  ) then raise exception 'Executed slots must remain in the plan snapshot' using errcode='40001'; end if;
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


create or replace function public.next_running_level(current_level integer,rpe integer,results jsonb)
returns integer language plpgsql immutable security invoker set search_path='' as $$
declare observed integer; planned integer; done integer; pace_count integer; consistency numeric; adherence boolean; rate numeric; current_value integer:=greatest(0,least(3,current_level));
begin
 with work as(select r from jsonb_array_elements(coalesce(results,'[]'::jsonb)) r where r->>'kind'='work'),
 finished as(select r from work where (r->>'completed')::boolean and case
  when r->>'targetMode'='time' and (r->>'targetValue')::numeric>0 then (r->>'durationSec')::numeric>=(r->>'targetValue')::numeric*.95
  when r->>'targetMode'='distance' and (r->>'targetValue')::numeric>0 then (r->>'distanceM')::numeric>=(r->>'targetValue')::numeric*.95 else true end)
 select (select count(*) from work),greatest((select count(*) from work),(select coalesce(max((r->>'repeatTotal')::integer),1) from work)),
 count(*),count(*) filter(where (r->>'paceSecPerKm')::numeric>0),
 case when count(*) filter(where (r->>'paceSecPerKm')::numeric>0)>=2 then min((r->>'paceSecPerKm')::numeric)/nullif(max((r->>'paceSecPerKm')::numeric),0) else null end,
 coalesce(bool_and((r->>'targetPaceFastestSecPerKm') is null or (r->>'targetPaceSlowestSecPerKm') is null or
  ((r->>'paceSecPerKm')::numeric between (r->>'targetPaceFastestSecPerKm')::numeric*.97 and (r->>'targetPaceSlowestSecPerKm')::numeric*1.03)),true)
 into observed,planned,done,pace_count,consistency,adherence from finished;
 if observed=0 then return current_value; end if;
 rate:=done::numeric/planned;
 if rpe>=9 or rate<.75 or consistency<.88 then return greatest(0,current_value-1); end if;
 if rpe between 1 and 7 and pace_count=done and consistency>=.94 and rate>=.95 and adherence then return least(3,current_value+1); end if;
 return current_value;
end $$;
revoke all on function public.next_running_level(integer,integer,jsonb) from public;
grant execute on function public.next_running_level(integer,integer,jsonb) to authenticated,service_role;

create or replace function public.training_expected_version(p_kind text,p_target uuid,p_expected bigint,p_payload jsonb)
returns bigint language plpgsql stable security invoker set search_path='' as $$
declare ids jsonb:=p_payload->'_predecessor_operation_ids'; predecessor bigint;
begin
 if ids is null then return coalesce(p_expected,0); end if;
 if not public.valid_training_list(ids,120) then raise exception 'Invalid predecessor list' using errcode='22023'; end if;
 select max(result_version) into predecessor from public.training_write_receipts
 where user_id=auth.uid() and kind=p_kind and target_id=p_target
 and operation_id in(select value::uuid from jsonb_array_elements_text(ids));
 return greatest(coalesce(p_expected,0),coalesce(predecessor,0));
end $$;
revoke all on function public.training_expected_version(text,uuid,bigint,jsonb) from public;
grant execute on function public.training_expected_version(text,uuid,bigint,jsonb) to authenticated;

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
 if current_row.completed and activity.id is not null and not activity.is_field_mas_test and not activity.progression_applied then
  select public.next_running_level(running_progression_level,current_row.rpe,activity.interval_results) into new_level from public.athlete_profiles where user_id=owner for update;
  update public.athlete_profiles set running_progression_level=new_level,running_progression_updated_at=current_row.ended_at where user_id=owner and (field_mas_tested_at is null or activity.date>=field_mas_tested_at);
  update public.running_activities set progression_applied=true where id=activity.id;
 end if;
 insert into public.training_write_receipts values(p_operation_id,owner,'session_log',p_session_id,current_row.write_version,now());
 perform set_config('ballwise.versioned_write','off',true);
 return to_jsonb(current_row)||jsonb_build_object('profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
end $$;
revoke all on function public.save_training_log(uuid,uuid,bigint,jsonb) from public;
grant execute on function public.save_training_log(uuid,uuid,bigint,jsonb) to authenticated;

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
 insert into public.exercise_set_logs(id,user_id,session_id,exercise_key,exercise_name,set_number,weight_kg,reps,rir,metric_kind,metric_value,performed_at,write_version)
 values(target,owner,(p_payload->>'session_id')::uuid,p_payload->>'exercise_key',p_payload->>'exercise_name',(p_payload->>'set_number')::integer,
 (p_payload->>'weight_kg')::numeric,(p_payload->>'reps')::integer,(p_payload->>'rir')::integer,p_payload->>'metric_kind',(p_payload->>'metric_value')::numeric,
 coalesce((p_payload->>'performed_at')::timestamptz,clock_timestamp()),1)
 on conflict(user_id,session_id,exercise_key,set_number) do update set weight_kg=excluded.weight_kg,reps=excluded.reps,rir=excluded.rir,
 metric_kind=excluded.metric_kind,metric_value=excluded.metric_value,performed_at=excluded.performed_at returning * into current_row;
 insert into public.training_write_receipts values(p_operation_id,owner,'exercise_set_log',current_row.id,current_row.write_version,now());
 perform set_config('ballwise.versioned_write','off',true);
 return to_jsonb(current_row);
end $$;
revoke all on function public.save_exercise_set(uuid,jsonb,bigint) from public;
grant execute on function public.save_exercise_set(uuid,jsonb,bigint) to authenticated;

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
 elsif exists(select 1 from public.session_logs where user_id=owner and session_id=sid and completed) then
  select public.next_running_level(p.running_progression_level,l.rpe,current_row.interval_results) into new_level
   from public.athlete_profiles p join public.session_logs l on l.user_id=p.user_id where p.user_id=owner and l.session_id=sid for update of p;
  update public.athlete_profiles set running_progression_level=new_level,running_progression_updated_at=coalesce(current_row.ended_at,clock_timestamp()) where user_id=owner and (field_mas_tested_at is null or current_row.date>=field_mas_tested_at);
  update public.running_activities set progression_applied=true where id=current_row.id returning * into current_row;
 end if;
 insert into public.training_write_receipts values(p_operation_id,owner,'running_activity',sid,current_row.write_version,now());
 return jsonb_build_object('activity',to_jsonb(current_row),'profile',(select to_jsonb(p) from public.athlete_profiles p where user_id=owner));
end $$;
revoke all on function public.save_running_result(uuid,jsonb,bigint) from public;
grant execute on function public.save_running_result(uuid,jsonb,bigint) to authenticated;

create or replace function public.insert_owned_training_session(p_session jsonb,p_exercises jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare existing public.training_sessions%rowtype;
begin
 if p_session is null or p_session='null'::jsonb then return; end if;
 select * into existing from public.training_sessions where id=(p_session->>'id')::uuid;
 if found then
  if existing.user_id<>auth.uid() or existing.training_day_id is distinct from (p_session->>'training_day_id')::uuid then
   raise exception 'Cannot reuse session identity' using errcode='42501';
  end if;
  if row(existing.session_type,existing.title,existing.goal,existing.duration_min,existing.intensity,existing.warmup_json,existing.main_work_json,existing.cooldown_json,existing.safety_notes)
   is distinct from row(p_session->>'session_type',p_session->>'title',p_session->>'goal',(p_session->>'duration_min')::integer,p_session->>'intensity',coalesce(p_session->'warmup_json','[]'::jsonb),coalesce(p_session->'main_work_json','[]'::jsonb),coalesce(p_session->'cooldown_json','[]'::jsonb),p_session->>'safety_notes') then
   raise exception 'Cannot alter existing prescription' using errcode='22023'; end if;
  return;
 end if;
 insert into public.training_sessions(id,user_id,training_day_id,session_type,title,goal,duration_min,intensity,warmup_json,main_work_json,cooldown_json,safety_notes)
 values((p_session->>'id')::uuid,auth.uid(),(p_session->>'training_day_id')::uuid,p_session->>'session_type',p_session->>'title',p_session->>'goal',
 (p_session->>'duration_min')::integer,p_session->>'intensity',coalesce(p_session->'warmup_json','[]'::jsonb),coalesce(p_session->'main_work_json','[]'::jsonb),
 coalesce(p_session->'cooldown_json','[]'::jsonb),p_session->>'safety_notes');
 insert into public.session_exercises(id,user_id,session_id,order_index,name,section,reps,duration,distance,rest,coaching_cues)
 select coalesce(x.id,gen_random_uuid()),auth.uid(),(p_session->>'id')::uuid,x.order_index,x.name,x.section,x.reps,x.duration,x.distance,x.rest,x.coaching_cues
 from jsonb_to_recordset(coalesce(p_exercises,'[]'::jsonb)) x(id uuid,order_index integer,name text,section text,reps text,duration text,distance text,rest text,coaching_cues text);
end $$;
revoke all on function public.insert_owned_training_session(jsonb,jsonb) from public;
grant execute on function public.insert_owned_training_session(jsonb,jsonb) to authenticated;

create or replace function public.apply_plan_modification(p_operation_id uuid,p_modification jsonb,p_session jsonb,p_exercises jsonb,p_expected_plan_id uuid,
 p_second_session jsonb default null,p_second_exercises jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); active_id uuid; mid uuid:=(p_modification->>'id')::uuid; original jsonb:=p_modification->'original_session_json';
 old_id uuid; new_ids uuid[]; result public.session_modifications%rowtype; receipt public.training_write_receipts%rowtype;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into receipt from public.training_write_receipts where operation_id=p_operation_id;
 if found then
  if receipt.kind<>'modification' or receipt.target_id<>mid then raise exception 'Operation ID reused' using errcode='22023'; end if;
  return jsonb_build_object('modification',(select to_jsonb(m) from public.session_modifications m where id=mid and user_id=owner));
 end if;
 select id into active_id from public.training_plans where user_id=owner and active for update;
 if active_id is distinct from p_expected_plan_id then raise exception 'Plan changed; reload before modifying' using errcode='40001'; end if;
 new_ids:=array[(p_session->>'id')::uuid,(p_second_session->>'id')::uuid];
 for old_id in
  select nullif(v,'')::uuid from unnest(array[original->>'dbId',original->'secondSession'->>'dbId']) v where v is not null
  union
  select nullif(v,'')::uuid from public.training_plans p cross join lateral jsonb_array_elements(p.plan_json) d
   cross join lateral unnest(array[d->>'dbId',d->'secondSession'->>'dbId']) v
   where p.id=active_id and d->>'date'=p_modification->>'date' and v is not null
  union
  select nullif(v,'')::uuid from public.session_modifications m
   cross join lateral unnest(array[m.new_session_json->>'dbId',m.new_session_json->'secondSession'->>'dbId']) v
   where m.user_id=owner and m.date=(p_modification->>'date')::date and m.active and v is not null
 loop
  if not(old_id=any(array_remove(new_ids,null))) and exists(select 1 from public.session_logs where user_id=owner and session_id=old_id and (completed or completion_status='started')) then
   raise exception 'Cannot replace a started or completed slot' using errcode='40001';
  end if;
 end loop;
 if not exists(select 1 from public.training_days where id=(p_session->>'training_day_id')::uuid and user_id=owner and plan_id=active_id and date=(p_modification->>'date')::date) then
  raise exception 'Modification day does not belong to active plan' using errcode='42501'; end if;
 perform public.insert_owned_training_session(p_session,p_exercises);
 perform public.insert_owned_training_session(p_second_session,p_second_exercises);
 if coalesce((p_modification->>'replace_second')::boolean,false) then update public.session_modifications set active=false where user_id=owner and date=(p_modification->>'date')::date and type='add' and active; end if;
 if p_modification->>'type'='swap' then update public.session_modifications set active=false where user_id=owner and date=(p_modification->>'date')::date and type='swap' and active; end if;
 insert into public.session_modifications(id,user_id,date,type,reason,safety_status,original_session_id,new_session_id,original_session_json,new_session_json,active)
 values(mid,owner,(p_modification->>'date')::date,p_modification->>'type',p_modification->>'reason',coalesce(p_modification->>'safety_status','planned'),
 p_modification->>'original_session_id',p_modification->>'new_session_id',original,p_modification->'new_session_json',true) returning * into result;
 insert into public.training_write_receipts values(p_operation_id,owner,'modification',mid,1,now());
 return jsonb_build_object('modification',to_jsonb(result),'session',p_session,'secondSession',p_second_session);
end $$;
revoke all on function public.apply_plan_modification(uuid,jsonb,jsonb,jsonb,uuid,jsonb,jsonb) from public;
grant execute on function public.apply_plan_modification(uuid,jsonb,jsonb,jsonb,uuid,jsonb,jsonb) to authenticated;

create or replace function public.undo_plan_modification(p_modification_id uuid,p_operation_id uuid default null,p_expected_plan_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); modification public.session_modifications%rowtype; sid uuid; active_id uuid;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into modification from public.session_modifications where id=p_modification_id and user_id=owner for update;
 if not found or not modification.active then return; end if;
 if p_expected_plan_id is not null then
  select id into active_id from public.training_plans where user_id=owner and active;
  if active_id is distinct from p_expected_plan_id then raise exception 'Plan changed; reload before modifying' using errcode='40001'; end if;
 end if;
 for sid in select nullif(v,'')::uuid from unnest(array[modification.new_session_json->>'dbId',modification.new_session_json->'secondSession'->>'dbId']) v where v is not null loop
  if exists(select 1 from public.session_logs where user_id=owner and session_id=sid and (completed or completion_status='started')) then raise exception 'Cannot undo an executed slot' using errcode='40001'; end if;
 end loop;
 update public.session_modifications set active=false where id=p_modification_id;
end $$;
revoke all on function public.undo_plan_modification(uuid,uuid,uuid) from public;
grant execute on function public.undo_plan_modification(uuid,uuid,uuid) to authenticated;

create or replace function public.save_readiness_checkin(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); result public.readiness_logs%rowtype; d date:=(p_payload->>'date')::date;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.readiness_logs(user_id,date,sleep,energy,fatigue,soreness,stress,pain_level,pain_location,pain_onset,alters_movement,red_flags,overall,updated_at)
 values(owner,d,(p_payload->>'sleep')::integer,(p_payload->>'energy')::integer,(p_payload->>'fatigue')::integer,(p_payload->>'soreness')::integer,
 (p_payload->>'stress')::integer,(p_payload->>'pain_level')::integer,p_payload->>'pain_location',p_payload->>'pain_onset',coalesce((p_payload->>'alters_movement')::boolean,false),
 coalesce(p_payload->'red_flags','[]'::jsonb),(p_payload->>'overall')::integer,clock_timestamp())
 on conflict(user_id,date) do update set sleep=excluded.sleep,energy=excluded.energy,fatigue=excluded.fatigue,soreness=excluded.soreness,stress=excluded.stress,
 pain_level=excluded.pain_level,pain_location=excluded.pain_location,pain_onset=excluded.pain_onset,alters_movement=excluded.alters_movement,red_flags=excluded.red_flags,overall=excluded.overall,updated_at=excluded.updated_at returning * into result;
 if result.pain_level>0 then
  insert into public.pain_logs(user_id,date,pain_level,pain_location,notes) values(owner,d,result.pain_level,result.pain_location,null)
   on conflict(user_id,date) do update set pain_level=excluded.pain_level,pain_location=excluded.pain_location,notes=null;
 else delete from public.pain_logs where user_id=owner and date=d; end if;
 return to_jsonb(result);
end $$;
revoke all on function public.save_readiness_checkin(jsonb) from public;
grant execute on function public.save_readiness_checkin(jsonb) to authenticated;

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
 return cleared;
end $$;

revoke all on function public.delete_running_activity_atomic(uuid) from public;
grant execute on function public.delete_running_activity_atomic(uuid) to authenticated;

create or replace function public.merge_own_profile_row(p_table text,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare columns text; projections text; assignments text; updates text; result jsonb; present boolean;
begin
 if auth.uid() is null or p_table not in('profiles','athlete_profiles') then raise exception 'Invalid profile command' using errcode='42501'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Profile patch must be an object' using errcode='22023'; end if;
 select string_agg(format('%I',a.attname),',' order by a.attnum),
  string_agg(format('r.%I',a.attname),',' order by a.attnum),
  string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum),
  string_agg(format('%I=r.%I',a.attname,a.attname),',' order by a.attnum)
 into columns,projections,assignments,updates from pg_attribute a
 where a.attrelid=format('public.%I',p_table)::regclass and a.attnum>0 and not a.attisdropped
  and a.attname not in('id','user_id','created_at','updated_at') and p_patch ? a.attname;
 if columns is null then
  execute format('select to_jsonb(t) from public.%I t where user_id=$1',p_table) into result using auth.uid();
  return result;
 end if;
 execute format('select exists(select 1 from public.%I where user_id=$1)',p_table) into present using auth.uid();
 if present then
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$2) r where t.user_id=$1 returning to_jsonb(t)',p_table,updates,p_table)
   into result using auth.uid(),p_patch;
  return result;
 end if;
 execute format('insert into public.%I as t(user_id,%s) select $1,%s from jsonb_populate_record(null::public.%I,$2) r on conflict(user_id) do update set %s returning to_jsonb(t)',p_table,columns,projections,p_table,assignments)
 into result using auth.uid(),p_patch;
 return result;
end $$;
revoke all on function public.merge_own_profile_row(text,jsonb) from public;
grant execute on function public.merge_own_profile_row(text,jsonb) to authenticated;

create or replace function public.save_profile_and_plan(p_profile jsonb,p_athlete jsonb,p_plan jsonb default null,
 p_expected_profile_updated_at timestamptz default null,p_clear_transitions boolean default false,p_from_date date default current_date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); old_updated timestamptz; profile_result jsonb; athlete_result jsonb; plan_result jsonb; plan_cycle uuid; was_complete boolean;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select updated_at into old_updated from public.athlete_profiles where user_id=owner for update;
 if found and old_updated is distinct from p_expected_profile_updated_at then raise exception 'Profile changed; reload before editing' using errcode='40001'; end if;
 select onboarding_completed into was_complete from public.profiles where user_id=owner;
 profile_result:=public.merge_own_profile_row('profiles',p_profile);
 athlete_result:=public.merge_own_profile_row('athlete_profiles',p_athlete);
 if coalesce((profile_result->>'onboarding_completed')::boolean,false) and not coalesce(was_complete,false) then
  insert into public.onboarding_answers(user_id,answers_json,completed_at) values(owner,
   jsonb_build_object('schema_version',2,'completed',true,'account_owner_type',athlete_result->>'account_owner_type'),clock_timestamp());
 end if;
 if p_plan is not null and p_plan<>'null'::jsonb then
  perform public.persist_training_plan_v2((p_plan->>'p_plan_id')::uuid,p_plan->>'p_goal',p_plan->>'p_month',p_plan->'p_plan_json',p_plan->'p_days',p_plan->'p_sessions',p_plan->'p_exercises',
   (p_plan->>'p_expected_plan_id')::uuid,p_plan->'p_transition');
  plan_result:=p_plan->'p_plan_json';
  plan_cycle:=nullif(plan_result->0->>'cycleId','')::uuid;
  update public.session_modifications set active=false where user_id=owner and date>=p_from_date and active;
  if p_clear_transitions then delete from public.weekly_transitions where user_id=owner and cycle_id=plan_cycle; end if;
 end if;
 return jsonb_build_object('profile',profile_result,'athlete',athlete_result,'plan_json',plan_result);
end $$;
revoke all on function public.save_profile_and_plan(jsonb,jsonb,jsonb,timestamptz,boolean,date) from public;
grant execute on function public.save_profile_and_plan(jsonb,jsonb,jsonb,timestamptz,boolean,date) to authenticated;

create or replace function public.set_equipment_replacement(p_operation_id uuid,p_replacement jsonb default null,p_undo_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); rid uuid:=coalesce(p_undo_id,(p_replacement->>'id')::uuid); receipt public.training_write_receipts%rowtype;
 replacement public.exercise_replacements%rowtype; unavailable jsonb; profile_time timestamptz;
begin
 if owner is null or p_operation_id is null or rid is null then raise exception 'Authentication and replacement required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select * into receipt from public.training_write_receipts where operation_id=p_operation_id;
 if found and (receipt.kind<>'equipment_replacement' or receipt.target_id<>rid) then raise exception 'Operation ID reused' using errcode='22023'; end if;
 if not found then
  if p_undo_id is not null then
   update public.exercise_replacements set active=false where id=rid and user_id=owner returning * into replacement;
   if not found then raise exception 'Replacement not found' using errcode='42501'; end if;
  else
   insert into public.exercise_replacements(id,user_id,date,exercise_id,original_json,replacement_json,equipment_ids,active)
   values(rid,owner,(p_replacement->>'date')::date,p_replacement->>'exercise_id',p_replacement->'original_json',p_replacement->'replacement_json',
    array(select jsonb_array_elements_text(coalesce(p_replacement->'equipment_ids','[]'::jsonb))),true) returning * into replacement;
  end if;
  select coalesce(jsonb_agg(distinct equipment_id),'[]'::jsonb) into unavailable from public.exercise_replacements r cross join lateral unnest(r.equipment_ids) equipment_id where r.user_id=owner and r.active;
  update public.athlete_profiles set unavailable_equipment_ids=unavailable where user_id=owner returning updated_at into profile_time;
  if not found then raise exception 'Athlete profile required' using errcode='42501'; end if;
  insert into public.training_write_receipts values(p_operation_id,owner,'equipment_replacement',rid,1,now());
 else
  select * into replacement from public.exercise_replacements where id=rid and user_id=owner;
  select unavailable_equipment_ids,updated_at into unavailable,profile_time from public.athlete_profiles where user_id=owner;
 end if;
 return jsonb_build_object('replacement',to_jsonb(replacement),'unavailable_equipment_ids',unavailable,'profile_updated_at',profile_time);
end $$;
revoke all on function public.set_equipment_replacement(uuid,jsonb,uuid) from public;
grant execute on function public.set_equipment_replacement(uuid,jsonb,uuid) to authenticated;

create or replace function public.record_consent_state(p_consent_type text,p_accepted boolean,p_expected_profile_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); before_updated timestamptz; result jsonb;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':training',0));
 select updated_at into before_updated from public.athlete_profiles where user_id=owner for update;
 if p_expected_profile_updated_at is not null and before_updated is distinct from p_expected_profile_updated_at then raise exception 'Profile changed; reload before consent-linked editing' using errcode='40001'; end if;
 perform public.record_consent(p_consent_type,p_accepted);
 select to_jsonb(p) into result from public.athlete_profiles p where user_id=owner;
 return result;
end $$;
revoke all on function public.record_consent_state(text,boolean,timestamptz) from public;
grant execute on function public.record_consent_state(text,boolean,timestamptz) to authenticated;


create or replace function public.record_consent(
  p_consent_type text,
  p_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  canonical_text text;
  canonical_scope text;
  canonical_version constant text := '2.3';
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_accepted is null then
    raise exception 'Consent decision is required';
  end if;

  select
    case p_consent_type
      when 'terms' then
        'Akceptuję Regulamin korzystania z aplikacji BallWise.'
      when 'privacy' then
        'Potwierdzam zapoznanie się z Polityką prywatności BallWise.'
      when 'health_data' then
        'Wyrażam wyraźną zgodę na przetwarzanie danych o gotowości i zdrowiu: snu, energii, zmęczenia, bolesności, stresu, motywacji, bólu oraz — jeśli sam je podam — alergii i nietolerancji żywnościowych. Dane służą wyłącznie personalizacji treningu i bezpieczeństwu Fuel. Po osobnym zaznaczeniu w panelu kopii mogę również wysłać na swoje konto własne notatki zawierające dane o zdrowiu. Brak zgody nie blokuje aplikacji; plan pozostanie ostrożny, a Fuel poprosi o każdorazowe potwierdzenie składników.'
      when 'marketing' then
        'Chcę otrzymywać informacje marketingowe dotyczące BallWise. Zgodę mogę wycofać w dowolnym momencie.'
      when 'fuel_precision' then
        'Wyrażam wyraźną zgodę na używanie wieku i opcjonalnej masy ciała wyłącznie do obliczania orientacyjnych zakresów paliwa przed treningiem. Fuel działa także bez tej zgody. Zgodę mogę wycofać w aplikacji, a masa ciała zostanie usunięta.'
      when 'guardian_authorization' then
        'Oświadczam, że jestem rodzicem lub opiekunem zawodnika i mogę prowadzić jego profil oraz podejmować decyzje dotyczące danych tego konta.'
      else null
    end,
    case p_consent_type
      when 'terms' then 'terms_of_service'
      when 'privacy' then 'privacy_notice'
      when 'health_data' then 'readiness_and_fuel_safety'
      when 'marketing' then 'marketing'
      when 'fuel_precision' then 'fuel_personalization'
      when 'guardian_authorization' then 'child_profile'
      else null
    end
  into canonical_text, canonical_scope;

  if canonical_text is null or canonical_scope is null then
    raise exception 'Unsupported consent type';
  end if;

  if p_consent_type = 'health_data' and p_accepted is false then
    perform public.withdraw_health_data_consent(canonical_version, canonical_text);
    return;
  end if;

  insert into public.consent_logs (
    user_id,
    consent_type,
    accepted,
    version,
    text_snapshot,
    actor_type,
    actor_email,
    scope,
    withdrawn_at
  ) values (
    current_user_id,
    p_consent_type,
    p_accepted,
    canonical_version,
    canonical_text,
    'athlete',
    auth.jwt() ->> 'email',
    canonical_scope,
    case when p_accepted then null else now() end
  );

  if p_consent_type = 'fuel_precision' and p_accepted is false then
    update public.athlete_profiles
       set fuel_precision_enabled = false,
           weight_optional = null
     where user_id = current_user_id;
  end if;
end;
$$;

revoke execute on function public.record_consent(text, boolean)
  from public, anon;
grant execute on function public.record_consent(text, boolean)
  to authenticated, service_role;


create or replace function public.latest_consent_is_accepted_for_version(
  p_user_id uuid,
  p_consent_type text,
  p_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select accepted is true and version = p_version
      from public.consent_logs
      where user_id = p_user_id
        and consent_type = p_consent_type
      order by accepted_at desc, id desc
      limit 1
    ),
    false
  );
$$;

revoke execute on function public.latest_consent_is_accepted_for_version(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.latest_consent_is_accepted_for_version(uuid, text, text)
  to service_role;


create or replace function public.enforce_optional_health_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  health_allowed boolean;
  health_scope_22_allowed boolean;
  fuel_precision_allowed boolean;
  allergies_present boolean;
  intolerances_present boolean;
begin
  if current_user_id is null then
    return new;
  end if;

  new.user_id := current_user_id;
  health_allowed := public.latest_consent_is_accepted(current_user_id, 'health_data');
  health_scope_22_allowed := public.latest_consent_is_accepted_for_version(
    current_user_id,
    'health_data',
    '2.2'
  ) or public.latest_consent_is_accepted_for_version(current_user_id,'health_data','2.3');
  fuel_precision_allowed := public.latest_consent_is_accepted(current_user_id, 'fuel_precision');

  allergies_present := coalesce(new.food_allergies, '[]'::jsonb)
    not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb);
  intolerances_present := coalesce(new.food_intolerances, '[]'::jsonb)
    not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb);

  if health_allowed is not true then
    new.health_personalization_enabled := false;
    new.pain_injury := false;
    new.fuel_allergy_status := 'unconfirmed';
    new.food_allergies := '[]'::jsonb;
    new.food_intolerances := '[]'::jsonb;
  elsif health_scope_22_allowed is not true
    and (
      coalesce(new.fuel_allergy_status, 'unconfirmed') <> 'unconfirmed'
      or allergies_present
      or intolerances_present
    ) then
    new.fuel_allergy_status := 'unconfirmed';
    new.food_allergies := '[]'::jsonb;
    new.food_intolerances := '[]'::jsonb;
  end if;

  if fuel_precision_allowed is not true
     and (new.fuel_precision_enabled is true or new.weight_optional is not null) then
    raise exception 'Fuel Precision fields require active Fuel Precision consent';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_optional_health_profile_fields()
  from public, anon, authenticated;
grant execute on function public.enforce_optional_health_profile_fields()
  to service_role;




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


create schema if not exists private;
create table if not exists private.ballwise_installations(version text primary key,installed_at timestamptz not null default now());
alter table private.ballwise_installations enable row level security;
revoke all on private.ballwise_installations from public,anon,authenticated;
grant all on private.ballwise_installations to service_role;
insert into private.ballwise_installations(version) values('20261018181225+20261018181321');
commit;
select 'Installed. Run 03-verification.sql and the staging acceptance scenarios.' as next_step;
