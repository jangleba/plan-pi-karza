select current_database() as selected_database,current_user as database_role,now() as checked_at;
with required(name) as(values('profiles'),('athlete_profiles'),('onboarding_answers'),('training_plans'),('training_days'),('training_sessions'),('session_exercises'),('session_logs'),('exercise_set_logs'),('running_activities'),('session_modifications'),('exercise_replacements'),('weekly_transitions'),('readiness_logs'),('pain_logs'),('consent_logs'))
select name,to_regclass('public.'||name) is not null as required_table_exists from required;
with required(signature) as(values('auth.uid()'),('auth.jwt()'),('public.record_consent(text,boolean)'),('public.latest_consent_is_accepted(uuid,text)'),('public.sanitize_session_log_lifecycle()'),('public.enforce_session_notes_health_consent()'))
select signature,to_regprocedure(signature) is not null as required_function_exists from required;
select to_regprocedure('public.save_profile_and_plan(jsonb,jsonb,jsonb,timestamp with time zone,boolean,date)') as already_installed_stop_if_nonnull;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and (table_name,column_name) in(('athlete_profiles','unavailable_days'),('athlete_profiles','unavailable_equipment_ids'),('athlete_profiles','food_allergies'),('athlete_profiles','food_intolerances'),('athlete_profiles','food_exclusions'),('athlete_profiles','match_dates'),('readiness_logs','red_flags'),('weekly_transitions','next_match_dates')) order by table_name,column_name;
select count(*) as duplicate_session_groups_must_be_zero from(select user_id,session_id from public.session_logs where session_id is not null group by user_id,session_id having count(*)>1)d;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename in('session_logs','weekly_transitions');
select to_regclass('public.lab_test_results') as optional_old_lab,to_regclass('public.user_roles') as optional_old_roles;
