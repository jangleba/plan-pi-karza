import { memo, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clock } from "lucide-react";
import type { TrainingSection, TrainingExercise } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { specialistEquipmentForExercise } from "@/lib/loadwise/exerciseLibrary";
import { getExerciseTechniqueImage } from "@/lib/loadwise/exerciseTechniqueImages";
import {
  equipmentNamesFor,
  canonicalExerciseName,
  exerciseDataLineParts,
  resolveDefinitionForExercise,
  buildStrengthStages,
  normalizeStrengthBlockRest,
  splitStrengthBlockTitle,
  type StrengthStageKey,
} from "@/lib/loadwise/sessionPresentation";
import { ExerciseRunnerScreen } from "../ExerciseRunnerScreen";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { useAuth } from "@/lib/loadwise/auth";
import {
  parseExerciseProgress,
  progressForPrescription,
  trainingFingerprint,
  trainingStorageKey,
} from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { CompletionUndo, NextExercisePreview, SessionPreparation } from "./SessionQuickTools";
import { SprintRestTimer } from "./SprintRestTimer";

export const StrengthStructuredSections = memo(function StrengthStructuredSections({
  sections,
  date,
  sessionId,
  onFinish,
}: {
  sections: TrainingSection[];
  date: string;
  sessionId?: string | null;
  onFinish: () => void;
}) {
  const { markEquipmentUnavailable } = useLoadwise();
  const { user } = useAuth();
  const stages = useMemo(() => buildStrengthStages(sections), [sections]);
  const allExercises = useMemo(
    () => stages.flatMap((stage) => stage.blocks.flatMap((block) => block.exercises)),
    [stages],
  );
  const fingerprint = trainingFingerprint(allExercises);
  const progressKey = trainingStorageKey(
    "strength-progress",
    user?.id,
    sessionId ?? date,
    sessionId ? "" : allExercises.map((e) => e.id).join("|"),
  );
  const local = useTrainingLocalState(
    progressKey,
    { done: {}, started: false, currentBlockIdx: 0, fingerprint },
    parseExerciseProgress,
  );
  const progress = progressForPrescription(local.value, fingerprint);
  const done = progress.done;
  const activeStageKey =
    stages[Math.min(progress.currentBlockIdx, Math.max(0, stages.length - 1))]?.key ?? "warmup";
  const [lastToggle, setLastToggle] = useState<{ id: string; wasDone: boolean } | null>(null);
  const [runnerExercise, setRunnerExercise] = useState<TrainingExercise | null>(null);
  useEffect(() => {
    setLastToggle(null);
    setRunnerExercise(null);
  }, [progressKey, fingerprint]);
  function setActiveStageKey(key: StrengthStageKey) {
    local.setValue({
      ...progress,
      currentBlockIdx: Math.max(
        0,
        stages.findIndex((stage) => stage.key === key),
      ),
      fingerprint,
    });
  }
  function markDone(id: string, value: boolean) {
    setLastToggle({ id, wasDone: Boolean(done[id]) });
    local.setValue((current) => {
      const latest = progressForPrescription(current, fingerprint);
      return { ...latest, done: { ...latest.done, [id]: value }, fingerprint };
    });
  }

  if (stages.length === 0) return null;

  const activeStage = stages.find((stage) => stage.key === activeStageKey) ?? stages[0];
  const stageIndex = stages.findIndex((stage) => stage.key === activeStage.key);
  const exerciseCount = activeStage.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  const pluralBlocks =
    activeStage.blocks.length === 1
      ? "1 blok"
      : activeStage.blocks.length >= 2 && activeStage.blocks.length <= 4
        ? `${activeStage.blocks.length} bloki`
        : `${activeStage.blocks.length} bloków`;
  const pluralExercises =
    exerciseCount === 1
      ? "1 ćwiczenie"
      : exerciseCount >= 2 && exerciseCount <= 4
        ? `${exerciseCount} ćwiczenia`
        : `${exerciseCount} ćwiczeń`;

  return (
    <div className="space-y-4">
      <SessionPreparation
        equipment={equipmentNamesFor(
          Array.from(
            new Set(
              allExercises.flatMap((exercise) =>
                specialistEquipmentForExercise(resolveDefinitionForExercise(exercise)),
              ),
            ),
          ),
        )}
      />
      <div className="text-xs text-muted-foreground" role="status">
        {allExercises.filter((e) => done[e.id]).length}/{allExercises.length} ćwiczeń oznaczonych ·{" "}
        {local.available ? "postęp zachowany na urządzeniu" : "zapis na urządzeniu niedostępny"}
      </div>
      <CompletionUndo
        label={lastToggle ? "Zmieniono oznaczenie ćwiczenia" : null}
        onUndo={() => {
          if (!lastToggle) return;
          local.setValue({
            ...progress,
            done: { ...done, [lastToggle.id]: lastToggle.wasDone },
            fingerprint,
          });
          setLastToggle(null);
        }}
      />
      <div
        className="grid gap-1 rounded-2xl bg-muted/55 p-1"
        style={{
          gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
        }}
        aria-label="Etapy treningu siłowego"
      >
        {stages.map((stage) => {
          const active = stage.key === activeStage.key;
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => setActiveStageKey(stage.key)}
              className={`relative min-h-11 rounded-xl px-1.5 py-2 text-[11px] font-semibold leading-tight transition-colors ${
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              }`}
              aria-pressed={active}
            >
              {stage.label}
              {active && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-foreground">
          {activeStage.label}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {pluralBlocks} · {pluralExercises}
        </p>
      </div>

      <div className="space-y-3">
        {activeStage.blocks.map((block, blockIndex) => {
          const title = splitStrengthBlockTitle(
            block.title || block.exercises[0]?.name || "Blok ćwiczeń",
          );
          const rest = normalizeStrengthBlockRest(block.restAfterBlock);
          const firstIncomplete = block.exercises.find((exercise) => !done[exercise.id]);
          const blockCode =
            title.heading.match(/^BLOK\s+([A-Z0-9]+)/i)?.[1] ?? String(blockIndex + 1);

          return (
            <section
              key={block.id}
              className="overflow-hidden rounded-2xl border border-border/70 bg-card"
            >
              <header className="border-b border-border/55 px-4 py-3">
                <h3 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">
                  {title.heading}
                </h3>
                {title.detail && (
                  <p className="mt-0.5 text-[12px] normal-case text-muted-foreground">
                    {title.detail}
                  </p>
                )}
              </header>

              <div className="divide-y divide-border/55 px-4">
                {block.exercises.map((exercise, exerciseIndex) => {
                  const techniqueImage = getExerciseTechniqueImage(exercise.exerciseId);
                  const { dose, meta } = exerciseDataLineParts(exercise);
                  const equipmentIds = specialistEquipmentForExercise(
                    resolveDefinitionForExercise(exercise),
                  );
                  const equipmentNames = equipmentNamesFor(equipmentIds);
                  const completed = Boolean(done[exercise.id]);
                  const label = exercise.label || String(exerciseIndex + 1);

                  return (
                    <div key={exercise.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => markDone(exercise.id, !completed)}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold transition-colors ${
                            completed
                              ? "bg-primary text-primary-foreground"
                              : "bg-accent text-accent-foreground"
                          }`}
                          aria-label={
                            completed ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"
                          }
                          aria-pressed={completed}
                        >
                          {completed ? <Check className="h-4 w-4" /> : label}
                        </button>

                        <button
                          type="button"
                          onClick={() => setRunnerExercise(exercise)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-[15px] font-semibold leading-[1.25] ${
                                completed ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {canonicalExerciseName(exercise)}
                            </span>
                            {(dose || meta) && (
                              <span className="mt-1 block text-[12px] leading-[1.3] text-muted-foreground">
                                {dose && (
                                  <span className="mr-1.5 font-semibold tabular-nums text-foreground">
                                    {dose}
                                  </span>
                                )}
                                {meta}
                              </span>
                            )}
                          </span>

                          {techniqueImage ? (
                            <span className="flex h-14 w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/55">
                              <img
                                src={techniqueImage.src}
                                alt={techniqueImage.alt}
                                loading="lazy"
                                decoding="async"
                                width={168}
                                height={112}
                                className="h-full w-full object-contain"
                              />
                            </span>
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/65" />
                          )}
                        </button>
                      </div>

                      {!completed && <ExerciseQuickGuide exercise={exercise} className="ml-12" />}
                      {!completed && equipmentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => markEquipmentUnavailable(date, exercise, equipmentIds)}
                          className="ml-12 mt-1.5 text-[11px] font-medium text-primary"
                        >
                          Nie mam {equipmentNames.join(", ")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {rest && (
                <div className="border-t border-border/55 px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>Przerwa po bloku: {rest}</span>
                  </div>
                  <SprintRestTimer label={rest} compact />
                </div>
              )}

              {firstIncomplete && (
                <div className="px-4 pb-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setRunnerExercise(firstIncomplete)}
                    className="w-full rounded-xl bg-primary px-4 py-3 text-[14px] font-semibold text-primary-foreground transition-opacity active:opacity-85"
                  >
                    Rozpocznij blok {blockCode}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <NextExercisePreview exercise={allExercises.find((exercise) => !done[exercise.id])} />

      {stageIndex === stages.length - 1 && (
        <button
          type="button"
          onClick={onFinish}
          className="w-full rounded-xl border border-primary/25 bg-card px-4 py-3 text-[14px] font-semibold text-primary"
        >
          Zakończ trening
        </button>
      )}

      {runnerExercise && (
        <ExerciseRunnerScreen
          exercise={runnerExercise}
          sessionId={sessionId}
          date={date}
          open
          onClose={() => setRunnerExercise(null)}
          onComplete={() => markDone(runnerExercise.id, true)}
          nextExercise={
            allExercises[
              allExercises.findIndex((exercise) => exercise.id === runnerExercise.id) + 1
            ]
          }
        />
      )}
    </div>
  );
});
