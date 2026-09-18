-- READ-ONLY verification after 20260918183000_secure_defaults_and_health_cleanup.sql.

-- Expected: zero rows. Every public table exposed by the Data API must use RLS.
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relrowsecurity is false
order by c.relname;

-- Expected: zero rows. Anonymous visitors must not have table privileges.
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;

-- Expected: zero rows. Browser roles cannot call internal health cleanup.
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'withdraw_health_data_consent'
  and grantee in ('PUBLIC', 'anon', 'authenticated');

-- Expected: zero rows. Direct consent-log mutations remain blocked.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'consent_logs'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
