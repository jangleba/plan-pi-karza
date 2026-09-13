-- 1. Brakujące kolumny (dodawane wyłącznie addytywnie, bez utraty danych)
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS match_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fuel_allergy_status text NOT NULL DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS food_allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS food_intolerances jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS food_exclusions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migracja starszego formatu: pojedynczy mecz -> lista meczów
UPDATE public.athlete_profiles
   SET match_dates = to_jsonb(ARRAY[to_char(match_date, 'YYYY-MM-DD')])
 WHERE match_date IS NOT NULL
   AND (match_dates IS NULL OR jsonb_array_length(match_dates) = 0);

ALTER TABLE public.weekly_transitions
  ADD COLUMN IF NOT EXISTS next_match_dates jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.weekly_transitions
   SET next_match_dates = to_jsonb(ARRAY[to_char(next_match_date, 'YYYY-MM-DD')])
 WHERE next_match_date IS NOT NULL
   AND (next_match_dates IS NULL OR jsonb_array_length(next_match_dates) = 0);

ALTER TABLE public.readiness_logs
  ADD COLUMN IF NOT EXISTS pain_onset text,
  ADD COLUMN IF NOT EXISTS alters_movement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS red_flags jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Atomowy zapis planu: jedna transakcja zamiast czterech zapisów
CREATE OR REPLACE FUNCTION public.persist_training_plan_atomic(
  p_plan_id uuid,
  p_goal text,
  p_month text,
  p_plan_json jsonb,
  p_days jsonb,
  p_sessions jsonb,
  p_exercises jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.training_plans
     set active = false
   where user_id = current_user_id
     and active = true;

  insert into public.training_plans (id, user_id, month, goal, plan_json, status, active)
  values (p_plan_id, current_user_id, p_month, p_goal, p_plan_json, 'active', true);

  insert into public.training_days (id, user_id, plan_id, date, day_type, decision_reason)
  select (row ->> 'id')::uuid,
         current_user_id,
         p_plan_id,
         (row ->> 'date')::date,
         row ->> 'day_type',
         row ->> 'decision_reason'
    from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) as row;

  insert into public.training_sessions (
    id, user_id, training_day_id, session_type, title, goal, duration_min,
    intensity, warmup_json, main_work_json, cooldown_json, safety_notes
  )
  select (row ->> 'id')::uuid,
         current_user_id,
         (row ->> 'training_day_id')::uuid,
         row ->> 'session_type',
         row ->> 'title',
         row ->> 'goal',
         nullif(row ->> 'duration_min', '')::integer,
         row ->> 'intensity',
         row -> 'warmup_json',
         row -> 'main_work_json',
         row -> 'cooldown_json',
         row ->> 'safety_notes'
    from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) as row;

  insert into public.session_exercises (
    id, user_id, session_id, order_index, name, section, reps, duration,
    distance, rest, coaching_cues
  )
  select (row ->> 'id')::uuid,
         current_user_id,
         (row ->> 'session_id')::uuid,
         nullif(row ->> 'order_index', '')::integer,
         row ->> 'name',
         row ->> 'section',
         row ->> 'reps',
         row ->> 'duration',
         row ->> 'distance',
         row ->> 'rest',
         row ->> 'coaching_cues'
    from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb)) as row;
end;
$$;

GRANT EXECUTE ON FUNCTION public.persist_training_plan_atomic(uuid, text, text, jsonb, jsonb, jsonb, jsonb) TO authenticated;