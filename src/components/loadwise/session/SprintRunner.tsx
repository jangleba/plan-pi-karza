import { memo, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
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
  resolveSprintExerciseDetails,
  SPRINT_RUNNER_CONTAINER_CLASS,
  type SprintExerciseView,
} from "@/lib/loadwise/sprintPresentation";
import { MovementBlueprint } from "../MovementBlueprint";
import { ExerciseDetailSheet } from "../ExerciseDetailSheet";
import { CourseSetup } from "./CourseSetup";
import { ExerciseQuickGuide } from "./ExerciseQuickGuide";
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
}: {
  view: SprintExerciseView;
  done: boolean;
  onToggle: () => void;
  onUnavailable: () => void;
  equipmentIds: string[];
  isMainSprint: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const exercise = view.exercise;
  const rest = restLabel(exercise);
  const details = resolveSprintExerciseDetails(exercise);
  const equipmentNames = equipmentNamesFor(equipmentIds);
  return (
    <div className={`bw-sprint-row ${isMainSprint ? "bw-sprint-row-main" : ""}`}>
      <div className="flex items-start gap-2.5">
        {!isMainSprint && (
          <button
            type="button"
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
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex min-h-11 w-full items-start gap-2 py-2 text-left"
            aria-expanded={expanded}
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
          {!done && <ExerciseQuickGuide exercise={exercise} />}
          {!done && view.showSkipSetLabels && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Seria 1: dodatkowe odbicie na tej samej nodze podporowej, potem zmiana nóg. Seria 2:
              płynna wymiana nóg bez dodatkowego odbicia.
            </p>
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
          {rest && <SprintRestTimer label={rest} compact={!isMainSprint} />}
          <ExercisePersonalNote exercise={exercise} />
          {isMainSprint && (
            <button
              type="button"
              onClick={onToggle}
              className="bw-sprint-complete"
              aria-label={done ? "Wykonane" : "Oznacz jako wykonane"}
              aria-pressed={done}
            >
              {done && <Check className="h-4 w-4" aria-hidden="true" />}
              {done ? "Wykonane" : "Oznacz jako wykonane"}
            </button>
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setExpanded({});
    setFinished(false);
    setLastToggle(null);
  }, [progressKey, fingerprint]);
  function setStarted(value: boolean) {
    local.setValue((current) => ({
      ...progressForPrescription(current, fingerprint),
      started: value,
      fingerprint,
    }));
  }
  function setCurrentBlockIdx(update: (current: number) => number) {
    local.setValue((current) => ({
      ...progressForPrescription(current, fingerprint),
      currentBlockIdx: update(current.currentBlockIdx),
      fingerprint,
    }));
  }
  function markDone(id: string) {
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

  return (
    <div className={`bw-sprint-session ${SPRINT_RUNNER_CONTAINER_CLASS}`}>
      <div className="bw-sprint-goal">
        <div className="bw-sprint-goal-label">Cel</div>
        <div className="bw-sprint-goal-title">{session.goalOfSession || session.goalLabel}</div>
        <div className="bw-sprint-goal-meta">
          {session.durationMin} min · {session.intensity} intensywność
        </div>
        <details className="bw-sprint-session-info">
          <summary>Sprzęt i relacja do meczu</summary>
          <p>Sprzęt: {equipmentPool.length ? equipmentPool.join(", ") : "Masa ciała"}</p>
          <p>Relacja MD: {mdRelation}</p>
        </details>
      </div>

      <CourseSetup
        key={progressKey}
        exercises={sections.flatMap((section) =>
          section.blocks.flatMap((block) => block.exercises),
        )}
      />
      <SessionPreparation equipment={equipmentPool} />
      <div className="mt-2 text-xs text-muted-foreground" role="status">
        {local.available
          ? "Oznaczenia ćwiczeń zachowane na urządzeniu."
          : "Zapis na urządzeniu niedostępny — postęp pozostaje w otwartym ekranie."}
      </div>
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

      <div className="space-y-2">
        <div className="px-1 text-xs text-muted-foreground">
          Pełny trening · etap {currentBlockIdx + 1} z {blocks.length}
        </div>
        {blocks.map((block, index) => {
          const isCurrent = index === currentBlockIdx;
          const isExpanded = expanded[block.key] ?? isCurrent;
          const exerciseCount = block.exercises.length;
          const completedCount = block.exercises.filter((exercise) => done[exercise.id]).length;
          return (
            <div
              key={block.key}
              className={`bw-sprint-stage ${isCurrent ? "bw-stage-current" : ""}`}
            >
              <button
                type="button"
                onClick={() => {
                  setExpanded((current) => ({
                    ...current,
                    [block.key]: !isExpanded,
                  }));
                }}
                className="bw-stage-header"
                aria-expanded={Boolean(isExpanded)}
              >
                <span className="bw-stage-index">{block.index}</span>
                <span className="bw-stage-title">{block.title}</span>
                <span className="bw-stage-count">
                  {completedCount}/{exerciseCount}
                </span>
                {!isExpanded && block.hasDataError && (
                  <span
                    className={`text-[11px] ${block.hasDataError ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    Błąd danych sesji
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {isExpanded && block.hasDataError && (
                <div className="px-3 py-2 text-xs font-medium text-destructive">
                  Błąd danych sesji: obowiązkowy blok sprintu jest pusty. Wygeneruj sesję ponownie.
                </div>
              )}
              {isExpanded && (
                <div className="bw-stage-exercises divide-y divide-border/50">
                  {block.exercises.map((item) => {
                    const definition = resolveDefinitionForExercise(item.exercise);
                    const equipmentIds = specialistEquipmentForExercise(definition);
                    return (
                      <SprintExerciseRow
                        key={item.id}
                        view={item}
                        done={!!done[item.id]}
                        onToggle={() => markDone(item.id)}
                        onUnavailable={() => {
                          if (equipmentIds.length)
                            markEquipmentUnavailable(date, item.exercise, equipmentIds);
                        }}
                        equipmentIds={equipmentIds}
                        isMainSprint={block.key === "main"}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <NextExercisePreview
        exercise={
          blocks
            .slice(currentBlockIdx)
            .flatMap((block) => block.exercises)
            .find((item) => !done[item.id])?.exercise
        }
      />

      {!finished && (
        <div className="bw-sprint-action">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (!started) {
                if (currentBlock) setExpanded({ [currentBlock.key]: true });
                setStarted(true);
                return;
              }
              if (currentBlockIdx < blocks.length - 1) {
                setExpanded({});
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
