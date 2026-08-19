ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS unavailable_equipment_ids text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.exercise_replacements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  exercise_id text NOT NULL,
  original_json jsonb NOT NULL,
  replacement_json jsonb NOT NULL,
  equipment_ids text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_replacements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own exercise replacements"
  ON public.exercise_replacements;
CREATE POLICY "Users manage their own exercise replacements"
ON public.exercise_replacements
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_replacements_user_date
  ON public.exercise_replacements (user_id, date);
