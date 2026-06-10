ALTER TABLE public.session_exercises ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.session_exercises ADD COLUMN IF NOT EXISTS section text;

CREATE UNIQUE INDEX IF NOT EXISTS session_logs_user_session_uniq
  ON public.session_logs (user_id, session_id)
  WHERE session_id IS NOT NULL;