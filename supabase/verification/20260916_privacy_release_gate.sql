-- Read-only release gate. Every *_violations value must be 0.
-- Run after all migrations on the exact database used by the release.

select
  (
    select count(*)::int
    from public.athlete_profiles ap
    where ap.health_personalization_enabled is true
      and public.latest_consent_is_accepted(ap.user_id, 'health_data') is not true
  ) as health_profile_without_consent_violations,
  (
    select count(*)::int
    from public.readiness_logs r
    where public.latest_consent_is_accepted(r.user_id, 'health_data') is not true
  ) as readiness_without_consent_violations,
  (
    select count(*)::int
    from public.pain_logs p
    where public.latest_consent_is_accepted(p.user_id, 'health_data') is not true
  ) as pain_without_consent_violations,
  (
    select count(*)::int
    from public.athlete_profiles ap
    where (
      coalesce(ap.fuel_allergy_status, 'unconfirmed') <> 'unconfirmed'
      or coalesce(ap.food_allergies, '[]'::jsonb)
           not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
      or coalesce(ap.food_intolerances, '[]'::jsonb)
           not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
    )
    and public.latest_consent_is_accepted(ap.user_id, 'health_data') is not true
  ) as fuel_health_without_consent_violations,
  (
    select count(*)::int
    from public.athlete_profiles ap
    where (ap.fuel_precision_enabled is true or ap.weight_optional is not null)
      and public.latest_consent_is_accepted(ap.user_id, 'fuel_precision') is not true
  ) as fuel_precision_without_consent_violations;

-- Must return zero rows.
select conrelid::regclass::text as table_name, conname
from pg_constraint
where connamespace = 'public'::regnamespace
  and convalidated is false
order by 1, 2;

-- Must return zero rows: every user-data table needs RLS.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity is false
order by c.relname;

-- anon_execute must be false for every returned function.
select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'persist_training_plan_atomic',
    'withdraw_health_data_consent',
    'latest_consent_is_accepted',
    'enforce_health_consent_for_logs',
    'enforce_fuel_precision_consent',
    'enforce_optional_health_profile_fields'
  )
order by p.proname;

-- Must return all four trigger names.
select t.tgname as privacy_trigger, c.relname as table_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and t.tgname in (
    'readiness_logs_require_health_consent',
    'pain_logs_require_health_consent',
    'athlete_profiles_enforce_fuel_precision',
    'athlete_profiles_enforce_optional_health_fields'
  )
order by t.tgname;
