import { memo, useEffect, useId, useMemo, useState } from "react";
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
import { useActivityExitGuard } from "../ActivityExitGuard";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/app-ui";

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
  const stagePanelId = useId();
  const { markEquipmentUnavailable, state } = useLoadwise();
  const stages = useMemo(() => buildStrengthStages(sections), [sections]);
  const [activeStageKey, setActiveStageKey] = useState<StrengthStageKey>(
    stages[0]?.key ?? "warmup",
  );
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [runnerExercise, setRunnerExercise] = useState<TrainingExercise | null>(null);
  useActivityExitGuard({
    dirty: Object.values(done).some(Boolean) && !state?.completions[sessionId ?? ""]?.completed,
    description: "Oznaczenia ćwiczeń w tej sesji nie zostały zapisane.",
  });

  useEffect(() => setDone({}), [date, sessionId]);

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
      <Tabs
        value={activeStage.key}
        options={stages.map((stage) => ({ value: stage.key, label: stage.label }))}
        onChange={setActiveStageKey}
        label="Etapy treningu siłowego"
        panelId={stagePanelId}
      />

      <div
        id={stagePanelId}
        role="tabpanel"
        aria-label={activeStage.label}
        tabIndex={0}
        className="space-y-4"
      >
        <div>
          <h2 className="sr-only">{activeStage.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
              <section key={block.id} className="bw-section">
                <header className="mb-4">
                  <h3 className="text-base font-semibold text-foreground">{title.heading}</h3>
                  {title.detail && (
                    <p className="mt-0.5 text-sm normal-case text-muted-foreground">
                      {title.detail}
                    </p>
                  )}
                </header>

                <div className="space-y-3">
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
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
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
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block text-base font-semibold leading-[1.25] ${
                                  completed
                                    ? "text-muted-foreground line-through"
                                    : "text-foreground"
                                }`}
                              >
                                {canonicalExerciseName(exercise)}
                              </span>
                              {(dose || meta) && (
                                <span className="mt-1 block text-sm leading-[1.3] text-muted-foreground">
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
                              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/55 sm:w-[84px]">
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
                          <div className="mt-2 pl-14">
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={() => markEquipmentUnavailable(date, exercise, equipmentIds)}
                              className="max-w-full justify-start text-left"
                            >
                              Nie mam {equipmentNames.join(", ")}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {rest && (
                  <div className="mt-3 flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>Przerwa po bloku: {rest}</span>
                  </div>
                )}

                {firstIncomplete && (
                  <div className="mt-4">
                    <Button onClick={() => setRunnerExercise(firstIncomplete)}>
                      Rozpocznij blok {blockCode}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {stageIndex === stages.length - 1 && (
          <Button variant="outline" onClick={onFinish}>
            Zakończ trening
          </Button>
        )}
      </div>

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
