import { memo, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clock } from "lucide-react";
import type { TrainingSection, TrainingExercise } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { specialistEquipmentForExercise } from "@/lib/loadwise/exerciseLibrary";
import {
  equipmentNamesFor,
  canonicalExerciseName,
  compactPrescription,
  formatRestValue,
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
import "./strength-session.css";
import { exerciseDisplayName } from "./exerciseDisplayNames";

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
  const completedCount = allExercises.filter((exercise) => done[exercise.id]).length;

  return (
    <div className="bw-strength space-y-3">
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
      <div className="bw-strength-progress">
        <div className="flex items-center justify-between gap-3 text-xs" role="status">
          <span className="font-semibold text-foreground">
            {completedCount}/{allExercises.length} ukończone
          </span>
          <span className="text-muted-foreground">
            {local.available ? "Postęp zapisany" : "Zapis niedostępny"}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(completedCount / Math.max(1, allExercises.length)) * 100}%` }}
          />
        </div>
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
        className="grid gap-1 rounded-xl bg-muted/55 p-1"
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
              className={`relative min-h-11 rounded-lg px-1.5 py-2 text-[12px] font-semibold leading-tight transition-colors ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
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
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">
          {activeStage.label}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Etap {stageIndex + 1} z {stages.length}
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
              className="bw-strength-block overflow-hidden rounded-2xl border border-border/60 bg-card"
            >
              <header className="flex items-center gap-2.5 border-b border-border/55 px-3.5 py-2.5">
                <span className="bw-strength-block-code">{blockCode}</span>
                <h3 className="text-[13px] font-semibold leading-snug text-foreground">
                  {title.detail || title.heading}
                </h3>
              </header>

              <div className="divide-y divide-border/55 px-3.5">
                {block.exercises.map((exercise, exerciseIndex) => {
                  const dose = compactPrescription(exercise)
                    .replace(/\s*@?\s*RPE\s*\d+(?:[.,]\d+)?(?:[–-]\d+(?:[.,]\d+)?)?/gi, "")
                    .trim();
                  const display = exerciseDisplayName(canonicalExerciseName(exercise));
                  const restValue = formatRestValue(
                    exercise.restAfterPair ?? exercise.restAfterExercise,
                  ).replace(/\s+po parze$/i, "");
                  const equipmentIds = specialistEquipmentForExercise(
                    resolveDefinitionForExercise(exercise),
                  );
                  const equipmentNames = equipmentNamesFor(equipmentIds);
                  const completed = Boolean(done[exercise.id]);
                  const label = exercise.label || String(exerciseIndex + 1);

                  return (
                    <div key={exercise.id} className="bw-strength-row py-2.5">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => markDone(exercise.id, !completed)}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                            completed
                              ? "bg-primary text-primary-foreground"
                              : "border border-border/80 bg-background text-muted-foreground"
                          }`}
                          aria-label={`${completed ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}: ${canonicalExerciseName(exercise)}`}
                          aria-pressed={completed}
                        >
                          {completed ? <Check className="h-4 w-4" /> : label}
                        </button>

                        <button
                          type="button"
                          onClick={() => setRunnerExercise(exercise)}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-[15px] font-semibold leading-[1.25] ${
                                completed ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {display.title}
                            </span>
                            {display.variant && (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {display.variant}
                              </span>
                            )}
                            {dose && (
                              <span className="mt-1 block text-[13px] font-semibold tabular-nums text-foreground">
                                {dose}
                              </span>
                            )}
                            {restValue && (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                Przerwa{exercise.restAfterPair ? " po parze" : ""}: {restValue}
                              </span>
                            )}
                          </span>

                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/55" />
                        </button>
                      </div>

                      {!completed && (
                        <ExerciseQuickGuide exercise={exercise} compact className="ml-[54px]">
                          {equipmentIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => markEquipmentUnavailable(date, exercise, equipmentIds)}
                              className="min-h-11 pb-2 text-[12px] font-medium text-primary"
                            >
                              Brak sprzętu: {equipmentNames.join(", ")}
                            </button>
                          )}
                        </ExerciseQuickGuide>
                      )}
                    </div>
                  );
                })}
              </div>

              {rest && (
                <details className="bw-strength-rest border-t border-border/55 px-3.5">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Przerwa po bloku:{" "}
                      <strong className="font-semibold text-foreground">{rest}</strong>
                    </span>
                  </summary>
                  <div className="pb-3">
                    <SprintRestTimer label={rest} compact />
                  </div>
                </details>
              )}

              {firstIncomplete && (
                <div className="px-3.5 pb-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setRunnerExercise(firstIncomplete)}
                    className="w-full min-h-11 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity active:opacity-85"
                  >
                    {block.exercises.some((exercise) => done[exercise.id])
                      ? "Kontynuuj"
                      : "Rozpocznij"}{" "}
                    blok {blockCode}
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
          showVisuals={false}
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
