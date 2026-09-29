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
  const stages = useMemo(() => buildStrengthStages(sections), [sections]);
  const [activeStageKey, setActiveStageKey] = useState<StrengthStageKey>(
    stages[0]?.key ?? "warmup",
  );
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [runnerExercise, setRunnerExercise] = useState<TrainingExercise | null>(null);

  useEffect(() => {
    if (stages.length > 0 && !stages.some((stage) => stage.key === activeStageKey)) {
      setActiveStageKey(stages[0].key);
    }
  }, [activeStageKey, stages]);

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
                          onClick={() =>
                            setDone((current) => ({
                              ...current,
                              [exercise.id]: !current[exercise.id],
                            }))
                          }
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold transition-colors ${
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
                <div className="flex items-center gap-2 border-t border-border/55 px-4 py-2.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Przerwa po bloku: {rest}</span>
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
          open
          onClose={() => setRunnerExercise(null)}
        />
      )}
    </div>
  );
});
