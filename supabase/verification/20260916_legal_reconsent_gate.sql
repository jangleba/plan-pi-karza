-- Read-only verification for legal version 2.2.

-- Must return true/true.
select
  to_regprocedure(
    'public.latest_consent_is_accepted_for_version(uuid,text,text)'
  ) is not null as versioned_consent_function_exists,
  position(
    'latest_consent_is_accepted_for_version' in
    pg_get_functiondef('public.enforce_optional_health_profile_fields()'::regprocedure)
  ) > 0 as profile_guard_checks_legal_version;

-- Must return 0. Allergy/intolerance processing needs the explicit 2.2 scope.
select count(*)::int as expanded_health_scope_violations
from public.athlete_profiles ap
where (
  coalesce(ap.fuel_allergy_status, 'unconfirmed') <> 'unconfirmed'
  or coalesce(ap.food_allergies, '[]'::jsonb)
       not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
  or coalesce(ap.food_intolerances, '[]'::jsonb)
       not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
)
and public.latest_consent_is_accepted_for_version(
  ap.user_id,
  'health_data',
  '2.2'
) is not true;

-- Informational: these existing accounts will see the blocking re-consent UI.
select count(*)::int as accounts_pending_required_reconsent
from public.athlete_profiles ap
where not (
  public.latest_consent_is_accepted_for_version(ap.user_id, 'terms', '2.2')
  and public.latest_consent_is_accepted_for_version(ap.user_id, 'privacy', '2.2')
);
