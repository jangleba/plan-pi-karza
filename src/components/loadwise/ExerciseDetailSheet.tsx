import { MethodBlueprint, hasMethodBlueprint } from "./session/MethodBlueprint";
import { MethodExecutionCoach } from "./session/MethodExecutionCoach";
import type { TrainingExercise } from "@/lib/loadwise/types";
import {
  getAllEquipmentDefinitions,
  getExerciseDefinition,
  resolveExerciseByName,
  specialistEquipmentForExercise,
  hydrateTrainingExerciseFromDefinition,
} from "@/lib/loadwise/exerciseLibrary";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { MovementBlueprint } from "./MovementBlueprint";
import { PreparationIllustration } from "./preparation/PreparationIllustration";
import { ExerciseAnimationPreview } from "./session/ExerciseAnimationPreview";
import { resolveExerciseAnimation } from "@/lib/trainingCoach/animationCatalog";
import { ExerciseQuickGuide } from "./session/ExerciseQuickGuide";
import { getSkipGuide, SKIP_LANDING } from "@/lib/loadwise/skipGuides";
import {
  Bike,
  Wind,
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
  if (e.sets && e.duration) return `${e.sets} × ${e.duration}`;
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

export function resolveExerciseSheetViewModel(raw: TrainingExercise) {
  const exercise = hydrateTrainingExerciseFromDefinition({
    ...raw,
    instructionSteps: raw.instructionSteps?.some(
      (step) => step.title?.trim() || step.description?.trim(),
    )
      ? raw.instructionSteps
      : undefined,
    purpose:
      /^(?:hypertrophy|strength|max_strength|power|stability|mobility|coordination|technique)$/i.test(
        raw.purpose ?? "",
      )
        ? undefined
        : raw.purpose,
  });
  const definition =
    (exercise.exerciseId ? getExerciseDefinition(exercise.exerciseId) : undefined) ??
    resolveExerciseByName(exercise.name);
  const skip = getSkipGuide(definition?.id ?? exercise.exerciseId);
  const standardTechniqueSteps =
    definition &&
    !["speed", "conditioning", "football_ball_work"].includes(
      definition.family ?? definition.category,
    )
      ? definition.instructionsPl?.map((description, index) => ({
          title: `Krok ${index + 1}`,
          description,
        }))
      : undefined;
  const steps =
    skip?.steps.map((description) => ({ title: "", description })) ??
    standardTechniqueSteps ??
    exercise.instructionSteps?.filter(
      (step) => step.title?.trim().length || step.description?.trim().length,
    ) ??
    [];
  const cues =
    (skip ? [skip.focus, SKIP_LANDING] : null) ??
    definition?.coachingCues?.slice(0, 3) ??
    techniqueCues(exercise);
  const errors =
    (skip ? [...skip.errors] : null) ??
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
    setup: skip?.setup ?? (exercise.setup?.trim() || null),
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
  onRecord,
}: {
  exercise: TrainingExercise | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRecord?: () => void;
}) {
  if (!exercise) return null;
  const e = exercise;
  const dose = doseChip(e);
  const rpe = rpeChip(e);
  const intensity = intensityChip(e);
  const tempo = tempoChip(e);
  const details = resolveExerciseSheetViewModel(e);
  const skip = getSkipGuide(e.exerciseId);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} initialDetent="large">
      <DrawerContent aria-describedby={undefined} className="bw-exercise-detail-sheet">
        <div className="mx-auto w-full max-w-md pb-4">
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
            {(dose || rpe || intensity || tempo || details.rest) && (
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
                {intensity && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                    {intensity}
                  </span>
                )}
                {tempo && (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    Tempo {tempo}
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
          {e.methodExecution && <MethodExecutionCoach key={e.id} plan={e.methodExecution} context={e.id} enabled={false} />}
          {onRecord && (
            <button type="button" className="bw-detail-record" onClick={onRecord}>
              Zapisz serie
            </button>
          )}
          {e.executionBlockedReason && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {e.executionBlockedReason}
            </p>
          )}
          {skip ? (
            <ExerciseQuickGuide exercise={e} className="mt-5" autoAnimation initialExpanded />
          ) : (
            <>
              <div className="bw-exercise-detail-media">
                {hasMethodBlueprint(e.exerciseId) ? <MethodBlueprint exerciseId={e.exerciseId}/> : resolveExerciseAnimation(e) ? (
                  <ExerciseAnimationPreview exercise={e} autoOpen />
                ) : e.exerciseId === "adductor_bridge_squeeze" ||
                  e.exerciseId === "heel_dig_hamstring_iso_90" ? (
                  <PreparationIllustration
                    visual="bridge"
                    label={
                      e.exerciseId === "adductor_bridge_squeeze"
                        ? "Most z dociskiem ręcznika między kolanami"
                        : "Most z dociskiem pięt i kolanami ugiętymi około 90°"
                    }
                    squeeze={e.exerciseId === "adductor_bridge_squeeze"}
                  />
                ) : e.exerciseId === "hip_mobility_flow" ? (
                  <PreparationIllustration visual="hip" label="Mobilizacja biodra w wykroku" />
                ) : e.exerciseId === "easy_cycle_recovery" ||
                  e.exerciseId === "diaphragmatic_breathing" ? (
                  <div className="bw-activity-illustration" role="img" aria-label={e.name}>
                    {e.exerciseId === "easy_cycle_recovery" ? (
                      <Bike size={88} strokeWidth={1} />
                    ) : (
                      <Wind size={88} strokeWidth={1} />
                    )}
                  </div>
                ) : (
                  <MovementBlueprint exercise={e} />
                )}
              </div>
              {details.purpose && <p className="bw-exercise-purpose">{details.purpose}</p>}
              <div className="mt-2 divide-y divide-border/50">
                {details.setup && (
                  <Section
                    icon={<ListChecks className="h-3.5 w-3.5" />}
                    title="Ustawienie startowe"
                  >
                    <p className="text-sm leading-relaxed text-muted-foreground">{details.setup}</p>
                  </Section>
                )}
                {details.steps.length > 0 && (
                  <Section icon={<ListOrdered className="h-3.5 w-3.5" />} title="Jak wykonać">
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
                              {title && <span className="font-semibold">{title}</span>}
                              {title && description && (
                                <span className="mx-1 text-muted-foreground">—</span>
                              )}
                              {description && (
                                <span className="text-muted-foreground">{description}</span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </Section>
                )}
                {details.cues.length > 0 && (
                  <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="Technika">
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
                <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="Sprzęt i zamiana">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Sprzęt: {details.equipment}</p>
                    <p>Zamiana bez sprzętu: {details.replacement}</p>
                  </div>
                </Section>
                {details.stopRule && (
                  <Section icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Kiedy przerwać">
                    <p className="text-sm text-muted-foreground">{details.stopRule}</p>
                  </Section>
                )}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
