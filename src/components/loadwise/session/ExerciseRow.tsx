import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { plannedSets } from "@/lib/loadwise/setLogs";
import {
  equipmentNamesFor,
  canonicalExerciseName,
  exerciseDataLineParts,
} from "@/lib/loadwise/sessionPresentation";
import { ExerciseRunnerScreen } from "../ExerciseRunnerScreen";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";
import { Button } from "@/components/ui/button";

export function ExerciseRow({
  e,
  index,
  done,
  onToggle,
  onUnavailable,
  equipmentIds,
  sessionId,
}: {
  e: TrainingExercise;
  index?: number;
  done: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
  equipmentIds: string[];
  sessionId?: string | null;
}) {
  const [logging, setLogging] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const { dose, meta } = exerciseDataLineParts(e);
  const label = e.label ?? (typeof index === "number" ? String(index + 1) : "");
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
          aria-pressed={done}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
        >
          {done ? <Check className="h-4 w-4" /> : label}
        </button>
        <button
          type="button"
          onClick={() => setDetailSheetOpen(true)}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 py-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block text-base font-semibold leading-snug ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {canonicalExerciseName(e)}
            </span>
            {(dose || meta) && (
              <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                {dose && (
                  <span className="mr-2 font-medium tabular-nums text-foreground">{dose}</span>
                )}
                {meta}
              </span>
            )}
          </span>
          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 pl-14">
        {!done && equipmentIds.length > 0 && (
          <Button variant="ghost" onClick={onUnavailable}>
            Nie mam {equipmentNamesFor(equipmentIds).join(", ")}
          </Button>
        )}
        {plannedSets(e) > 0 && (
          <Button variant="ghost" onClick={() => setLogging(true)}>
            Zapisz serie
          </Button>
        )}
      </div>
      <ExerciseDetailSheet exercise={e} open={detailSheetOpen} onOpenChange={setDetailSheetOpen} />
      <ExerciseRunnerScreen
        exercise={e}
        sessionId={sessionId}
        open={logging}
        onClose={() => setLogging(false)}
      />
    </div>
  );
}
