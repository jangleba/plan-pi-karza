import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight } from "lucide-react";
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
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";
import { PersistentExercisePanel } from "./PersistentExercisePanel";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { SprintRestTimer } from "./SprintRestTimer";
import { exerciseDisplayName } from "./exerciseDisplayNames";
import { groupStrengthPreview } from "./strengthPreview";
import "./strength-session.css";

export const StrengthStructuredSections = memo(function StrengthStructuredSections({
  sections,
  date,
  sessionId,
  onFinish,
  canRecord = true,
}: {
  sections: TrainingSection[];
  date: string;
  sessionId?: string | null;
  onFinish: () => void;
  canRecord?: boolean;
}) {
  const { markEquipmentUnavailable } = useLoadwise();
  const { user } = useAuth();
  const stages = useMemo(() => buildStrengthStages(sections), [sections]);
  const preview = useMemo(() => groupStrengthPreview(stages), [stages]);
  const visibleStages = canRecord ? stages : preview.stages;
  const allExercises = useMemo(
    () => stages.flatMap((s) => s.blocks.flatMap((b) => b.exercises)),
    [stages],
  );
  const workExercises = useMemo(
    () =>
      stages
        .filter((s) => s.key === "main" || s.key === "accessory")
        .flatMap((s) => s.blocks.flatMap((b) => b.exercises)),
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailExercise = allExercises.find((e) => e.id === detailId) ?? null;
  const [pairRest, setPairRest] = useState({ label: "", token: 0, blockId: "" });
  useEffect(() => {
    setActiveId(null);
    setDetailOpen(false);
    setDetailId(null);
    setPairRest({ label: "", token: 0, blockId: "" });
  }, [progressKey, fingerprint]);
  function markDone(id: string, value: boolean) {
    if (!canRecord) return;
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
    if (block.exercises.length > 1 && remaining.length) {
      const label = after
        ? exercise.restAfterExercise
        : exercise.restAfterPair || block.restAfterBlock;
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
  const progressExercises = workExercises.length ? workExercises : allExercises;
  const completedCount = progressExercises.filter((e) => done[e.id]).length;
  if (!allExercises.length) return null;
  return (
    <div className="bw-strength bw-training-list">
      {canRecord ? (
        <div className="bw-training-progress" role="status">
          <span>
            {completedCount} z {progressExercises.length} ćwiczeń głównych
          </span>
          {!local.available && <span>Postęp tylko w tym widoku</span>}
          <progress
            value={completedCount}
            max={progressExercises.length}
            aria-label="Postęp treningu"
          />
        </div>
      ) : (
        <p className="bw-training-preview-summary">
          {preview.stages
            .filter((s) => s.key === "main" || s.key === "accessory")
            .reduce((n, s) => n + s.blocks.reduce((n, b) => n + b.exercises.length, 0), 0)}{" "}
          ćwiczeń głównych · Rozgrzewka i zakończenie poniżej
        </p>
      )}
      {visibleStages.map((stage) => (
        <PreparationStage
          key={`${progressKey}:${fingerprint}:${stage.key}`}
          label={stage.label}
          grouped={stage.key === "warmup" || stage.key === "cooldown"}
          count={stage.blocks.reduce((n, b) => n + b.exercises.length, 0)}
          active={stage.blocks.some((b) => b.exercises.some((e) => e.id === activeId))}
        >
          {stage.key === "warmup" &&
          stage.blocks.some((block) =>
            block.exercises.some((e) =>
              /mobilność: biodra, kostki|aktywacja pośladków i core/i.test(e.name),
            ),
          ) ? (
            <WarmupCoach
              key={`${progressKey}:${fingerprint}:${stage.key}`}
              exercises={stage.blocks.flatMap((b) => b.exercises)}
              kind="strength"
              storageKey={`${progressKey}:guided${canRecord ? "" : ":preview"}`}
              onFinish={(all) => {
                if (!canRecord || !all) return;
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
            <section
              className="bw-training-stage"
              key={`${progressKey}:${fingerprint}:${stage.key}`}
            >
              <h2>{stage.label}</h2>
              <div className="bw-training-stage-list">
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
                          · kolejność i przerwy
                          {block.restAfterBlock
                            ? ` · przerwa ${normalizeStrengthBlockRest(block.restAfterBlock)} ${block.exercises.length > 2 ? "po rundzie" : "po parze"}`
                            : ""}
                        </p>
                      )}
                      {paired && (
                        <PersistentExercisePanel open={activeBlock}>
                          <div className="bw-training-rest">
                            <SprintRestTimer
                              label={
                                (pairRest.blockId === block.id && pairRest.token > 0
                                  ? pairRest.label
                                  : null) ||
                                block.exercises.find((e) => e.restAfterPair)?.restAfterPair ||
                                block.restAfterBlock ||
                                ""
                              }
                              compact
                              startToken={pairRest.blockId === block.id ? pairRest.token : 0}
                            />
                          </div>
                        </PersistentExercisePanel>
                      )}
                      {block.exercises.map((exercise) => {
                        const active = activeId === exercise.id;
                        const completed = Boolean(done[exercise.id]);
                        const displayName = exerciseDisplayName(canonicalExerciseName(exercise));
                        // A short generic title alone made different squat/hinge
                        // variants look like duplicate, unspecified exercises.
                        const title = [displayName.title, displayName.variant]
                          .filter(Boolean)
                          .join(" · ");
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
                                aria-label={
                                  !canRecord
                                    ? `Technika: ${canonicalExerciseName(exercise)}`
                                    : `${completed ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}: ${canonicalExerciseName(exercise)}`
                                }
                                aria-pressed={canRecord ? completed : undefined}
                                aria-haspopup={!canRecord ? "dialog" : undefined}
                                disabled={canRecord && Boolean(exercise.executionBlockedReason)}
                                onClick={() => {
                                  if (!canRecord) {
                                    setDetailId(exercise.id);
                                    setDetailOpen(true);
                                  } else markDone(exercise.id, !completed);
                                }}
                              >
                                {!canRecord ? (
                                  <BookOpen size={16} />
                                ) : completed ? (
                                  <Check size={16} />
                                ) : (
                                  exercise.label || "○"
                                )}
                              </button>
                              <button
                                type="button"
                                className="bw-exercise-open"
                                aria-haspopup="dialog"
                                aria-expanded={detailOpen && detailId === exercise.id}
                                onClick={() => {
                                  setDetailId(exercise.id);
                                  setDetailOpen(true);
                                }}
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
                                  {!canRecord &&
                                    (preview.occurrences.get(exercise.id)?.length ?? 0) > 1 && (
                                      <span className="bw-exercise-archived-count">
                                        Wpisy w zapisanym planie:{" "}
                                        {preview.occurrences.get(exercise.id)!.length}
                                      </span>
                                    )}
                                  {!paired && rest && (
                                    <span className="bw-exercise-rest">
                                      Przerwa {formatRestValue(rest)}
                                    </span>
                                  )}
                                  {!canRecord && exercise.executionBlockedReason && (
                                    <span className="bw-exercise-preview-warning">
                                      Wariant do sprawdzenia
                                    </span>
                                  )}
                                </span>
                                <ChevronRight size={17} aria-hidden="true" />
                              </button>
                            </div>

                            {canRecord && exercise.executionBlockedReason && (
                              <p role="status" className="bw-coach-notice">
                                {exercise.executionBlockedReason}
                              </p>
                            )}
                            <PersistentExercisePanel open={active && canRecord}>
                              {canRecord && sets > 0 && (
                                <ExerciseRunnerScreen
                                  exercise={exercise}
                                  sessionId={sessionId}
                                  date={date}
                                  open
                                  inline
                                  showVisuals={false}
                                  manageRest={!paired}
                                  onClose={() => setActiveId(null)}
                                  onComplete={() => markDone(exercise.id, true)}
                                  onSetSaved={(_log, finished) =>
                                    nextExercise(block, exercise, finished)
                                  }
                                />
                              )}
                              {canRecord && sets === 0 && (
                                <div className="bw-training-inline">
                                  <ExerciseQuickGuide exercise={exercise} compact autoAnimation />
                                  <button
                                    type="button"
                                    className="bw-save-set"
                                    disabled={Boolean(exercise.executionBlockedReason)}
                                    onClick={() => {
                                      markDone(exercise.id, true);
                                      setActiveId(
                                        allExercises.find(
                                          (e) => e.id !== exercise.id && !done[e.id],
                                        )?.id ?? null,
                                      );
                                    }}
                                  >
                                    Gotowe
                                  </button>
                                </div>
                              )}
                              {canRecord && equipment.length > 0 && (
                                <button
                                  type="button"
                                  className="bw-equipment-change"
                                  onClick={() =>
                                    markEquipmentUnavailable(date, exercise, equipment)
                                  }
                                >
                                  Brak sprzętu: {equipmentNamesFor(equipment).join(", ")}
                                </button>
                              )}
                            </PersistentExercisePanel>
                          </article>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </PreparationStage>
      ))}
      <ExerciseDetailSheet
        exercise={detailExercise}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        planOccurrences={!canRecord && detailId ? preview.occurrences.get(detailId) : undefined}
        onRecord={
          canRecord &&
          detailExercise &&
          plannedSets(detailExercise) > 0 &&
          !detailExercise.executionBlockedReason
            ? () => {
                setDetailOpen(false);
                setActiveId(detailExercise.id);
              }
            : undefined
        }
      />
      {canRecord && (
        <button type="button" className="bw-finish-workout" onClick={onFinish}>
          Zakończ trening
        </button>
      )}
    </div>
  );
});

function PreparationStage({
  grouped,
  label,
  count,
  active,
  children,
}: {
  grouped: boolean;
  label: string;
  count: number;
  active: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);
  if (!grouped) return children;
  return (
    <section className="bw-preparation-group">
      <button
        type="button"
        className="bw-preparation-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          <strong>{label}</strong>
          <small>{count} kroki · instrukcje i podgląd</small>
        </span>
        <ChevronDown size={18} className={expanded ? "is-open" : ""} aria-hidden="true" />
      </button>
      <div hidden={!expanded} className="bw-preparation-steps">
        {children}
      </div>
    </section>
  );
}
