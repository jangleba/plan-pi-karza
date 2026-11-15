-- Read-only checks after deploying 20261115101142_gym_training_evidence.sql.
-- No athlete records, health data or application writes are needed.
select e.table_name, c.oid is not null as present,
       coalesce(c.relrowsecurity,false) as rls_enabled,
       coalesce(has_table_privilege('anon',c.oid,'SELECT'),false) as anon_select,
       coalesce(has_table_privilege('anon',c.oid,'INSERT'),false) as anon_insert,
       coalesce(has_table_privilege('authenticated',c.oid,'SELECT'),false) as owner_role_select
from (values ('gym_records'),('gym_record_receipts')) e(table_name)
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name and c.relkind='r';
-- Expected: both present/RLS/owner_role_select=true; anon_select/insert=false.

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='public' and tablename in ('gym_records','gym_record_receipts')
order by tablename, policyname;
-- Inspect auth.uid() ownership, including the session/exercise ownership predicate.

select p.proname, p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('valid_gym_record','gym_record_key','gym_record_session_owned','save_gym_record')
order by p.proname;
-- Expected: four rows, invoker (security_definer=false), empty search_path,
-- anon_execute=false and authenticated_execute=true.

select conrelid::regclass as child_table, confrelid::regclass as parent_table,
       confdeltype='c' as delete_cascades
from pg_constraint where contype='f' and conrelid in
 (to_regclass('public.gym_records'),to_regclass('public.gym_record_receipts'));
-- Expected: both user_id foreign keys delete with auth.users.
