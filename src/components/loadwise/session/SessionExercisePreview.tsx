import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TrainingExercise, TrainingSection } from "@/lib/loadwise/types";
import { canonicalExerciseName, compactPrescription } from "@/lib/loadwise/sessionPresentation";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";

/** Looking at instructions never starts a session or writes a result. */
export function SessionExercisePreview({ sections }: { sections: TrainingSection[] }) {
  const [selected, setSelected] = useState<TrainingExercise | null>(null);
  if (!sections.some((section) => section.blocks.some((block) => block.exercises.length)))
    return null;
  return (
    <div className="space-y-3" aria-label="Podgląd ćwiczeń">
      <p className="text-sm text-muted-foreground">
        Możesz obejrzeć każde ćwiczenie. Aby zapisywać wyniki, rozpocznij trening w dniu sesji.
      </p>
      {sections.map((section) => (
        <section key={section.id} className="space-y-2">
          <h2 className="text-sm font-semibold">{section.title}</h2>
          {section.blocks.flatMap((block) =>
            block.exercises.map((exercise) => (
              <button
                key={`${block.id}:${exercise.id}`}
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left"
                onClick={() => setSelected(exercise)}
                aria-label={`Szczegóły: ${canonicalExerciseName(exercise)}`}
              >
                <span>
                  <strong className="block text-sm">{canonicalExerciseName(exercise)}</strong>
                  <span className="text-xs text-muted-foreground">
                    {compactPrescription(exercise)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            )),
          )}
        </section>
      ))}
      {selected && (
        <ExerciseDetailSheet
          exercise={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      )}
    </div>
  );
}
