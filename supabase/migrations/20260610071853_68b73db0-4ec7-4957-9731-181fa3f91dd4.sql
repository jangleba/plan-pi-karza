
-- =========================================================
-- Loadwise backend foundation: tables, RLS, GRANTs, triggers
-- =========================================================

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------- profiles ----------
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'athlete',
  birth_date DATE,
  age_group TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profiles" ON public.profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- athlete_profiles ----------
CREATE TABLE public.athlete_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  sex_optional TEXT,
  age INTEGER,
  position TEXT,
  level TEXT,
  main_goal TEXT,
  height_optional INTEGER,
  weight_optional INTEGER,
  club_name TEXT,
  league_optional TEXT,
  training_experience TEXT,
  gym_access BOOLEAN DEFAULT false,
  equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  double_sessions_allowed TEXT,
  club_training_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  match_date DATE,
  pain_injury BOOLEAN DEFAULT false,
  guardian_consent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.athlete_profiles TO authenticated;
GRANT ALL ON public.athlete_profiles TO service_role;
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own athlete_profiles" ON public.athlete_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_athlete_updated BEFORE UPDATE ON public.athlete_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- onboarding_answers ----------
CREATE TABLE public.onboarding_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_answers TO authenticated;
GRANT ALL ON public.onboarding_answers TO service_role;
ALTER TABLE public.onboarding_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own onboarding_answers" ON public.onboarding_answers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- readiness_logs ----------
CREATE TABLE public.readiness_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep INTEGER,
  energy INTEGER,
  fatigue INTEGER,
  soreness INTEGER,
  stress INTEGER,
  motivation INTEGER,
  pain_status BOOLEAN DEFAULT false,
  pain_location TEXT,
  club_training_today BOOLEAN DEFAULT false,
  match_today BOOLEAN DEFAULT false,
  available_time INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.readiness_logs TO authenticated;
GRANT ALL ON public.readiness_logs TO service_role;
ALTER TABLE public.readiness_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own readiness_logs" ON public.readiness_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- pain_logs ----------
CREATE TABLE public.pain_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pain_location TEXT,
  pain_level INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pain_logs TO authenticated;
GRANT ALL ON public.pain_logs TO service_role;
ALTER TABLE public.pain_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pain_logs" ON public.pain_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- training_plans ----------
CREATE TABLE public.training_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT,
  goal TEXT,
  plan_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plans TO authenticated;
GRANT ALL ON public.training_plans TO service_role;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own training_plans" ON public.training_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- training_days ----------
CREATE TABLE public.training_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.training_plans(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_type TEXT,
  decision_reason TEXT,
  readiness_adjustment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_days TO authenticated;
GRANT ALL ON public.training_days TO service_role;
ALTER TABLE public.training_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own training_days" ON public.training_days FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- training_sessions ----------
CREATE TABLE public.training_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  training_day_id UUID REFERENCES public.training_days(id) ON DELETE CASCADE,
  session_type TEXT,
  title TEXT,
  goal TEXT,
  duration_min INTEGER,
  intensity TEXT,
  warmup_json JSONB DEFAULT '[]'::jsonb,
  main_work_json JSONB DEFAULT '[]'::jsonb,
  cooldown_json JSONB DEFAULT '[]'::jsonb,
  safety_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_sessions TO authenticated;
GRANT ALL ON public.training_sessions TO service_role;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own training_sessions" ON public.training_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- session_exercises ----------
CREATE TABLE public.session_exercises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  exercise_id UUID,
  order_index INTEGER DEFAULT 0,
  sets INTEGER,
  reps TEXT,
  duration TEXT,
  distance TEXT,
  load TEXT,
  rest TEXT,
  coaching_cues TEXT,
  video_url_optional TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_exercises TO authenticated;
GRANT ALL ON public.session_exercises TO service_role;
ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session_exercises" ON public.session_exercises FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- session_logs ----------
CREATE TABLE public.session_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID,
  completed BOOLEAN DEFAULT false,
  rpe INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_logs TO authenticated;
GRANT ALL ON public.session_logs TO service_role;
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session_logs" ON public.session_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- consent_logs ----------
CREATE TABLE public.consent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version TEXT NOT NULL,
  text_snapshot TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_logs TO authenticated;
GRANT ALL ON public.consent_logs TO service_role;
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own consent_logs" ON public.consent_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- Public / system tables (readable by authenticated users)
-- =========================================================

CREATE TABLE public.exercise_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  goal_tags JSONB DEFAULT '[]'::jsonb,
  position_tags JSONB DEFAULT '[]'::jsonb,
  age_min INTEGER,
  age_max INTEGER,
  level TEXT,
  equipment JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  instructions TEXT,
  coaching_cues TEXT,
  contraindications TEXT,
  default_sets INTEGER,
  default_reps TEXT,
  default_duration TEXT,
  default_rest TEXT,
  video_url_optional TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exercise_library TO authenticated;
GRANT ALL ON public.exercise_library TO service_role;
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read exercise_library" ON public.exercise_library FOR SELECT TO authenticated USING (true);

CREATE TABLE public.session_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  session_type TEXT,
  goal_tags JSONB DEFAULT '[]'::jsonb,
  age_group TEXT,
  level TEXT,
  duration_min INTEGER,
  structure_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.session_templates TO authenticated;
GRANT ALL ON public.session_templates TO service_role;
ALTER TABLE public.session_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read session_templates" ON public.session_templates FOR SELECT TO authenticated USING (true);
