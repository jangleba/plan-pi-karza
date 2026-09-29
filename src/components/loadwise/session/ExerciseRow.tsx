import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { plannedSets } from "@/lib/loadwise/setLogs";
import {
  equipmentNamesFor,
  canonicalExerciseName,
  exerciseDataLineParts,
} from "@/lib/loadwise/sessionPresentation";
import { MovementBlueprint } from "../MovementBlueprint";
import { ExerciseRunnerScreen } from "../ExerciseRunnerScreen";
import { ExerciseDetailSheet, resolveExerciseSheetViewModel } from "../ExerciseDetailSheet";

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
  const [expanded, setExpanded] = useState(false);
  const [logging, setLogging] = useState(false);
  const canLogSets = plannedSets(e) > 0;
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const { dose, meta } = exerciseDataLineParts(e);
  const title = canonicalExerciseName(e);
  const details = resolveExerciseSheetViewModel(e);
  const equipmentNames = equipmentNamesFor(equipmentIds);
  const label = e.label ?? (typeof index === "number" ? String(index + 1) : "");
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
        >
          {done ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="text-[11px] font-bold">{label}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={`block truncate text-[15px] font-semibold leading-tight ${
              done ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {title}
          </span>
          {(dose || meta) && (
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted-foreground">
              {dose && (
                <span className="mr-2 font-semibold tabular-nums text-foreground">{dose}</span>
              )}
              {meta}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60"
          aria-label="Szczegóły"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted/40 p-3 text-xs">
          {details.purpose && (
            <p className="text-sm leading-relaxed text-foreground">{details.purpose}</p>
          )}
          {details.steps.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground">Jak wykonać</div>
              <ol className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                {details.steps.map((step, i) => (
                  <li key={i} className="list-decimal">
                    {[step.title, step.description].filter(Boolean).join(" — ")}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {details.cues.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground">Wskazówki</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {details.cues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            </div>
          )}
          {details.errors.length > 0 && (
            <div>
              <div className="font-semibold text-muted-foreground">Błędy</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {details.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2 text-sm text-foreground/80 sm:grid-cols-2">
            <div>
              <div className="font-semibold text-muted-foreground">Sprzęt</div>
              <p className="mt-1">{details.equipment}</p>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Zamiana bez sprzętu</div>
              <p className="mt-1">{details.replacement}</p>
            </div>
          </div>
          {!done && equipmentIds.length > 0 && (
            <button
              type="button"
              onClick={onUnavailable}
              className="text-[11px] font-medium text-primary"
            >
              Nie mam {equipmentNames.join(", ")}
            </button>
          )}
          {canLogSets && (
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="rounded-md border border-primary/30 px-2.5 py-1 text-[11px] font-semibold text-primary"
            >
              Zapisz serie
            </button>
          )}
          <button
            type="button"
            onClick={() => setDetailSheetOpen(true)}
            className="block text-[11px] font-semibold text-primary"
          >
            Otwórz pełne szczegóły ćwiczenia
          </button>
          <MovementBlueprint exercise={e} />
        </div>
      )}
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
