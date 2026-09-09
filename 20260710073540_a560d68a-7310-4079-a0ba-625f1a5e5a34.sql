CREATE TABLE public.vision_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_type text NOT NULL,
  test_category text NOT NULL,
  test_name text NOT NULL,
  video_url text,
  capture_mode text DEFAULT 'upload',
  fps integer,
  camera_view text,
  validity_status text NOT NULL DEFAULT 'valid',
  confidence_score text NOT NULL DEFAULT 'medium',
  main_result_value numeric,
  main_result_unit text,
  measured_metrics jsonb DEFAULT '[]'::jsonb,
  validity_flags jsonb DEFAULT '{}'::jsonb,
  ai_feedback jsonb DEFAULT '{}'::jsonb,
  comparison_to_previous jsonb DEFAULT '{}'::jsonb,
  saved_to_progress boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_tests TO authenticated;
GRANT ALL ON public.vision_tests TO service_role;

ALTER TABLE public.vision_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vision tests"
  ON public.vision_tests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vision tests"
  ON public.vision_tests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vision tests"
  ON public.vision_tests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vision tests"
  ON public.vision_tests FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX vision_tests_user_created_idx ON public.vision_tests (user_id, created_at DESC);