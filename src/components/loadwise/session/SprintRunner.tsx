import { memo, useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { SessionDay, TrainingSection } from "@/lib/loadwise/types";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { specialistEquipmentForExercise } from "@/lib/loadwise/exerciseLibrary";
import {
  equipmentNamesFor,
  resolveDefinitionForExercise,
  restLabel,
  restSecondsFromLabel,
} from "@/lib/loadwise/sessionPresentation";
import {
  buildSprintRunnerBlocks,
  SPRINT_RUNNER_CONTAINER_CLASS,
  type SprintExerciseView,
} from "@/lib/loadwise/sprintPresentation";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";
import { Button } from "@/components/ui/button";

function SprintExerciseRow({
  view,
  done,
  onToggle,
  onUnavailable,
  equipmentIds,
}: {
  view: SprintExerciseView;
  done: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
  equipmentIds: string[];
}) {
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [restRunning, setRestRunning] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const restSecondsRef = useRef(restSeconds);
  restSecondsRef.current = restSeconds;
  useEffect(() => {
    if (!restRunning || restSecondsRef.current === null) return;
    const timer = window.setInterval(
      () =>
        setRestSeconds((current) => {
          if (current === null || current <= 1) {
            setRestRunning(false);
            return null;
          }
          return current - 1;
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [restRunning]);
  const rest = restLabel(view.exercise);
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
          aria-pressed={done}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${done ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
        >
          {done ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-border" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setDetailSheetOpen(true)}
            className="flex min-h-11 w-full items-start gap-3 py-1 text-left"
          >
            <span
              className={`min-w-0 flex-1 text-base font-semibold leading-snug ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {view.canonicalName}
            </span>
            <ChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
          {view.prescription && (
            <p className="mt-1 text-sm font-medium tabular-nums">{view.prescription}</p>
          )}
          {view.showSkipSetLabels && (
            <p className="mt-2 text-sm text-muted-foreground">1 z add-step · 2 bez add-step</p>
          )}
          {!done && equipmentIds.length > 0 && (
            <Button variant="ghost" onClick={onUnavailable}>
              Nie mam {equipmentNamesFor(equipmentIds).join(", ")}
            </Button>
          )}
          {rest && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{rest}</span>
              <Button
                variant="ghost"
                onClick={() => {
                  if (restRunning) {
                    setRestRunning(false);
                    return;
                  }
                  setRestSeconds((current) => current ?? restSecondsFromLabel(rest));
                  setRestRunning(true);
                }}
              >
                {restRunning ? "Pauza" : "Start"}
              </Button>
              {restRunning && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRestRunning(false);
                    setRestSeconds(null);
                  }}
                >
                  Reset
                </Button>
              )}
              {restSeconds !== null && (
                <span className="tabular-nums" role="timer" aria-live="polite">
                  {restSeconds} s
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <ExerciseDetailSheet
        exercise={view.exercise}
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
  onFinish,
}: {
  sections: TrainingSection[];
  date: string;
  session: SessionDay;
  onFinish: () => void;
}) {
  const { user } = useAuth();
  const { markEquipmentUnavailable } = useLoadwise();
  const blocks = buildSprintRunnerBlocks(sections);
  const progressKey = `loadwise:sprint-progress:${user?.id ?? "guest"}:${
    session.dbId ?? session.sessionId ?? `${date}:${session.title}:${session.slotLabel ?? "1"}`
  }`;
  const skipNextPersist = useRef(true);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    skipNextPersist.current = true;
    try {
      const saved = window.localStorage.getItem(progressKey);
      const parsed = saved
        ? (JSON.parse(saved) as {
            done?: Record<string, boolean>;
            started?: boolean;
            currentBlockIdx?: number;
          })
        : null;
      setDone(parsed?.done ?? {});
      setStarted(parsed?.started ?? false);
      setCurrentBlockIdx(Math.max(0, Math.min(blocks.length - 1, parsed?.currentBlockIdx ?? 0)));
    } catch {
      setDone({});
      setStarted(false);
      setCurrentBlockIdx(0);
    }
    setExpanded({});
    setFinished(false);
  }, [blocks.length, progressKey]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    window.localStorage.setItem(progressKey, JSON.stringify({ done, started, currentBlockIdx }));
  }, [currentBlockIdx, done, progressKey, started]);

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

  return (
    <div className={SPRINT_RUNNER_CONTAINER_CLASS}>
      <p className="text-sm text-muted-foreground">
        Sprzęt: {equipmentPool.length ? equipmentPool.join(", ") : "Masa ciała"}
      </p>

      <div className="space-y-2">
        {blocks.map((block, index) => {
          const isCurrent = index === currentBlockIdx;
          const isExpanded = isCurrent || expanded[block.key];
          const exerciseCount = block.exercises.length;
          const completedCount = block.exercises.filter((exercise) => done[exercise.id]).length;
          return (
            <div key={block.key} className="bw-section">
              <button
                type="button"
                onClick={() => {
                  if (!isCurrent) {
                    setExpanded((current) => ({
                      ...current,
                      [block.key]: !isExpanded,
                    }));
                  }
                }}
                className="grid min-h-12 w-full grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] items-center gap-2 py-2 text-left"
                aria-expanded={Boolean(isExpanded)}
              >
                <span className="self-start text-base font-semibold text-foreground">
                  {block.index}
                </span>
                <span className="min-w-0">
                  <span className="bw-section-title block text-foreground">{block.title}</span>
                  {!isExpanded && (
                    <span
                      className={`mt-1 block text-sm ${block.hasDataError ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                    >
                      {block.hasDataError ? "Błąd danych sesji" : `~${block.estimatedMin} min`}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {completedCount}/{exerciseCount}
                </span>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              </button>
              {isExpanded && block.hasDataError && (
                <div className="mt-2 text-sm font-medium text-destructive">
                  Błąd danych sesji: obowiązkowy blok sprintu jest pusty. Wygeneruj sesję ponownie.
                </div>
              )}
              {isExpanded && (
                <div className="mt-4 space-y-3">
                  {block.exercises.map((item) => {
                    const definition = resolveDefinitionForExercise(item.exercise);
                    const equipmentIds = specialistEquipmentForExercise(definition);
                    return (
                      <SprintExerciseRow
                        key={item.id}
                        view={item}
                        done={!!done[item.id]}
                        onToggle={() =>
                          setDone((current) => ({
                            ...current,
                            [item.id]: !current[item.id],
                          }))
                        }
                        onUnavailable={() => {
                          if (equipmentIds.length)
                            markEquipmentUnavailable(date, item.exercise, equipmentIds);
                        }}
                        equipmentIds={equipmentIds}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!finished && (
        <div className="sticky bottom-[var(--app-nav-clearance)] z-20 bg-background py-3">
          <Button
            disabled={actionDisabled}
            onClick={() => {
              if (!started) {
                setStarted(true);
                return;
              }
              if (currentBlockIdx < blocks.length - 1) {
                setCurrentBlockIdx((value) => value + 1);
                return;
              }
              setFinished(true);
              onFinish();
            }}
            className="w-full"
          >
            {actionLabel}
          </Button>
          {actionDisabled && (
            <div className="mt-3 text-sm text-muted-foreground">
              Oznacz wszystkie ćwiczenia bieżącego bloku jako wykonane.
            </div>
          )}
        </div>
      )}
    </div>
  );
});
