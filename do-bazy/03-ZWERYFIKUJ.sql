select current_database() as database_name,current_user as database_role;

with required(signature) as(values
 ('public.persist_training_plan_v2(uuid,text,text,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)'),
 ('public.save_training_log(uuid,uuid,bigint,jsonb)'),
 ('public.save_exercise_set(uuid,jsonb,bigint)'),
 ('public.save_running_result(uuid,jsonb,bigint)'),
 ('public.apply_plan_modification(uuid,jsonb,jsonb,jsonb,uuid,jsonb,jsonb)'),
 ('public.undo_plan_modification(uuid,uuid,uuid)'),
 ('public.save_readiness_checkin(jsonb)'),
 ('public.delete_running_activity_atomic(uuid)'),
 ('public.save_profile_and_plan(jsonb,jsonb,jsonb,timestamp with time zone,boolean,date)'),
 ('public.set_equipment_replacement(uuid,jsonb,uuid)'),
 ('public.record_consent_state(text,boolean,timestamp with time zone)'))
select signature,to_regprocedure(signature) as installed,
 case when to_regprocedure(signature) is not null then has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') else false end as client_can_execute
 from required;

select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and (table_name,column_name) in(
 ('athlete_profiles','unavailable_days'),('athlete_profiles','unavailable_equipment_ids'),
 ('athlete_profiles','food_allergies'),('athlete_profiles','food_intolerances'),
 ('athlete_profiles','food_exclusions'),('athlete_profiles','match_dates'),
 ('readiness_logs','red_flags'),('weekly_transitions','next_match_dates'))
order by table_name,column_name;

select indexname,indexdef from pg_indexes where schemaname='public' and tablename='session_logs';
select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and (t.tgname in('aa_guard_session_log_order','aa_guard_set_log_order','aa_parent_owner','athlete_pain_location_consent')) order by c.relname,t.tgname;

select table_name,column_name,data_type from information_schema.columns where table_schema='public' and (
 (table_name='athlete_profiles' and column_name in('pain_locations','field_mas_source_session_id')) or
 (table_name='training_plans' and column_name='cycle_id') or
 (table_name='weekly_transitions' and column_name in('cycle_id','week_start','week_end')) or
 (table_name='session_logs' and column_name in('write_version','server_updated_at','execution_snapshot')) or
 (table_name='running_activities' and column_name in('interval_results','progression_applied','write_version')))
order by table_name,column_name;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename in('weekly_transitions','training_plans');

select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in('training_write_receipts','session_logs','exercise_set_logs','running_activities');
select user_id,count(*) from public.training_plans where active group by user_id having count(*)>1;

select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and t.tgname in(
 'aa_module_backup_consent_lock','module_backup_text_consent',
 'consent_logs_clear_module_backups_after_health_withdrawal')
order by c.relname,t.tgname;

select has_function_privilege('authenticated','public.record_billing_entitlement(uuid,text,timestamp with time zone,timestamp with time zone,text,text,text)','EXECUTE') as must_be_false;
select has_function_privilege('service_role','public.record_billing_entitlement(uuid,text,timestamp with time zone,timestamp with time zone,text,text,text)','EXECUTE') as must_be_true;
select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in('billing_entitlements','billing_events','module_backups');
select version,installed_at from private.ballwise_installations where version='20261018181225+20261018181321';
