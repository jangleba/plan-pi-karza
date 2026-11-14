import { useRef, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingFingerprint, trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { plannedSets } from "@/lib/loadwise/setLogs";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { restSecondsAfter, type SessionKind } from "@/lib/loadwise/sessionRunner/presentation";
import type { RunnerRow, RunnerStep } from "@/lib/loadwise/sessionRunner/steps";
import { RunnerCard } from "./RunnerCard";

const parse = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : undefined;

/** One set of A1, one set of A2, then the next round. Cards cannot finish all A1 sets first. */
export function ContrastRounds({
  step,
  scope,
  sessionId,
  date,
  sessionKind,
  mark,
  onRest,
  onNext,
}: {
  step: RunnerStep;
  scope: string;
  sessionId?: string | null;
  date: string;
  sessionKind: SessionKind;
  mark: (row: RunnerRow) => Promise<boolean>;
  onRest: (seconds: number | null, label: string, final: boolean) => void;
  onNext: () => void;
}) {
  const { user } = useAuth();
  const rounds = Math.min(...step.rows.map((r) => plannedSets(r.exercise)));
  const total = rounds * step.rows.length;
  const cursor = useTrainingLocalState(
    trainingStorageKey(
      "contrast-round",
      user?.id,
      scope,
      `${step.key}:${trainingFingerprint(step.rows.map((r) => r.exercise))}`,
    ),
    0,
    parse,
  );
  const index = Math.min(cursor.value, Math.max(0, total - 1));
  const round = Math.floor(index / step.rows.length) + 1;
  const position = index % step.rows.length;
  const row = step.rows[position];
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function complete() {
    if (lock.current) return false;
    lock.current = true;
    setError(null);
    try {
      if (round === rounds && !(await mark(row))) return false;
      const next = index + 1;
      cursor.setValue(next);
      const partner = position < step.rows.length - 1;
      const nextRow = step.rows[next % step.rows.length];
      onRest(
        restSecondsAfter(row.block, row.exercise, true, partner, next >= total),
        next < total
          ? `Następnie: ${canonicalExerciseName(nextRow.exercise)} · runda ${Math.floor(next / step.rows.length) + 1}`
          : "Koniec bloku siły i mocy",
        next >= total,
      );
      if (next >= total) onNext();
      return true;
    } catch {
      setError("Nie zapisano zakończenia serii. Ponów zapis.");
      return false;
    } finally {
      lock.current = false;
    }
  }
  return (
    <section className="bw-runner-linked" aria-label="Kontrast prowadzony rundami">
      <p className="bw-runner-position">
        Runda {round} z {rounds} · {row.exercise.label ?? `ćwiczenie ${position + 1}`}
      </p>
      {error && <p role="alert">{error}</p>}
      <RunnerCard
        key={`${row.key}:${round}`}
        row={row}
        step={step}
        linked
        status="open"
        sessionKind={sessionKind}
        sessionId={sessionId}
        date={date}
        scope={scope}
        isLastStep={false}
        roundSet={round}
        onRoundComplete={complete}
        onSetDone={() => {}}
        onComplete={complete}
        onUndo={() => {}}
        onUnskip={() => {}}
      />
    </section>
  );
}
