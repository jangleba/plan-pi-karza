ALTER TABLE public.athlete_profiles
ADD COLUMN IF NOT EXISTS unavailable_days integer[];

UPDATE public.athlete_profiles
SET unavailable_days = '{}'
WHERE unavailable_days IS NULL;

ALTER TABLE public.athlete_profiles
ALTER COLUMN unavailable_days SET DEFAULT '{}',
ALTER COLUMN unavailable_days SET NOT NULL;

ALTER TABLE public.athlete_profiles
DROP CONSTRAINT IF EXISTS athlete_profiles_unavailable_days_valid;

ALTER TABLE public.athlete_profiles
ADD CONSTRAINT athlete_profiles_unavailable_days_valid
CHECK (
  unavailable_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::integer[]
);
