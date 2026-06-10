ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS season_phase text,
  ADD COLUMN IF NOT EXISTS season_stage text,
  ADD COLUMN IF NOT EXISTS competition_level text,
  ADD COLUMN IF NOT EXISTS weekly_matches boolean,
  ADD COLUMN IF NOT EXISTS has_gym boolean,
  ADD COLUMN IF NOT EXISTS has_pitch boolean,
  ADD COLUMN IF NOT EXISTS has_sprint_space boolean;