-- Read-only deployment checks. Run in the intended project after all migrations.
select to_regprocedure('public.persist_training_plan_v2(uuid,text,text,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)') as plan_rpc,
       to_regprocedure('public.delete_running_activity_atomic(uuid)') as delete_rpc;
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='athlete_profiles'
  and column_name='field_mas_source_session_id';
select event_object_table,trigger_name,action_timing from information_schema.triggers
where trigger_schema='public' and action_statement like '%guard_training_write_order%';
select p.proname,p.prosecdef as security_definer,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('persist_training_plan_v2','delete_running_activity_atomic','guard_training_write_order');
-- Must return zero rows: more than one active plan for a single user.
select user_id,count(*) from public.training_plans where active group by user_id having count(*)>1;
