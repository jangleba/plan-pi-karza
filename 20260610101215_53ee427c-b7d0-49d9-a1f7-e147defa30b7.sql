CREATE TABLE public.session_modifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('add','swap')),
  reason text,
  safety_status text NOT NULL DEFAULT 'planned',
  original_session_id text,
  new_session_id text,
  original_session_json jsonb,
  new_session_json jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_modifications TO authenticated;
GRANT ALL ON public.session_modifications TO service_role;

ALTER TABLE public.session_modifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own session modifications"
ON public.session_modifications
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_session_modifications_user_date
ON public.session_modifications (user_id, date);