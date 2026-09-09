-- Feedback used by the plan engine. Existing RLS policies on both tables
-- already restrict every row to auth.uid() = user_id.

alter table public.readiness_logs
  add column if not exists pain_level integer,
  add column if not exists overall integer,
  add column if not exists updated_at timestamptz not null default now();

delete from public.readiness_logs newer
using public.readiness_logs older
where newer.user_id = older.user_id
  and newer.date = older.date
  and (newer.created_at, newer.id) < (older.created_at, older.id);

create unique index if not exists readiness_logs_user_date_key
  on public.readiness_logs (user_id, date);

alter table public.readiness_logs
  drop constraint if exists readiness_logs_pain_level_check,
  add constraint readiness_logs_pain_level_check
    check (pain_level is null or pain_level between 0 and 10),
  drop constraint if exists readiness_logs_overall_check,
  add constraint readiness_logs_overall_check
    check (overall is null or overall between 1 and 10);

alter table public.session_logs
  add column if not exists completion_status text not null default 'completed',
  add column if not exists duration_minutes integer,
  add column if not exists activity_type text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.session_logs
  drop constraint if exists session_logs_completion_status_check,
  add constraint session_logs_completion_status_check
    check (completion_status in ('completed', 'missed')),
  drop constraint if exists session_logs_duration_minutes_check,
  add constraint session_logs_duration_minutes_check
    check (duration_minutes is null or duration_minutes between 0 and 300),
  drop constraint if exists session_logs_activity_type_check,
  add constraint session_logs_activity_type_check
    check (activity_type is null or activity_type in ('technical', 'mixed', 'running_endurance'));
