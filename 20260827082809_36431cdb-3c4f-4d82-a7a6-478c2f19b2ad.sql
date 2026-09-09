ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS metric_kind text,
  ADD COLUMN IF NOT EXISTS metric_value numeric;