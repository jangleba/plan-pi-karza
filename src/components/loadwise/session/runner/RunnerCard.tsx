import { useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { linkedLabel } from "@/lib/loadwise/blockMethod";
import { plannedSets } from "@/lib/loadwise/setLogs";
import {
  occurrenceLogKey,
  type RunnerRow,
  type RunnerStep,
} from "@/lib/loadwise/sessionRunner/steps";
import {
  doseLine,
  effortLine,
  formatRange,
  isUnilateral,
  keyCue,
  pairedNext,
  restSecondsAfter,
  setRange,
  singleRest,
  sprintDistance,
  taskKind,
  variantLabel,
  workSeconds,
  type SessionKind,
  type TaskKind,
} from "@/lib/loadwise/sessionRunner/presentation";
import { ExerciseRunnerScreen } from "../../ExerciseRunnerScreen";
import { SprintTimingPanel } from "../SprintTimingPanel";
import { SetTable } from "./SetTable";
import { BoutControls } from "./BoutControls";

export type RowStatus = "done" | "skipped" | "open";

export interface Fact {
  label: string;
  value: string;
}

/** The few numbers that matter for this kind of task, each shown once. */
export function rowFacts(row: RunnerRow, kind: TaskKind, linked: boolean): Fact[] {
  const { exercise } = row;
  const facts: Fact[] = [];
  const effort = effortLine(exercise, kind);
  const rest = linked ? null : singleRest(exercise);
  if (kind === "sprint") {
    const distance = sprintDistance(exercise);
    if (distance) facts.push({ label: "Dystans", value: distance });
    facts.push({ label: "Odcinki", value: formatRange(setRange(exercise)) });
    const variant = variantLabel(exercise);
    if (variant) facts.push({ label: "Wariant", value: variant.replace(/^Rytm:\s*/, "") });
  }
  if (effort) {
    const [label, ...value] = effort.split(/:\s*|\s(?=\d)/);
    facts.push(
      effort.startsWith("Zapas")
        ? { label: "Zapas", value: effort.replace(/^Zapas\s*/, "") }
        : { label: label || "Jakość", value: value.join(" ") || effort },
    );
  }
  if (isUnilateral(exercise)) facts.push({ label: "Strony", value: "Lewa i prawa" });
  if (exercise.tempo?.trim()) facts.push({ label: "Tempo", value: exercise.tempo.trim() });
  if (rest) facts.push({ label: "Odpoczynek", value: rest.replace(/^Przerwa\s*/, "") });
  if(exercise.engineDose?.postRestSeconds) facts.push({label:"Po bloku",value:`${exercise.engineDose.postRestSeconds/60} min odpoczynku`});
  return facts;
}

function tableKindFor(kind: TaskKind, row: RunnerRow, sessionKind: SessionKind) {
  const { exercise, section } = row;
  if (!["main", "accessory", "footballTransfer"].includes(section.type)) return null;
  if (plannedSets(exercise) < 1) return null;
  if (exercise.methodExecution || exercise.exerciseId === "flywheel_squat")
    return "legacy" as const;
  if (kind === "load" || kind === "bodyweight") return kind;
  if (kind === "hold" && sessionKind === "strength") return "hold" as const;
  return null;
}

/** What to do, without entry fields: the plan view of one exercise. */
export function RowPlan({
  row,
  linked,
  sessionKind,
}: {
  row: RunnerRow;
  linked: boolean;
  sessionKind: SessionKind;
}) {
  const kind = taskKind(row.exercise, row.section, sessionKind);
  const facts = rowFacts(row, kind, linked);
  const cue = keyCue(row.exercise);
  return (
    <>
      {facts.length > 0 && (
        <dl className="bw-runner-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {cue && <p className="bw-runner-cue">{cue}</p>}
      {linked && <p className="bw-runner-muted">{pairedNext(row.block, row.exercise)}</p>}
    </>
  );
}

export function RunnerCard({
  row,
  step,
  linked = false,
  bare = false,
  status,
  sessionKind,
  sessionId,
  date,
  scope,
  isLastStep,
  onSetDone,
  onComplete,
  onUndo,
  onUnskip,
}: {
  row: RunnerRow;
  step: RunnerStep;
  linked?: boolean;
  /** The exercise view already shows the section, name and dose above its tabs. */
  bare?: boolean;
  status: RowStatus;
  sessionKind: SessionKind;
  sessionId?: string | null;
  date: string;
  scope: string;
  isLastStep: boolean;
  /** A set or bout is saved; `next` names the following set when it is known. */
  onSetDone: (next?: { label: string; detail?: string }) => void;
  onComplete: () => Promise<boolean>;
  onUndo: () => void;
  onUnskip: () => void;
}) {
  const { exercise, block, section } = row;
  const kind = taskKind(exercise, section, sessionKind);
  const label = linkedLabel(block, exercise);
  const facts = rowFacts(row, kind, linked);
  const cue = keyCue(exercise);
  const table = tableKindFor(kind, row, sessionKind);
  const sets = setRange(exercise);
  const logKey = occurrenceLogKey(row);
  const blocked = exercise.executionBlockedReason;
  const [finishing, setFinishing] = useState(false);
  const lock = useRef(false);
  const restAfterSave = (restSecondsAfter(block, exercise, linked, false) ?? 0) > 0;
  const showsTable = table !== null && table !== "legacy" && status === "open" && !blocked;
  const mainSprint =
    kind === "sprint" &&
    section.type === "main" &&
    /sprint|start|przyspiesz|akcelera|bieg lotny/i.test(exercise.name);

  async function finish() {
    if (lock.current) return;
    lock.current = true;
    setFinishing(true);
    try {
      await onComplete();
    } finally {
      lock.current = false;
      setFinishing(false);
    }
  }

  return (
    <article
      className={`bw-runner-card${linked ? " bw-runner-tile" : ""}`}
      data-status={status}
      data-kind={kind}
    >
      {!linked && !bare && !showsTable && (
        <div className="bw-runner-eyebrow">{sectionTitle(step)}</div>
      )}
      {!bare && !showsTable && (
        <>
          <h2>
            {label && <span className="bw-runner-label">{label}</span>}
            <span className="bw-runner-name">{canonicalExerciseName(exercise)}</span>
            {status === "done" && <Check className="bw-runner-done-icon" aria-label="Wykonane" />}
          </h2>
          <p className="bw-runner-dose">{doseLine(exercise)}</p>
        </>
      )}
      {!showsTable && facts.length > 0 && (
        <dl className="bw-runner-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!showsTable && cue && <p className="bw-runner-cue">{cue}</p>}
      {!showsTable && linked && <p className="bw-runner-muted">{pairedNext(block, exercise)}</p>}
      {blocked && (
        <p role="status" className="bw-runner-error">
          {blocked}
        </p>
      )}

      {status === "done" ? (
        <div className="bw-runner-state">
          <span>
            <Check aria-hidden="true" /> Wykonane
          </span>
          <button type="button" onClick={onUndo}>
            <RotateCcw aria-hidden="true" /> Cofnij oznaczenie
          </button>
        </div>
      ) : status === "skipped" ? (
        <div className="bw-runner-state" data-skipped="">
          <span>Pominięte</span>
          <button type="button" onClick={onUnskip}>
            Wróć do ćwiczenia
          </button>
        </div>
      ) : blocked ? null : table === "legacy" ? (
        <ExerciseRunnerScreen
          exercise={exercise}
          sessionId={sessionId}
          date={date}
          open
          inline
          showVisuals={false}
          manageRest={false}
          onClose={() => {}}
          onSetSaved={(_, finished) => {
            if (finished) void finish();
            else onSetDone();
          }}
        />
      ) : table ? (
        <>
          <SetTable
            exercise={exercise}
            sessionId={sessionId}
            date={date}
            logKey={logKey}
            kind={table}
            sets={sets}
            withRir={Boolean(effortLine(exercise, kind)?.startsWith("Zapas"))}
            unilateral={isUnilateral(exercise)}
            canRecord
            onSetSaved={(_, savedCount, isNew, next) => {
              if (!isNew) return;
              if (savedCount >= sets.max) void finish();
              else onSetDone(next);
            }}
            finishing={finishing}
            onFinish={() => void finish()}
            restNote={restAfterSave}
            docked={!linked}
            title={
              <>
                {label && <span className="bw-runner-label">{label}</span>}
                <span className="bw-runner-name">{canonicalExerciseName(exercise)}</span>
              </>
            }
            facts={
              <>
                {(facts.length > 0 || doseLine(exercise)) && (
                  <p className="bw-set-facts">
                    {doseLine(exercise) && (
                      <span>
                        Plan <strong className="bw-runner-dose">{doseLine(exercise)}</strong>
                      </span>
                    )}
                    {facts.map((fact) => (
                      <span key={fact.label}>
                        {fact.label === "Odpoczynek" ? "Przerwa" : fact.label}{" "}
                        <strong>{fact.value}</strong>
                      </span>
                    ))}
                  </p>
                )}
                {cue && <p className="bw-set-cue">{cue}</p>}
                {linked && <p className="bw-runner-muted">{pairedNext(block, exercise)}</p>}
              </>
            }
          />
        </>
      ) : (
        <BoutControls
          scope={scope}
          rowKey={row.key}
          kind={kind}
          sets={kind === "sprint" || plannedSets(exercise) > 0 ? sets : { min: 1, max: 1 }}
          unilateral={isUnilateral(exercise) && kind !== "sprint"}
          workSeconds={workSeconds(exercise)}
          canRecord
          isLastStep={isLastStep}
          onSetFinished={() => onSetDone()}
          onComplete={onComplete}
        >
          {mainSprint && (
            <section className="bw-runner-optional" aria-label="Czas odcinka">
              <h3>Czas odcinka (opcjonalnie)</h3>
              <SprintTimingPanel
                exercise={exercise}
                sessionId={sessionId}
                logKey={logKey}
                onRepeat={() => undefined}
              />
            </section>
          )}
        </BoutControls>
      )}
    </article>
  );
}

function sectionTitle(step: RunnerStep): string {
  const labels: Record<string, string> = {
    warmup: "Rozgrzewka",
    prep: "Przygotowanie",
    main: "Część główna",
    accessory: "Uzupełnienie",
    footballTransfer: "Z piłką",
    cooldown: "Zakończenie",
  };
  return labels[step.section.type] ?? step.section.title;
}
