-- Run after applying 20260925185931_ballwise_lab_240fps_results.sql.
-- Every row returned by the final query should be true.
select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'lab_test_results';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'lab_test_results'
order by policyname;

select
  not has_table_privilege('anon', 'public.lab_test_results', 'select') as anon_cannot_select,
  not has_table_privilege('anon', 'public.lab_test_results', 'insert') as anon_cannot_insert,
  has_table_privilege('authenticated', 'public.lab_test_results', 'select') as user_can_select,
  has_table_privilege('authenticated', 'public.lab_test_results', 'insert') as user_can_insert,
  has_table_privilege('authenticated', 'public.lab_test_results', 'delete') as user_can_delete,
  not has_table_privilege('authenticated', 'public.lab_test_results', 'update') as result_is_immutable;
