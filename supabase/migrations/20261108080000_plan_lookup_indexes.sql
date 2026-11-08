-- BallWise: indexes for the plan tables.
-- The original tables had only primary keys. Every row-level-security check
-- (user_id = auth.uid()), every foreign-key cascade and the executed-slot check
-- in persist_training_plan_v2 (days of a plan -> their sessions -> session logs)
-- scanned whole tables. session_exercises alone holds ~135k rows.
-- Additive, idempotent and safe to run again.

create index if not exists training_plans_owner_created
  on public.training_plans (user_id, created_at desc);

create index if not exists training_days_plan
  on public.training_days (plan_id);
create index if not exists training_days_owner_date
  on public.training_days (user_id, date);

create index if not exists training_sessions_day
  on public.training_sessions (training_day_id);
create index if not exists training_sessions_owner
  on public.training_sessions (user_id);

create index if not exists session_exercises_session
  on public.session_exercises (session_id);
create index if not exists session_exercises_owner
  on public.session_exercises (user_id);
