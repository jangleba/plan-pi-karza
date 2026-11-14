import { useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import {
  boutAt,
  boutTargets,
  canFinishEarly,
  parseBoutProgress,
  type BoutProgress,
} from "@/lib/loadwise/sessionRunner/boutProgress";
import {
  formatClock,
  parseCountdown,
  startCountdown,
  type Countdown,
} from "@/lib/loadwise/sessionRunner/countdown";
import { formatRange, type Range, type TaskKind } from "@/lib/loadwise/sessionRunner/presentation";
import { WorkCountdown } from "./Countdowns";

/**
 * Sets, repetitions and sides of a task that is confirmed bout by bout
 * (sprints, drills, mobility, prehab, ball tasks). The final confirmation
 * marks the exercise; moving on without it leaves the exercise open.
 */
export function BoutControls({
  scope,
  rowKey,
  kind,
  sets,
  unilateral,
  workSeconds,
  canRecord,
  isLastStep,
  onSetFinished,
  onComplete,
  children,
}: {
  scope: string;
  rowKey: string;
  kind: TaskKind;
  sets: Range;
  unilateral: boolean;
  workSeconds: number | null;
  canRecord: boolean;
  isLastStep: boolean;
  onSetFinished: () => void;
  onComplete: () => Promise<boolean>;
  children?: ReactNode;
}) {
  const { user } = useAuth();
  const progress = useTrainingLocalState<BoutProgress>(
    trainingStorageKey("bouts", user?.id, scope, rowKey),
    { done: 0 },
    parseBoutProgress,
  );
  const work = useTrainingLocalState<Countdown | null>(
    trainingStorageKey("work", user?.id, scope, rowKey),
    null,
    (value) => (value === null ? null : parseCountdown(value)),
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const targets = boutTargets(sets, unilateral);
  const done = Math.min(progress.value.done, targets.max);
  const bout = boutAt(done, unilateral);
  const multi = targets.max > 1;
  const unit = kind === "sprint" ? "Odcinek" : "Seria";
  const lastBout = done + 1 >= targets.max;
  const setEnds = !unilateral || bout.side === "Prawa";

  async function confirm(finishNow = false) {
    if (!canRecord || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const next = done + 1;
      if (finishNow || next >= targets.max) {
        if (!finishNow) progress.setValue({ done: next });
        work.setValue(null);
        const ok = await onComplete();
        if (!ok && !finishNow) progress.setValue({ done });
        return;
      }
      progress.setValue({ done: next });
      work.setValue(null);
      if (setEnds || kind === "sprint") onSetFinished();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const primaryLabel = busy
    ? "Zapisuję…"
    : lastBout
      ? `${unilateral ? `${bout.side} wykonana` : "Wykonane"} · ${isLastStep ? "podsumowanie" : "dalej"}`
      : unilateral
        ? `${bout.side} wykonana`
        : kind === "sprint"
          ? "Odcinek wykonany"
          : "Seria wykonana";

  return (
    <div className="bw-bouts">
      {(multi || unilateral) && (
        <div className="bw-bouts-status" aria-live="polite">
          <strong>
            {unit} {bout.set} z {formatRange(sets)}
          </strong>
          {bout.side && <span className="bw-side-chip">{bout.side}</span>}
        </div>
      )}
      {unilateral && (
        <div className="bw-sides" role="group" aria-label="Strony ciała">
          {(["Lewa", "Prawa"] as const).map((side, index) => {
            const sideDone = done > (bout.set - 1) * 2 + index;
            return (
              <span
                key={side}
                data-done={sideDone || undefined}
                data-current={bout.side === side || undefined}
              >
                {side}
              </span>
            );
          })}
        </div>
      )}
      {sets.max > 1 && (
        <div className="bw-bout-dots" aria-hidden="true">
          {Array.from({ length: sets.max }, (_, i) => (
            <span
              key={i}
              data-done={done >= (i + 1) * (unilateral ? 2 : 1) || undefined}
              data-optional={i >= sets.min || undefined}
            />
          ))}
        </div>
      )}
      {workSeconds !== null && work.value && (
        <WorkCountdown countdown={work.value} onChange={(next) => work.setValue(next)} />
      )}
      {children}
      {canRecord && (
        <div className="bw-bout-actions">
          {workSeconds !== null && !work.value ? (
            <button
              type="button"
              className="bw-runner-primary"
              onClick={() =>
                work.setValue(
                  startCountdown(workSeconds, bout.side ? `${bout.side} strona` : "Praca"),
                )
              }
            >
              Start {formatClock(workSeconds)}
              {bout.side ? ` · ${bout.side.toLocaleLowerCase("pl-PL")}` : ""}
            </button>
          ) : (
            <button
              type="button"
              className="bw-runner-primary"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {primaryLabel}
            </button>
          )}
          <div className="bw-bout-secondary">
            {workSeconds !== null && !work.value && (
              <button type="button" disabled={busy} onClick={() => void confirm()}>
                {lastBout ? "Wykonane bez odliczania" : "Zalicz bez odliczania"}
              </button>
            )}
            {canFinishEarly({ done }, sets, unilateral) && (
              <button type="button" disabled={busy} onClick={() => void confirm(true)}>
                Zakończ po {Math.floor(done / (unilateral ? 2 : 1))}{" "}
                {kind === "sprint" ? "odc." : "ser."}
              </button>
            )}
            {done > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  progress.setValue({ done: done - 1 });
                  work.setValue(null);
                }}
              >
                Cofnij ostatnie
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
