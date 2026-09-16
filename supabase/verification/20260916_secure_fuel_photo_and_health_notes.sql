-- READ-ONLY verification. This file must never change user data.

-- Expected: true / true / true.
select
  to_regclass('private.fuel_photo_rate_limits') is not null as quota_table_exists,
  to_regprocedure('public.consume_fuel_photo_quota(uuid)') is not null as quota_function_exists,
  to_regprocedure('public.enforce_session_notes_health_consent()') is not null as notes_guard_exists;

-- Expected: 0. A user without active health consent must have no free-text session notes.
select count(*)::integer as session_notes_without_health_consent
from public.session_logs sl
where nullif(btrim(sl.notes), '') is not null
  and public.latest_consent_is_accepted(sl.user_id, 'health_data') is not true;

-- Expected: zero rows. Browser roles must not execute the service-only quota function.
select grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'consume_fuel_photo_quota'
  and grantee in ('PUBLIC', 'anon', 'authenticated');

-- Informational only. It must not expose images or prompts; only counts and timestamps.
select count(*)::integer as quota_rows
from private.fuel_photo_rate_limits;
