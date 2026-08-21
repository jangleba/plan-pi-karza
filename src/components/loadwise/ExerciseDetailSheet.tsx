import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  getAllEquipmentDefinitions,
  getExerciseDefinition,
  resolveExerciseByName,
  specialistEquipmentForExercise,
} from "@/lib/loadwise/exerciseLibrary";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MovementBlueprint } from "./MovementBlueprint";
import {
  ListChecks,
  ListOrdered,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

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
  const m = load.match(/RPE\s*[\d.\-–]+/i);
  return m ? m[0] : null;
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
    .map((s) => s.replace(/^[-–•\s]+/, "").replace(/[.]+$/, "").trim())
    .filter((s) => s.length > 2)
    .slice(0, 3);
}

export function resolveExerciseSheetViewModel(exercise: TrainingExercise) {
  const definition =
    (exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined) ??
    resolveExerciseByName(exercise.name);
  const steps =
    exercise.instructionSteps?.filter(
      (step) => step.title?.trim().length || step.description?.trim().length,
    ) ??
    [];
  const cues =
    definition?.coachingCues?.slice(0, 3) ?? techniqueCues(exercise);
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
    purpose: exercise.purpose?.trim() || definition?.objective?.trim() || definition?.stimulus || null,
    steps,
    cues,
    errors,
    rest: restChip(exercise),
    equipment: equipmentNames.length ? equipmentNames.join(", ") : "Masa ciała",
    replacement: noEquipmentReplacementId
      ? (getExerciseDefinition(noEquipmentReplacementId)?.displayNamePl ?? noEquipmentReplacementId)
      : (equipmentNames.length ? "Brak zatwierdzonej zamiany bez sprzętu" : "Nie dotyczy"),
    regression: exercise.regression?.trim() || null,
    progression: exercise.progression?.trim() || null,
    stopRule: exercise.contraindications?.trim() || definition?.injuryCautions?.[0] || null,
  };
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="mt-2">{children}</div>
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
  onOpenChange: (v: boolean) => void;
}) {
  if (!exercise) return null;
  const e = exercise;
  const dose = doseChip(e);
  const rpe = rpeChip(e);
  const details = resolveExerciseSheetViewModel(e);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-md overflow-y-auto px-5 pb-8">
          <div className="pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              Szczegóły ćwiczenia
            </div>
            <DrawerTitle className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
              {e.label && (
                <span className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-md bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
                  {e.label}
                </span>
              )}
              {e.name}
            </DrawerTitle>

            {/* Chipy: dawka / RPE / przerwa */}
            {(dose || rpe || details.rest) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {dose && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold tabular-nums text-foreground shadow-sm">
                    {dose}
                  </span>
                )}
                {rpe && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
                    {rpe}
                  </span>
                )}
                {details.rest && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    ⏱ {details.rest}
                  </span>
                )}
              </div>
            )}
          </div>
          {details.purpose && (
            <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Po co to ćwiczenie
              </div>

              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {details.purpose}
              </p>
            </div>
          )}
          {/* Movement Blueprint */}
          <div className="mt-5">
            <MovementBlueprint exercise={e} />
          </div>

          <div className="mt-2 divide-y divide-border/50">
            {details.steps.length > 0 && (
              <Section
                icon={<ListOrdered className="h-3.5 w-3.5" />}
                title="Jak wykonać"
              >
                <ol className="space-y-3">
                  {details.steps.map((step, i) => {
                    const title = step?.title?.trim?.() ?? "";
                    const description = step?.description?.trim?.() ?? "";
                    if (!title && !description) return null;
                    return (
                      <li
                        key={`step-${i}`}
                        className="flex items-start gap-3 text-sm text-foreground"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <span className="pt-0.5 leading-relaxed">
                          {title && (
                            <span className="font-semibold">{title}</span>
                          )}
                          {title && description && (
                            <span className="mx-1 text-muted-foreground">
                              —
                            </span>
                          )}
                          {description && (
                            <span className="text-muted-foreground">
                              {description}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Section>
            )}
            {details.cues.length > 0 && (
              <Section
                icon={<ListChecks className="h-3.5 w-3.5" />}
                title="Technika"
              >
                <ul className="space-y-1.5">
                  {details.cues.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {details.errors.length > 0 && (
              <Section
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                title="Najczęstsze błędy"
              >
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {details.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </Section>
            )}

            {e.regression && (
              <Section
                icon={<ArrowDownRight className="h-3.5 w-3.5" />}
                title="Łatwiejsza wersja"
              >
                <p className="text-sm text-muted-foreground">{e.regression}</p>
              </Section>
            )}

            {e.progression && (
              <Section
                icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                title="Trudniejsza wersja"
              >
                <p className="text-sm text-muted-foreground">{e.progression}</p>
              </Section>
            )}
            <Section
              icon={<ListChecks className="h-3.5 w-3.5" />}
              title="Sprzęt i zamiana"
            >
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Sprzęt: {details.equipment}</p>
                <p>Zamiana bez sprzętu: {details.replacement}</p>
              </div>
            </Section>
            {details.stopRule && (
              <Section
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                title="Kiedy przerwać"
              >
                <p className="text-sm text-muted-foreground">{details.stopRule}</p>
              </Section>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
