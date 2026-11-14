-- READ-ONLY readiness check for the V2.4 running-feedback migration and the session-feedback
-- migration (20261113202126_engine_v24_running_feedback.sql, 20261114100000_session_feedback_v1.sql,
-- 20261114200000_running_progression_replay.sql).
-- Paste into the SQL editor of the TARGET project (not a local database). It changes nothing.
-- Every row must show ok = true. A false row names the missing part; apply the migrations in
-- file-name order and run this again. A green result proves the definitions exist; it does not
-- replace the functional scenarios in docs/ballwise-integracja-status.md.
with fn as (
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('next_running_level_for_session','save_training_log','save_running_result','recompute_running_progression')
), col as (
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'session_logs'
), con as (
  select conname from pg_constraint
  where conrelid = 'public.session_logs'::regclass
)
select * from (
  select 1 as n, 'function next_running_level_for_session(integer,integer,jsonb,jsonb) exists' as check_name,
    to_regprocedure('public.next_running_level_for_session(integer,integer,jsonb,jsonb)') is not null as ok
  union all select 2, 'save_training_log replays running progression (recompute_running_progression)',
    coalesce((select def ilike '%recompute_running_progression%' from fn where proname = 'save_training_log'), false)
  union all select 3, 'save_running_result replays running progression (recompute_running_progression)',
    coalesce((select def ilike '%recompute_running_progression%' from fn where proname = 'save_running_result'), false)
  union all select 4, 'save_training_log writes typed feedback fields (activity_tags, match_minutes_played)',
    coalesce((select def ilike '%activity_tags%' and def ilike '%match_minutes_played%' from fn where proname = 'save_training_log'), false)
  union all select 5, 'session_logs.activity_tags', exists(select 1 from col where column_name = 'activity_tags')
  union all select 6, 'session_logs.duration_source', exists(select 1 from col where column_name = 'duration_source')
  union all select 7, 'session_logs.match_minutes_played', exists(select 1 from col where column_name = 'match_minutes_played')
  union all select 8, 'session_logs.feedback_version', exists(select 1 from col where column_name = 'feedback_version')
  union all select 9, 'constraint session_logs_match_minutes_check', exists(select 1 from con where conname = 'session_logs_match_minutes_check')
  union all select 10, 'constraint session_logs_activity_tags_check', exists(select 1 from con where conname = 'session_logs_activity_tags_check')
  union all select 11, 'save_training_log is security invoker with fixed search_path',
    coalesce((select not prosecdef from pg_proc where oid = 'public.save_training_log(uuid,uuid,bigint,jsonb)'::regprocedure), false)
  union all select 12, 'recompute_running_progression exists and folds next_running_level_for_session in execution order',
    coalesce((select def ilike '%next_running_level_for_session%' and def ilike '%order by%' from fn where proname = 'recompute_running_progression'), false)
  union all select 13, 'athlete_profiles replay base columns',
    exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'athlete_profiles' and column_name = 'running_progression_base_at')
) checks order by n;
