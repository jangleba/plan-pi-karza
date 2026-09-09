ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS unavailable_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unavailable_equipment_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

UPDATE public.training_plans SET active = (status = 'active');

CREATE UNIQUE INDEX IF NOT EXISTS athlete_profiles_user_id_key ON public.athlete_profiles (user_id);