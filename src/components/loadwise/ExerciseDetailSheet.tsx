import type { ReactNode } from "react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  getAllEquipmentDefinitions,
  getExerciseDefinition,
  resolveExerciseByName,
  specialistEquipmentForExercise,
} from "@/lib/loadwise/exerciseLibrary";
import { Disclosure, ResponsiveDialog } from "@/components/ui/app-ui";
import { MovementBlueprint } from "./MovementBlueprint";

const EQUIPMENT_DEFINITIONS = getAllEquipmentDefinitions();
function doseChip(e: TrainingExercise): string | null {
  const display = e.displayPrescription?.trim();

  if (display) return display;

  if (e.sets && e.reps) return `${e.sets} × ${e.reps}`;
  if (e.reps) return e.reps;
  if (e.duration) return e.duration;
  if (e.sets) return `${e.sets} serie`;
  return null;
}

function rpeChip(e: TrainingExercise): string | null {
  if (e.rpe) return /rpe/i.test(e.rpe) ? e.rpe : `RPE ${e.rpe}`;
  const load = e.loadTarget ?? "";
  const m = load.match(/RPE\s*[\d.,\-–]+/i);
  return m ? m[0] : null;
}

function intensityChip(e: TrainingExercise): string | null {
  const load = e.loadTarget?.trim();
  if (!load) return e.rir?.trim() ?? null;
  const rpe = rpeChip(e);
  return rpe && load.toLowerCase().includes(rpe.toLowerCase()) ? null : load;
}

function tempoChip(e: TrainingExercise): string | null {
  return e.tempo?.trim() ?? null;
}

function restChip(e: TrainingExercise): string | null {
  const r = e.restAfterPair ?? e.restAfterExercise;
  if (!r) return null;
  return r.replace(/^przerwa:?\s*/i, "").trim();
}

// Technika → maksymalnie 3 krótkie cue'e. Rozbijamy technique/cue na zdania.
function techniqueCues(e: TrainingExercise): string[] {
  const source = e.technique || e.cue || "";
  if (!source) return [];
  return source
    .split(/(?<=[.!?])\s+|;|\n|•/)
    .map((s) =>
      s
        .replace(/^[-–•\s]+/, "")
        .replace(/[.]+$/, "")
        .trim(),
    )
    .filter((s) => s.length > 2)
    .slice(0, 3);
}

export function resolveExerciseSheetViewModel(exercise: TrainingExercise) {
  const definition =
    (exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined) ??
    resolveExerciseByName(exercise.name);
  const suppliedSteps =
    exercise.instructionSteps?.filter(
      (step) => step.title?.trim().length || step.description?.trim().length,
    ) ?? [];
  const steps = suppliedSteps.length
    ? suppliedSteps
    : (definition?.instructionsPl ?? (exercise.technique ? [exercise.technique] : [])).map(
        (description) => ({ title: "", description }),
      );
  const cues = definition?.coachingCues?.slice(0, 3) ?? techniqueCues(exercise);
  const errors =
    definition?.commonErrors?.slice(0, 2) ??
    (exercise.commonMistake ? [exercise.commonMistake] : []);
  const equipmentNames = specialistEquipmentForExercise(definition).map(
    (id) => EQUIPMENT_DEFINITIONS.find((item) => item.id === id)?.displayName ?? id,
  );
  const noEquipmentReplacementId = definition?.replacementIds?.find((candidateId) => {
    const candidate = getExerciseDefinition(candidateId);
    return candidate && specialistEquipmentForExercise(candidate).length === 0;
  });
  return {
    purpose:
      exercise.purpose?.trim() || definition?.objective?.trim() || definition?.stimulus || null,
    setup: exercise.setup?.trim() || null,
    steps,
    cues,
    errors,
    rest: restChip(exercise),
    equipment: equipmentNames.length ? equipmentNames.join(", ") : "Masa ciała",
    replacement: noEquipmentReplacementId
      ? (getExerciseDefinition(noEquipmentReplacementId)?.displayNamePl ?? noEquipmentReplacementId)
      : equipmentNames.length
        ? "Brak zatwierdzonej zamiany bez sprzętu"
        : "Nie dotyczy",
    regression: exercise.regression?.trim() || null,
    progression: exercise.progression?.trim() || null,
    stopRule: exercise.contraindications?.trim() || definition?.injuryCautions?.[0] || null,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bw-section">
      <h3 className="bw-section-title">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ExerciseTechniqueContent({
  exercise,
  visual,
}: {
  exercise: TrainingExercise;
  visual?: ReactNode;
}) {
  const details = resolveExerciseSheetViewModel(exercise);
  return (
    <div className="bw-stack">
      {details.purpose && <p className="text-base leading-relaxed">{details.purpose}</p>}
      <div>{visual ?? <MovementBlueprint exercise={exercise} />}</div>
      {details.setup && (
        <Section title="Ustawienie startowe">
          <p className="text-base leading-relaxed text-muted-foreground">{details.setup}</p>
        </Section>
      )}
      {details.steps.length > 0 && (
        <Section title="Jak wykonać">
          <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed">
            {details.steps.map((step, index) => (
              <li key={index}>
                {step.title && !/^Krok\s+\d+$/i.test(step.title.trim()) && (
                  <span className="font-semibold">{step.title} </span>
                )}
                {step.description}
              </li>
            ))}
          </ol>
        </Section>
      )}
      {details.cues.length > 0 && (
        <Section title="Technika">
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">
            {details.cues.map((cue, index) => (
              <li key={index}>{cue}</li>
            ))}
          </ul>
        </Section>
      )}
      {details.errors.length > 0 && (
        <Disclosure title="Najczęstsze błędy">
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            {details.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </Disclosure>
      )}
      {details.regression && (
        <Section title="Łatwiejsza wersja">
          <p className="text-base leading-relaxed text-muted-foreground">{details.regression}</p>
        </Section>
      )}
      {details.progression && (
        <Section title="Trudniejsza wersja">
          <p className="text-base leading-relaxed text-muted-foreground">{details.progression}</p>
        </Section>
      )}
      <Section title="Sprzęt i zamiana">
        <p className="text-sm text-muted-foreground">{details.equipment}</p>
        {details.replacement !== "Nie dotyczy" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Zamiana bez sprzętu: {details.replacement}
          </p>
        )}
      </Section>
      {details.stopRule && (
        <Section title="Kiedy przerwać">
          <p className="text-base leading-relaxed">{details.stopRule}</p>
        </Section>
      )}
    </div>
  );
}

export function ExerciseDetailSheet({
  exercise,
  open,
  onOpenChange,
}: {
  exercise: TrainingExercise | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  if (!exercise) return null;
  const details = resolveExerciseSheetViewModel(exercise);
  const prescription = [
    doseChip(exercise),
    rpeChip(exercise),
    intensityChip(exercise),
    tempoChip(exercise) ? `Tempo ${tempoChip(exercise)}` : null,
    details.rest ? `Przerwa ${details.rest}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={exercise.name}
      description={prescription || undefined}
    >
      <ExerciseTechniqueContent exercise={exercise} />
    </ResponsiveDialog>
  );
}
