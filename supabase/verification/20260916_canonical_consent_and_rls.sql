-- READ-ONLY verification.

-- Expected: true.
select to_regprocedure('public.record_consent(text,boolean)') is not null
  as canonical_consent_function_exists;

-- Expected: zero rows. Direct browser INSERT must be removed.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'consent_logs'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

-- Expected: zero rows. All ownership policies must target authenticated.
select tablename, policyname, roles
from pg_policies
where schemaname = 'public'
  and roles = array['public']::name[];

-- Expected: zero rows. Browser roles must not call the legacy/raw helpers.
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('withdraw_health_data_consent', 'has_role')
  and grantee in ('PUBLIC', 'anon', 'authenticated');

-- Informational. No application row may claim a future/unknown legal version.
select version, consent_type, count(*)::integer as rows_count
from public.consent_logs
where version <> '2.2'
group by version, consent_type
order by version, consent_type;
