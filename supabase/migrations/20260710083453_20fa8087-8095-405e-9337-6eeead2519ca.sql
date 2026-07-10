ALTER TABLE public.vision_tests
  ADD COLUMN IF NOT EXISTS linked_plan_id uuid,
  ADD COLUMN IF NOT EXISTS linked_workout_id uuid,
  ADD COLUMN IF NOT EXISTS linked_exercise_id text,
  ADD COLUMN IF NOT EXISTS linked_exercise_name text,
  ADD COLUMN IF NOT EXISTS linked_training_day text,
  ADD COLUMN IF NOT EXISTS exercise_category text,
  ADD COLUMN IF NOT EXISTS technique_review jsonb,
  ADD COLUMN IF NOT EXISTS review_mode text;