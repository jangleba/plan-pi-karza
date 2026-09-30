import { memo, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
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
  resolveSprintExerciseDetails,
  SPRINT_RUNNER_CONTAINER_CLASS,
  type SprintExerciseView,
} from "@/lib/loadwise/sprintPresentation";
import { MovementBlueprint } from "../MovementBlueprint";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";

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
  const [expanded, setExpanded] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [restRunning, setRestRunning] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const restSecondsRef = useRef(restSeconds);
  restSecondsRef.current = restSeconds;
  useEffect(() => {
    if (!restRunning || restSecondsRef.current === null) return;
    const timer = window.setInterval(() => {
      setRestSeconds((current) => {
        if (current === null || current <= 1) {
          setRestRunning(false);
          return null;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restRunning]);
  const exercise = view.exercise;
  const rest = restLabel(exercise);
  const details = resolveSprintExerciseDetails(exercise);
  const equipmentNames = equipmentNamesFor(equipmentIds);
  return (
    <div className="py-2">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="-ml-2 flex h-11 w-11 shrink-0 items-start justify-center pt-[11px]"
          aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
          aria-pressed={done}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${done ? "bg-primary" : "bg-border"}`}
            aria-hidden="true"
          />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex min-h-11 w-full items-start gap-2 py-2 text-left"
            aria-expanded={expanded}
          >
            <span
              className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${
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
            <div className="mt-1 flex gap-1.5">
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                1 Z ADD-STEP
              </span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                2 BEZ ADD-STEP
              </span>
            </div>
          )}
          {!done && equipmentIds.length > 0 && (
            <button
              type="button"
              onClick={onUnavailable}
              className="mt-1 text-[11px] font-medium text-primary"
            >
              Nie mam {equipmentNames.join(", ")}
            </button>
          )}
          {rest && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{rest}</span>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-primary"
                onClick={() => {
                  if (restRunning) {
                    setRestRunning(false);
                    return;
                  }
                  const seconds = restSecondsFromLabel(rest);
                  setRestSeconds((current) => current ?? seconds);
                  setRestRunning(true);
                }}
              >
                {restRunning ? "Pauza" : "Start"}
              </button>
              {restRunning && (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-muted-foreground"
                  onClick={() => {
                    setRestRunning(false);
                    setRestSeconds(null);
                  }}
                >
                  Reset
                </button>
              )}
              {restSeconds !== null && (
                <span className="tabular-nums" role="timer" aria-live="polite">
                  {restSeconds} s
                </span>
              )}
            </div>
          )}
          {expanded && (
            <div className="mt-2 space-y-2 border-l border-border pl-3 text-xs">
              {details.purpose && (
                <div>
                  <div className="font-semibold text-muted-foreground">Cel</div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">{details.purpose}</p>
                </div>
              )}
              {details.howTo && (
                <div>
                  <div className="font-semibold text-muted-foreground">Jak wykonać</div>
                  <p className="mt-1 leading-relaxed text-foreground">{details.howTo}</p>
                </div>
              )}
              {details.cues.length > 0 && (
                <div>
                  <div className="font-semibold text-muted-foreground">Wskazówki</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {details.cues.map((cue, i) => (
                      <li key={i}>{cue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {details.errors.length > 0 && (
                <div>
                  <div className="font-semibold text-muted-foreground">Błędy</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {details.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {details.safety && (
                <div>
                  <div className="font-semibold text-muted-foreground">Bezpieczeństwo</div>
                  <p className="mt-1 leading-relaxed text-foreground">{details.safety}</p>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="font-semibold text-muted-foreground">Sprzęt</div>
                  <p className="mt-1 leading-relaxed text-foreground">{details.equipment}</p>
                </div>
                <div>
                  <div className="font-semibold text-muted-foreground">Zamiana bez sprzętu</div>
                  <p className="mt-1 leading-relaxed text-foreground">
                    {details.noEquipmentReplacement}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailSheetOpen(true)}
                className="text-[11px] font-semibold text-primary"
              >
                Otwórz pełne szczegóły ćwiczenia
              </button>
              <MovementBlueprint exercise={exercise} />
            </div>
          )}
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

  return (
    <div className={SPRINT_RUNNER_CONTAINER_CLASS}>
      <div className="rounded-lg border border-border bg-card px-3 py-3">
        <div className="text-xs text-muted-foreground">Cel</div>
        <div className="text-sm font-semibold text-foreground">
          {session.goalOfSession || session.goalLabel}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Czas: {session.durationMin} min</div>
          <div>Intensywność: {session.intensity}</div>
          <div className="col-span-2">
            Sprzęt: {equipmentPool.length ? equipmentPool.join(", ") : "Masa ciała"}
          </div>
          <div className="col-span-2">Relacja MD: {mdRelation}</div>
        </div>
      </div>

      <div className="space-y-2">
        {blocks.map((block, index) => {
          const isCurrent = index === currentBlockIdx;
          const isExpanded = isCurrent || expanded[block.key];
          const exerciseCount = block.exercises.length;
          const completedCount = block.exercises.filter((exercise) => done[exercise.id]).length;
          return (
            <div key={block.key} className="rounded-lg border border-border bg-card px-3 py-2">
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
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="w-7 shrink-0 text-base font-bold text-foreground">
                  {block.index}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {block.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {completedCount}/{exerciseCount}
                </span>
                {!isExpanded && (
                  <span
                    className={`text-[11px] ${block.hasDataError ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    {block.hasDataError
                      ? "Błąd danych sesji"
                      : `${exerciseCount} ćw. · ~${block.estimatedMin} min`}
                  </span>
                )}
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              </button>
              {isExpanded && block.hasDataError && (
                <div className="mt-2 text-xs font-medium text-destructive">
                  Błąd danych sesji: obowiązkowy blok sprintu jest pusty. Wygeneruj sesję ponownie.
                </div>
              )}
              {isExpanded && (
                <div className="mt-2 divide-y divide-border/50">
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
        <div className="sticky bottom-3 z-20">
          <button
            type="button"
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
