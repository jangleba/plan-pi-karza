CREATE TABLE public.exercise_set_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id UUID,
  exercise_key TEXT NOT NULL,
  exercise_name TEXT,
  set_number INTEGER NOT NULL,
  weight_kg NUMERIC,
  reps INTEGER,
  rir INTEGER,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX exercise_set_logs_unique_set
  ON public.exercise_set_logs (user_id, COALESCE(session_id, '00000000-0000-0000-0000-000000000000'::uuid), exercise_key, set_number);
CREATE INDEX exercise_set_logs_history ON public.exercise_set_logs (user_id, exercise_key, performed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_set_logs TO authenticated;
GRANT ALL ON public.exercise_set_logs TO service_role;

ALTER TABLE public.exercise_set_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own set logs" ON public.exercise_set_logs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_exercise_set_logs_updated
  BEFORE UPDATE ON public.exercise_set_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();