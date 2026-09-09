CREATE TABLE public.weekly_transitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  next_match_date DATE,
  no_match_next_week BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_transitions TO authenticated;
GRANT ALL ON public.weekly_transitions TO service_role;

ALTER TABLE public.weekly_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own weekly transitions"
ON public.weekly_transitions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_weekly_transitions_updated_at
BEFORE UPDATE ON public.weekly_transitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();