import { Check } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { getSkipGuide } from "@/lib/loadwise/skipGuides";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { SprintRestTimer } from "./SprintRestTimer";

/** The illustration and coaching instructions stay visible without opening details. */
export function SkipExerciseCard({
  exercise,
  prescription,
  rest,
  done,
  onToggle,
  canRecord = true,
}: {
  exercise: TrainingExercise;
  prescription: string;
  rest: string | null;
  done: boolean;
  onToggle: () => void;
  canRecord?: boolean;
}) {
  const guide = getSkipGuide(exercise.exerciseId);
  if (!guide) return null;

  return (
    <article className="bw-skip-card" aria-label={guide.title}>
      <div className="bw-skip-header">
        <div className="min-w-0">
          <h3 className={`bw-skip-title ${done ? "text-muted-foreground" : ""}`}>{guide.title}</h3>
          {prescription && <p className="bw-skip-dose">{prescription}</p>}
        </div>
        <button
          type="button"
          disabled={!canRecord}
          onClick={() => { if (canRecord) onToggle(); }}
          className="bw-skip-done"
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
          aria-pressed={done}
        >
          <span aria-hidden="true">{done && <Check />}</span>
        </button>
      </div>
      <ExerciseQuickGuide exercise={exercise} />
      {rest && <SprintRestTimer label={rest} compact />}
    </article>
  );
}
