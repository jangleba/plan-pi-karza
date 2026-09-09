ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS current_pitch_feelings text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_pitch_feelings text[] NOT NULL DEFAULT '{}'::text[];