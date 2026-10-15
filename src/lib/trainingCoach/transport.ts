import { supabase } from "@/integrations/supabase/client";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { coachRequest, type CoachReply } from "./coach";

export async function askTrainingCoach(question: string, exercise: TrainingExercise, signal: AbortSignal): Promise<CoachReply> {
  const { data, error } = await supabase.functions.invoke("training-coach", {
    body: coachRequest(question, exercise), signal,
  });
  if (error) throw new Error("AI jest teraz niedostępne. Możesz skorzystać z instrukcji ćwiczenia.");
  if (!data || typeof data.answer !== "string" || !data.answer.trim() || data.answer.length > 1000)
    throw new Error("Nie udało się otrzymać krótkiej odpowiedzi. Spróbuj ponownie.");
  return { source: "ai", text: data.answer, needsTrainer: data.needsTrainer === true };
}
