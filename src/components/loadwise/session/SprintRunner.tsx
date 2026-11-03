import { memo, useEffect, useId, useState } from "react";
import { Check, ChevronRight, Ruler } from "lucide-react";
import type { SessionDay, TrainingSection } from "@/lib/loadwise/types";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { specialistEquipmentForExercise } from "@/lib/loadwise/exerciseLibrary";
import {
  equipmentNamesFor,
  resolveDefinitionForExercise,
  restLabel,
} from "@/lib/loadwise/sessionPresentation";
import {
  buildSprintRunnerBlocks,
  SPRINT_RUNNER_CONTAINER_CLASS,
  type SprintExerciseView,
} from "@/lib/loadwise/sprintPresentation";
import { WarmupCoach } from "../preparation/PreparationGuide";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";
import { CourseSetup } from "./CourseSetup";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
import { PersistentExercisePanel } from "./PersistentExercisePanel";
import { SkipExerciseCard } from "./SkipExerciseCard";
import { getSkipGuide } from "@/lib/loadwise/skipGuides";
import { SprintRestTimer } from "./SprintRestTimer";
import { ExercisePersonalNote } from "./ExercisePersonalNote";
import { CompletionUndo, NextExercisePreview, SessionPreparation } from "./SessionQuickTools";
import {
  parseExerciseProgress,
  progressForPrescription,
  trainingFingerprint,
} from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import "./sprint-session.css";

function SprintExerciseRow({
  view,
  done,
  onToggle,
  onUnavailable,
  equipmentIds,
  isMainSprint,
  canRecord,
  expanded,
  onExpand,
  preparation,
}: {
  view: SprintExerciseView;
  done: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
  equipmentIds: string[];
  isMainSprint: boolean;
  canRecord: boolean;
  expanded: boolean;
  onExpand: () => void;
  preparation?: React.ReactNode;
}) {
  const panelId = useId();
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const exercise = view.exercise;
  const rest = restLabel(exercise);
  const equipmentNames = equipmentNamesFor(equipmentIds);
  if (getSkipGuide(exercise.exerciseId)) {
    return (
      <SkipExerciseCard
        exercise={exercise}
        prescription={view.prescription}
        rest={rest}
        done={done}
        onToggle={onToggle}
        canRecord={canRecord}
        compact
        expanded={expanded}
        onExpandedChange={onExpand}
      />
    );
  }
  return (
    <div className={`bw-sprint-row ${isMainSprint ? "bw-sprint-row-main" : ""}`}>
      <div className="flex items-start gap-2.5">
        {
          <button
            type="button"
            disabled={!canRecord}
            onClick={onToggle}
            className="-ml-1 flex h-11 w-11 shrink-0 items-start justify-center pt-[11px]"
            aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
            aria-pressed={done}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border ${done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
              aria-hidden="true"
            >
              {done && <Check className="h-3 w-3" />}
            </span>
          </button>
        }
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onExpand}
            className="flex min-h-11 w-full items-start gap-2 py-2 text-left"
            aria-expanded={expanded}
            aria-controls={panelId}
          >
            <span
              className={`bw-exercise-name min-w-0 flex-1 text-sm font-semibold leading-5 ${
                done ? "text-muted-foreground line-through" : "text-foreground"
              }`}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {view.canonicalName}
            </span>
            <ChevronRight
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground ${expanded ? "rotate-90" : ""}`}
            />
          </button>
          {view.prescription && (
            <div className="mt-1 text-xs font-medium tabular-nums text-foreground/80">
              {view.prescription}
            </div>
          )}
          {view.showSkipSetLabels && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                1 Z DODATKOWYM ODBICIEM
              </span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                2 BEZ DODATKOWEGO ODBICIA
              </span>
            </div>
          )}
          <PersistentExercisePanel open={expanded} id={panelId}>
            {preparation}
            <ExerciseQuickGuide exercise={exercise} autoAnimation />
            {canRecord && !done && equipmentIds.length > 0 && (
              <button
                type="button"
                onClick={onUnavailable}
                className="min-h-11 text-xs font-medium text-primary"
              >
                Nie mam {equipmentNames.join(", ")}
              </button>
            )}
            {rest && <SprintRestTimer label={rest} compact />}
            {canRecord && <ExercisePersonalNote exercise={exercise} />}
            <button
              type="button"
              onClick={() => setDetailSheetOpen(true)}
              className="min-h-11 text-xs font-medium text-primary"
            >
              Pełne szczegóły ćwiczenia
            </button>
          </PersistentExercisePanel>
        </div>
      </div>
      <ExerciseDetailSheet
        exercise={exercise}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />
    </div>
  );
}

export const SprintStructuredSections = memo(function SprintStructuredSections({
  sections,
  date,
  session,
  canRecord = true,
  autoStart = false,
  onFinish,
}: {
  sections: TrainingSection[];
  date: string;
  session: SessionDay;
  canRecord?: boolean;
  autoStart?: boolean;
  onFinish: () => void;
}) {
  const { user } = useAuth();
  const { markEquipmentUnavailable } = useLoadwise();
  const blocks = buildSprintRunnerBlocks(sections);
  const progressKey = `loadwise:sprint-progress:${user?.id ?? "guest"}:${
    session.dbId ?? session.sessionId ?? `${date}:${session.title}:${session.slotLabel ?? "1"}`
  }`;
  const fingerprint = trainingFingerprint(
    sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises)),
  );
  const local = useTrainingLocalState(
    progressKey,
    { done: {}, started: false, currentBlockIdx: 0, fingerprint },
    parseExerciseProgress,
  );
  const progress = progressForPrescription(local.value, fingerprint);
  const done = progress.done;
  const started = progress.started;
  const currentBlockIdx = Math.max(
    0,
    Math.min(Math.max(0, blocks.length - 1), progress.currentBlockIdx),
  );
  const [lastToggle, setLastToggle] = useState<{ id: string; wasDone: boolean } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setActiveId(null);
    setFinished(false);
    setLastToggle(null);
  }, [progressKey, fingerprint]);
  function setStarted(value: boolean) {
    if (!canRecord) return;
    local.setValue((current) => ({
      ...progressForPrescription(current, fingerprint),
      started: value,
      fingerprint,
    }));
  }
  function setCurrentBlockIdx(update: (current: number) => number) {
    if (!canRecord) return;
    local.setValue((current) => ({
      ...progressForPrescription(current, fingerprint),
      currentBlockIdx: update(current.currentBlockIdx),
      fingerprint,
    }));
  }
  function markDone(id: string) {
    if (!canRecord) return;
    setLastToggle({ id, wasDone: Boolean(done[id]) });
    local.setValue((current) => {
      const latest = progressForPrescription(current, fingerprint);
      return { ...latest, done: { ...latest.done, [id]: !latest.done[id] }, fingerprint };
    });
  }

  const mdRelation = session.mdLabel ?? session.mdRelation ?? "—";
  const equipmentPool = equipmentNamesFor(
    Array.from(
      new Set(
        blocks.flatMap((block) =>
          block.exercises.flatMap((item) =>
            specialistEquipmentForExercise(resolveDefinitionForExercise(item.exercise)),
          ),
        ),
      ),
    ),
  );

  const actionLabel = !started
    ? "Rozpocznij blok"
    : currentBlockIdx >= blocks.length - 1
      ? "Zakończ sesję"
      : "Następny blok";
  const currentBlock = blocks[currentBlockIdx];
  const currentBlockCompleted = Boolean(
    currentBlock?.exercises.length && currentBlock.exercises.every((exercise) => done[exercise.id]),
  );
  const actionDisabled = started && !currentBlockCompleted;

  const saveProgress = local.setValue;
  useEffect(() => {
    if (!autoStart || !canRecord || progress.started) return;
    saveProgress((current) => ({
      ...progressForPrescription(current, fingerprint),
      started: true,
      fingerprint,
    }));
  }, [autoStart, canRecord, progress.started, fingerprint, saveProgress]);

  return (
    <div className={`bw-sprint-session ${SPRINT_RUNNER_CONTAINER_CLASS}`}>
      {canRecord && (
        <CompletionUndo
          label={lastToggle ? "Zmieniono oznaczenie ćwiczenia" : null}
          onUndo={() => {
            if (!lastToggle) return;
            local.setValue((current) => {
              const latest = progressForPrescription(current, fingerprint);
              return {
                ...latest,
                done: { ...latest.done, [lastToggle.id]: lastToggle.wasDone },
                fingerprint,
              };
            });
            setLastToggle(null);
          }}
        />
      )}

      <div className="bw-session-exercise-list" key={`${progressKey}:${fingerprint}`}>
        <div className="bw-plan-heading">
          <h2>Plan sesji</h2>
          <span>{blocks.length} etapów</span>
        </div>
        {blocks.map((block, index) => (
          <section
            key={block.key}
            className={`bw-sprint-stage ${index === currentBlockIdx ? "bw-stage-current" : ""}`}
          >
            <div className="bw-stage-header">
              <span className="bw-stage-index">{block.index}</span>
              <h3 className="bw-stage-title">{block.title}</h3>
              <span className="bw-stage-count">
                {block.exercises.filter((item) => done[item.id]).length}/{block.exercises.length}
              </span>
            </div>
            {block.hasDataError && (
              <p role="alert" className="px-3 py-2 text-xs text-destructive">
                Błąd danych sesji: obowiązkowy blok sprintu jest pusty. Wygeneruj sesję ponownie.
              </p>
            )}
            <div
              className={`bw-stage-exercises divide-y divide-border ${block.key === "skip" ? "bw-skip-stage" : ""}`}
            >
              {block.exercises.map((item, itemIndex) => {
                const equipmentIds = specialistEquipmentForExercise(
                  resolveDefinitionForExercise(item.exercise),
                );
                const guided =
                  block.key === "ramp" &&
                  itemIndex === 0 &&
                  block.exercises.some((row) =>
                    /przygotowanie RAMP|dynamiczna rozgrzewka/i.test(row.exercise.name),
                  );
                return (
                  <SprintExerciseRow
                    key={item.id}
                    view={item}
                    done={!!done[item.id]}
                    canRecord={canRecord && index <= currentBlockIdx}
                    expanded={activeId === item.id}
                    onExpand={() => setActiveId(activeId === item.id ? null : item.id)}
                    onToggle={() => markDone(item.id)}
                    onUnavailable={() => {
                      if (canRecord && equipmentIds.length)
                        markEquipmentUnavailable(date, item.exercise, equipmentIds);
                    }}
                    equipmentIds={equipmentIds}
                    isMainSprint={block.key === "main"}
                    preparation={
                      guided ? (
                        <WarmupCoach
                          exercises={block.exercises.map((row) => row.exercise)}
                          kind="sprint"
                          storageKey={`${progressKey}:guided${canRecord ? "" : ":preview"}`}
                          onFinish={(all) => {
                            if (!canRecord || !all) return;
                            local.setValue((current) => {
                              const latest = progressForPrescription(current, fingerprint);
                              return {
                                ...latest,
                                started: true,
                                done: {
                                  ...latest.done,
                                  ...Object.fromEntries(
                                    block.exercises.map((row) => [row.id, true]),
                                  ),
                                },
                                fingerprint,
                              };
                            });
                          }}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <details className="bw-session-tools">
        <summary>
          <Ruler aria-hidden="true" />
          Sprzęt i przygotowanie
        </summary>
        <div className="bw-session-tools-content">
          <CourseSetup
            key={progressKey}
            exercises={sections.flatMap((section) =>
              section.blocks.flatMap((block) => block.exercises),
            )}
          />
          <SessionPreparation equipment={equipmentPool} />
          <p className="text-xs text-muted-foreground">
            Sprzęt: {equipmentPool.length ? equipmentPool.join(", ") : "Masa ciała"} · {mdRelation}
          </p>
          {!local.available && (
            <p className="text-xs text-muted-foreground">
              Postęp pozostaje w otwartym ekranie; zapis na urządzeniu jest niedostępny.
            </p>
          )}
        </div>
      </details>
      {canRecord && (
        <NextExercisePreview
          exercise={
            blocks
              .slice(currentBlockIdx)
              .flatMap((block) => block.exercises)
              .find((item) => !done[item.id])?.exercise
          }
        />
      )}

      {canRecord && !finished && (
        <div className="bw-sprint-action">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (!started) {
                if (currentBlock) setActiveId(currentBlock.exercises[0]?.id ?? null);
                setStarted(true);
                return;
              }
              if (currentBlockIdx < blocks.length - 1) {
                setActiveId(null);
                setCurrentBlockIdx((value) => value + 1);
                return;
              }
              setFinished(true);
              onFinish();
            }}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
          >
            {actionLabel}
          </button>
          {actionDisabled && (
            <div className="mt-1.5 rounded-md bg-card/95 px-3 py-1.5 text-center text-[11px] text-muted-foreground shadow-sm">
              Oznacz wszystkie ćwiczenia bieżącego bloku jako wykonane.
            </div>
          )}
        </div>
      )}
    </div>
  );
});
