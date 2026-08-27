DROP INDEX IF EXISTS public.exercise_set_logs_unique_set;
CREATE UNIQUE INDEX exercise_set_logs_unique_set
  ON public.exercise_set_logs (user_id, session_id, exercise_key, set_number) NULLS NOT DISTINCT;