import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { getSkipGuide } from "@/lib/loadwise/skipGuides";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { SprintRestTimer } from "./SprintRestTimer";
import { PersistentExercisePanel } from "./PersistentExercisePanel";

export function SkipExerciseCard({
  exercise,
  prescription,
  rest,
  done,
  onToggle,
  canRecord = true,
  compact = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  exercise: TrainingExercise;
  prescription: string;
  rest: string | null;
  done: boolean;
  onToggle: () => void;
  canRecord?: boolean;
  compact?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [localExpanded, setExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const panelId = useId();
  const guide = getSkipGuide(exercise.exerciseId);
  if (!guide) return null;
  return (
    <article className="bw-skip-card" aria-label={guide.title}>
      <div className="bw-skip-header">
        <div className="min-w-0 flex-1">
          {compact ? (
            <button
              type="button"
              className="bw-skip-title-trigger"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() =>
                onExpandedChange ? onExpandedChange(!expanded) : setExpanded(!expanded)
              }
            >
              <span>
                <strong className="bw-skip-title">{guide.title}</strong>
                {prescription && <span className="bw-skip-dose">{prescription}</span>}
              </span>
              <ChevronDown aria-hidden="true" className={expanded ? "rotate-180" : ""} />
            </button>
          ) : (
            <>
              <h3 className={"bw-skip-title " + (done ? "text-muted-foreground" : "")}>
                {guide.title}
              </h3>
              {prescription && <p className="bw-skip-dose">{prescription}</p>}
            </>
          )}
        </div>
        <button
          type="button"
          disabled={!canRecord}
          onClick={() => {
            if (canRecord) onToggle();
          }}
          className="bw-skip-done"
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
          aria-pressed={done}
        >
          <span aria-hidden="true">{done && <Check />}</span>
        </button>
      </div>
      <PersistentExercisePanel id={panelId} open={!compact || expanded}>
        <ExerciseQuickGuide exercise={exercise} autoAnimation />
        {rest && <SprintRestTimer label={rest} compact />}
      </PersistentExercisePanel>
    </article>
  );
}
