
-- 1) Wsteczne rozszerzenia kolumn
ALTER TABLE public.vision_tests
  ADD COLUMN IF NOT EXISTS temporal_resolution_ms numeric,
  ADD COLUMN IF NOT EXISTS algorithm_version text,
  ADD COLUMN IF NOT EXISTS manual_correction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metric_direction text,
  ADD COLUMN IF NOT EXISTS legacy_source_id text;

-- Zachowaj kompatybilność: `analysis_method` jako synonim istniejącego `calculation_method`,
-- ale nie duplikujemy kolumny — pozostaje jedno pole (`calculation_method`), a nazwę
-- `analysis_method` mapujemy w warstwie repo.

-- 2) Dedup migracji z localStorage
CREATE UNIQUE INDEX IF NOT EXISTS vision_tests_user_legacy_source_uniq
  ON public.vision_tests(user_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

-- 3) Indeks dla listy/progresu per test
CREATE INDEX IF NOT EXISTS vision_tests_user_test_created_idx
  ON public.vision_tests(user_id, test_type, created_at DESC);

-- 4) Granty Data API (brakowały)
REVOKE ALL ON public.vision_tests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_tests TO authenticated;
GRANT ALL ON public.vision_tests TO service_role;

-- 5) Doprecyzowanie polityk zawodnika — używamy (select auth.uid()) dla lepszego planowania.
-- Polityki trenerów zostają bez zmian.
DROP POLICY IF EXISTS "Users can view their own vision tests" ON public.vision_tests;
DROP POLICY IF EXISTS "Users can insert their own vision tests" ON public.vision_tests;
DROP POLICY IF EXISTS "Users can update their own vision tests" ON public.vision_tests;
DROP POLICY IF EXISTS "Users can delete their own vision tests" ON public.vision_tests;

CREATE POLICY "Users can view their own vision tests"
  ON public.vision_tests FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert their own vision tests"
  ON public.vision_tests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own vision tests"
  ON public.vision_tests FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete their own vision tests"
  ON public.vision_tests FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));
