-- Nowy model statusów Vision Lab: rozdzielenie analizy i widoczności dla zawodnika.
ALTER TABLE public.vision_tests
  ADD COLUMN IF NOT EXISTS analysis_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS visibility_status text NOT NULL DEFAULT 'visible_to_player';

-- Istniejące rekordy pozostają widoczne (default powyżej to zapewnia).

-- Kolejka trenera musi widzieć wszystkie przesłane filmy, nie tylko płatne.
DROP POLICY IF EXISTS "Coaches can view review-requested tests" ON public.vision_tests;
DROP POLICY IF EXISTS "Coaches can update review-requested tests" ON public.vision_tests;

CREATE POLICY "Coaches can view all vision tests"
  ON public.vision_tests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Coaches can update all vision tests"
  ON public.vision_tests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'))
  WITH CHECK (public.has_role(auth.uid(), 'coach'));