ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS individual_training_days integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usual_match_day text;