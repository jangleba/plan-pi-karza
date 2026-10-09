import type { TrainingExercise } from "@/lib/loadwise/types";
import { exerciseDose } from "@/lib/loadwise/trainingDetails";

export function SessionPreparation({ equipment }: { equipment: string[] }) {
  return (
    <details className="rounded-2xl border border-border/60 bg-card px-4 text-sm">
      <summary className="cursor-pointer py-3 font-semibold text-foreground">
        Przed startem · przygotuj sprzęt
      </summary>
      <p className="pb-3 text-xs leading-relaxed text-muted-foreground">
        {equipment.length
          ? equipment.join(" · ")
          : "Sprawdź miejsce i ustawienie opisane przy każdym ćwiczeniu."}
      </p>
    </details>
  );
}

export function NextExercisePreview({ exercise }: { exercise: TrainingExercise | undefined }) {
  if (!exercise) return null;
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
      <span className="text-muted-foreground">Następne zadanie</span>
      <p className="mt-0.5 font-semibold text-foreground">{exercise.name}</p>
      <p className="mt-0.5 text-muted-foreground">{exerciseDose(exercise)}</p>
    </div>
  );
}

export function CompletionUndo({ onUndo, label }: { onUndo: () => void; label: string | null }) {
  if (!label) return null;
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-xs"
      role="status"
    >
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-11 shrink-0 px-2 font-semibold text-primary"
      >
        Cofnij
      </button>
    </div>
  );
}
