-- Coach role support (roles live in a dedicated table)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'athlete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- New Vision Lab / Coach Review columns
ALTER TABLE public.vision_tests
  ADD COLUMN IF NOT EXISTS review_type text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'ai_result',
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coach_note text,
  ADD COLUMN IF NOT EXISTS coach_feedback jsonb,
  ADD COLUMN IF NOT EXISTS coach_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coach_corrected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coach_corrected_frames jsonb,
  ADD COLUMN IF NOT EXISTS calculation_method text,
  ADD COLUMN IF NOT EXISTS calculation_basis jsonb,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_override_reason text,
  ADD COLUMN IF NOT EXISTS paid_review_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_review_status text DEFAULT 'not_requested';

-- Coaches can view tests submitted for review, and update their review fields.
DROP POLICY IF EXISTS "Coaches can view review-requested tests" ON public.vision_tests;
CREATE POLICY "Coaches can view review-requested tests"
  ON public.vision_tests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND paid_review_requested = true);

DROP POLICY IF EXISTS "Coaches can update review-requested tests" ON public.vision_tests;
CREATE POLICY "Coaches can update review-requested tests"
  ON public.vision_tests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND paid_review_requested = true)
  WITH CHECK (public.has_role(auth.uid(), 'coach'));