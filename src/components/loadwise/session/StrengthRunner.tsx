import { memo, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { TrainingSection, TrainingExercise, TrainingBlock } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { plannedSets } from "@/lib/loadwise/setLogs";
import { specialistEquipmentForExercise } from "@/lib/loadwise/exerciseLibrary";
import {
  canonicalExerciseName,
  compactPrescription,
  formatRestValue,
  normalizeStrengthBlockRest,
  resolveDefinitionForExercise,
  buildStrengthStages,
  equipmentNamesFor,
} from "@/lib/loadwise/sessionPresentation";
import {
  parseExerciseProgress,
  progressForPrescription,
  trainingFingerprint,
  trainingStorageKey,
} from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { WarmupCoach } from "../preparation/PreparationGuide";
import { ExerciseRunnerScreen } from "../ExerciseRunnerScreen";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { SprintRestTimer } from "./SprintRestTimer";
import { exerciseDisplayName } from "./exerciseDisplayNames";
import "./strength-session.css";

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
    () => stages.flatMap((s) => s.blocks.flatMap((b) => b.exercises)),
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pairRest, setPairRest] = useState({ label: "", token: 0, blockId: "" });
  useEffect(() => {
    setActiveId(null);
    setPairRest({ label: "", token: 0, blockId: "" });
  }, [progressKey, fingerprint]);
  function markDone(id: string, value: boolean) {
    local.setValue((current) => {
      const latest = progressForPrescription(current, fingerprint);
      return { ...latest, done: { ...latest.done, [id]: value }, fingerprint };
    });
  }
  function nextExercise(block: TrainingBlock, exercise: TrainingExercise, completed: boolean) {
    const updated = { ...done, [exercise.id]: completed };
    const index = block.exercises.findIndex((e) => e.id === exercise.id);
    const remaining = block.exercises.filter((e) => !updated[e.id]);
    const after = block.exercises.slice(index + 1).find((e) => !updated[e.id]);
    if (!after && block.exercises.length > 1 && remaining.length) {
      const label = exercise.restAfterPair || block.restAfterBlock;
      if (label) setPairRest((r) => ({ label, token: r.token + 1, blockId: block.id }));
    }
    const next = after ?? remaining.find((e) => e.id !== exercise.id) ?? remaining[0];
    if (block.exercises.length > 1) setActiveId(next?.id ?? null);
    else if (completed)
      setActiveId(
        allExercises
          .slice(allExercises.findIndex((e) => e.id === exercise.id) + 1)
          .find((e) => !updated[e.id])?.id ?? null,
      );
  }
  const completedCount = allExercises.filter((e) => done[e.id]).length;
  if (!allExercises.length) return null;
  return (
    <div className="bw-strength bw-training-list">
      <div className="bw-training-progress" role="status">
        <span>
          {completedCount} z {allExercises.length} ćwiczeń
        </span>
        {!local.available && <span>Postęp tylko w tym widoku</span>}
        <progress value={completedCount} max={allExercises.length} aria-label="Postęp treningu" />
      </div>
      {stages.map((stage) =>
        stage.key === "warmup" &&
        stage.blocks.some((block) =>
          block.exercises.some((e) =>
            /mobilność: biodra, kostki|aktywacja pośladków i core/i.test(e.name),
          ),
        ) ? (
          <WarmupCoach
            key={stage.key}
            exercises={stage.blocks.flatMap((b) => b.exercises)}
            kind="strength"
            storageKey={`${progressKey}:guided`}
            onFinish={(all) => {
              if (!all) return;
              local.setValue((current) => {
                const latest = progressForPrescription(current, fingerprint);
                return {
                  ...latest,
                  done: {
                    ...latest.done,
                    ...Object.fromEntries(
                      stage.blocks.flatMap((b) => b.exercises).map((e) => [e.id, true]),
                    ),
                  },
                  fingerprint,
                };
              });
            }}
          />
        ) : (
          <section className="bw-training-stage" key={stage.key}>
            <h2>{stage.label}</h2>
            {stage.blocks.map((block) => {
              const activeBlock = block.exercises.some((e) => e.id === activeId);
              const paired =
                block.exercises.length > 1 && block.exercises.some((e) => e.restAfterPair);
              return (
                <div className="bw-training-block" key={block.id}>
                  {paired && (
                    <p className="bw-pair-label">
                      {block.exercises
                        .map((e) => e.label)
                        .filter(Boolean)
                        .join(" + ") || "Para ćwiczeń"}{" "}
                      · na zmianę
                      {block.restAfterBlock
                        ? ` · przerwa ${normalizeStrengthBlockRest(block.restAfterBlock)} po parze`
                        : ""}
                    </p>
                  )}
                  {activeBlock && paired && (
                    <div className="bw-training-rest">
                      <SprintRestTimer
                        label={
                          pairRest.blockId === block.id
                            ? pairRest.label
                            : block.exercises.find((e) => e.restAfterPair)?.restAfterPair ||
                              block.restAfterBlock ||
                              ""
                        }
                        compact
                        startToken={pairRest.blockId === block.id ? pairRest.token : 0}
                      />
                    </div>
                  )}
                  {block.exercises.map((exercise) => {
                    const active = activeId === exercise.id;
                    const completed = Boolean(done[exercise.id]);
                    const title = exerciseDisplayName(canonicalExerciseName(exercise)).title;
                    const sets = plannedSets(exercise);
                    const equipment = specialistEquipmentForExercise(
                      resolveDefinitionForExercise(exercise),
                    );
                    const rest = exercise.restAfterPair || exercise.restAfterExercise;
                    return (
                      <article
                        key={exercise.id}
                        className={`bw-training-exercise ${active ? "is-active" : ""} ${completed ? "is-done" : ""}`}
                      >
                        <div className="bw-training-exercise-heading">
                          <button
                            type="button"
                            className="bw-exercise-check"
                            aria-label={`${completed ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}: ${canonicalExerciseName(exercise)}`}
                            aria-pressed={completed}
                            onClick={() => markDone(exercise.id, !completed)}
                          >
                            {completed ? <Check size={16} /> : exercise.label || "○"}
                          </button>
                          <button
                            type="button"
                            className="bw-exercise-open"
                            aria-expanded={active}
                            onClick={() => setActiveId(active ? null : exercise.id)}
                          >
                            <span>
                              <strong>{title}</strong>
                              <span className="bw-exercise-dose">
                                {compactPrescription(exercise)
                                  .replace(
                                    /\s*@?\s*RPE\s*\d+(?:[.,]\d+)?(?:[–-]\d+(?:[.,]\d+)?)?/gi,
                                    "",
                                  )
                                  .trim()}
                              </span>
                              {!paired && rest && (
                                <span className="bw-exercise-rest">
                                  Przerwa {formatRestValue(rest)}
                                </span>
                              )}
                            </span>
                            <ChevronDown size={17} className={active ? "is-open" : ""} />
                          </button>
                        </div>
                        {activeBlock && sets > 0 && (
                          <ExerciseRunnerScreen
                            exercise={exercise}
                            sessionId={sessionId}
                            date={date}
                            open={active}
                            inline
                            showVisuals={false}
                            manageRest={!paired}
                            onClose={() => setActiveId(null)}
                            onComplete={() => markDone(exercise.id, true)}
                            onSetSaved={(_log, finished) => nextExercise(block, exercise, finished)}
                          />
                        )}
                        {active && sets === 0 && (
                          <div className="bw-training-inline">
                            <ExerciseQuickGuide exercise={exercise} compact />
                            <button
                              type="button"
                              className="bw-save-set"
                              onClick={() => {
                                markDone(exercise.id, true);
                                setActiveId(
                                  allExercises.find((e) => e.id !== exercise.id && !done[e.id])
                                    ?.id ?? null,
                                );
                              }}
                            >
                              Gotowe
                            </button>
                          </div>
                        )}
                        {active && equipment.length > 0 && (
                          <button
                            type="button"
                            className="bw-equipment-change"
                            onClick={() => markEquipmentUnavailable(date, exercise, equipment)}
                          >
                            Brak sprzętu: {equipmentNamesFor(equipment).join(", ")}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ),
      )}
      <button type="button" className="bw-finish-workout" onClick={onFinish}>
        Zakończ trening
      </button>
    </div>
  );
});
