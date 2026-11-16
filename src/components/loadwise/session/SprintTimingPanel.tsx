import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { exerciseKey, useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { loadBrowserResults } from "@/features/browser-lab/storage";
import { resultRecordingQuality } from "@/features/browser-lab/timingQuality";
import { timingSource } from "@/lib/loadwise/sessionExecution";
import { TRIAL_REASON_TEXT, bestComparableTrial, compareTrials } from "@/lib/loadwise/sprintTrials";
import { setRange } from "@/lib/loadwise/sessionRunner/presentation";
import "./sprint-tools.css";

/** Local manual stopwatch: transferring a result never writes a training record. */
function SprintStopwatch({
  onUse,
  disabled,
  inline = false,
}: {
  onUse: (seconds: number) => void;
  disabled: boolean;
  inline?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const startedAt = useRef<number | null>(null);
  const elapsedAtStop = useRef(0);
  const panel = useRef<HTMLElement | null>(null);
  const stop = useCallback((hidden = false) => {
    if (startedAt.current === null) return;
    elapsedAtStop.current = Math.max(0, (performance.now() - startedAt.current) / 1000);
    startedAt.current = null;
    setElapsed(elapsedAtStop.current);
    setRunning(false);
    setInterrupted(hidden);
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (startedAt.current !== null)
        setElapsed(Math.max(0, (performance.now() - startedAt.current) / 1000));
    }, 100);
    const hidden = () => {
      if (document.hidden) stop(true);
    };
    document.addEventListener("visibilitychange", hidden);
    // A nested details remains open when an outer tool is collapsed. Stop
    // the hidden measurement without discarding the typed result draft.
    const ancestors: HTMLDetailsElement[] = [];
    let ancestor = panel.current?.parentElement?.closest("details") ?? null;
    while (ancestor) {
      ancestors.push(ancestor);
      ancestor = ancestor.parentElement?.closest("details") ?? null;
    }
    const collapsed = (event: Event) => {
      if (!(event.currentTarget as HTMLDetailsElement).open) stop(true);
    };
    for (const details of ancestors) details.addEventListener("toggle", collapsed);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      for (const details of ancestors) details.removeEventListener("toggle", collapsed);
    };
  }, [running, stop, inline]);
  const controls = (
    <>
      <p>
        Uruchom na sygnał startu i zatrzymaj na mecie. Pomiar ręczny nie zastępuje fotokomórek ani
        analizy filmu.
      </p>
      <output role="timer" aria-label="Stoper sprintu">
        {elapsed.toFixed(2).replace(".", ",")} <small>s</small>
      </output>
      <div className="bw-sprint-stopwatch-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (startedAt.current !== null) stop();
            else {
              elapsedAtStop.current = 0;
              startedAt.current = performance.now();
              setElapsed(0);
              setInterrupted(false);
              setRunning(true);
            }
          }}
        >
          {running ? "Zatrzymaj stoper" : "Start stopera"}
        </button>
        {!running && elapsed > 0 && (
          <button
            type="button"
            disabled={disabled || elapsed > 120 || interrupted}
            onClick={() => onUse(elapsedAtStop.current)}
          >
            Użyj czasu
          </button>
        )}
        {!running && elapsed > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              elapsedAtStop.current = 0;
              setElapsed(0);
              setInterrupted(false);
            }}
          >
            Wyzeruj
          </button>
        )}
      </div>
      {interrupted && (
        <p role="status">
          Pomiar zatrzymano po ukryciu stopera. Powtórz próbę z widocznym stoperem.
        </p>
      )}
    </>
  );
  return inline ? (
    <div
      ref={(node) => {
        panel.current = node;
      }}
      className="bw-sprint-stopwatch"
      data-inline
    >
      <p className="bw-sprint-stopwatch-title">Stoper ręczny</p>
      {controls}
    </div>
  ) : (
    <details
      ref={(node) => {
        panel.current = node;
      }}
      className="bw-sprint-stopwatch"
      onToggle={(event) => {
        if (!event.currentTarget.open) stop(true);
      }}
    >
      <summary>Stoper ręczny</summary>
      {controls}
    </details>
  );
}

interface SprintTimingPanelProps {
  exercise: TrainingExercise;
  sessionId?: string | null;
  onRepeat: () => void;
  /** Occurrence-specific key when the same exercise appears more than once. */
  logKey?: string;
  /** The current runner already owns the one disclosure for the timing tool. */
  inlineStopwatch?: boolean;
}

export function SprintTimingPanel(props: SprintTimingPanelProps) {
  const { user } = useAuth();
  const { exercise, sessionId, logKey } = props;
  const scope = JSON.stringify([
    user?.id,
    sessionId,
    logKey ?? exerciseKey(exercise),
    exercise.id,
    exercise.exerciseId,
    exercise.name,
    exercise.sets,
    exercise.reps,
    exercise.displayPrescription,
    exercise.engineDose?.sets,
    exercise.engineDose?.distanceM,
    exercise.engineDose?.runInM,
  ]);
  return <SprintTimingPanelContent key={scope} {...props} ownerId={user?.id} />;
}

/** Drafts and asynchronous confirmations belong to one account, session and prescription. */
function SprintTimingPanelContent({
  exercise,
  sessionId,
  onRepeat,
  logKey,
  ownerId,
  inlineStopwatch,
}: SprintTimingPanelProps & { ownerId?: string }) {
  const logs = useExerciseSetLogs(sessionId, logKey ?? exerciseKey(exercise));
  const [time, setTime] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<ReturnType<typeof loadBrowserResults>>([]);
  const saving = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const saved = Object.values(logs.current).filter((r) => r.metricKind?.startsWith("sprint_"));
  // The time belongs to a chosen planned repetition. Skipping one never renumbers the others,
  // and saving the same repetition again corrects it instead of adding a duplicate.
  const distance = Number(
    `${exercise.displayPrescription ?? ""} ${exercise.reps ?? ""}`.match(/\b(\d+)\s*m\b/i)?.[1],
  );
  const trialDistance =
    typeof exercise.engineDose?.distanceM === "number"
      ? exercise.engineDose.distanceM
      : Number.isFinite(distance) && distance > 0
        ? distance
        : null;
  const trialStart: "standing" | "flying" =
    exercise.exerciseId === "flying_sprint" || (exercise.engineDose?.runInM ?? 0) > 0
      ? "flying"
      : "standing";
  const planned = Math.min(
    20,
    Math.max(1, Math.round(Number(exercise.engineDose?.sets) || setRange(exercise).max)),
  );
  const [rep, setRep] = useState<number | null>(null);
  const savedReps = new Set(saved.map((r) => r.setNumber));
  const firstFree = Array.from({ length: planned }, (_, i) => i + 1).find((n) => !savedReps.has(n));
  const chosen = rep ?? firstFree ?? planned;
  // Compared only under the same distance, start and measurement method; otherwise say why not.
  const bestNow = saved.reduce<(typeof saved)[number] | null>(
    (best, r) => (!best || (r.metricValue ?? Infinity) < (best.metricValue ?? Infinity) ? r : best),
    null,
  );
  const earlier = Object.values(logs.previous).filter((r) => r.metricKind?.startsWith("sprint_"));
  const comparison = (() => {
    if (!bestNow || earlier.length === 0) return null;
    const { best, skipped } = bestComparableTrial(bestNow, earlier);
    if (best)
      return (
        <p className="bw-session-muted">
          Najlepszy wynik wcześniej (te same warunki): {best.metricValue?.toFixed(3)} s.
        </p>
      );
    const why = compareTrials(bestNow, earlier[0]);
    return (
      <p className="bw-session-muted">
        Poprzednich prób{skipped ? ` (${skipped})` : ""} nie porównujemy:{" "}
        {why.comparable ? "brak danych" : TRIAL_REASON_TEXT[why.reason]}.
      </p>
    );
  })();
  async function save(seconds: number, source: string) {
    if (saving.current) return;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) {
      setError("Wpisz czas odcinka w sekundach.");
      return;
    }
    if (source.startsWith("sprint_video:") && saved.some((r) => r.metricKind === source)) {
      setError("Ta próba z filmu jest już przypisana do powtórzenia.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const ok = await logs.saveSet({
        setNumber: chosen,
        weightKg: null,
        reps: null,
        rir: null,
        metricKind: source,
        metricValue: seconds,
        distanceM: trialDistance,
        startType: trialStart,
        measurementMethod: source.startsWith("sprint_video:")
          ? "video_reviewed"
          : "manual_stopwatch",
      });
      if (!mounted.current) return;
      if (!ok) throw new Error();
      setTime("");
      setRep(null);
      onRepeat();
    } catch {
      if (mounted.current) setError("Nie zapisano czasu. Zachowano wpis do ponowienia.");
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="bw-sprint-result-entry">
      <p className="bw-session-muted">
        Zapisane czasy: {saved.length} z {planned}. Pomiar jest opcjonalny.
      </p>
      {comparison}
      <SprintStopwatch
        inline={inlineStopwatch}
        disabled={busy || logs.loading}
        onUse={(seconds) => setTime(seconds.toFixed(2))}
      />
      <label>
        Powtórzenie
        <select
          aria-label="Powtórzenie sprintu"
          value={chosen}
          onChange={(e) => setRep(Number(e.target.value))}
        >
          {Array.from({ length: planned }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} z {planned}
              {savedReps.has(n) ? " · zapisane (zapis poprawi wynik)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="bw-sprint-time-input">
        <label>
          Czas odcinka
          <input
            aria-label="Czas sprintu w sekundach"
            inputMode="decimal"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <span>s</span>
        <button
          type="button"
          disabled={busy || logs.loading}
          onClick={() => void save(Number(time.replace(",", ".")), "sprint_manual")}
        >
          {busy ? "Zapisuję…" : "Zapisz czas"}
        </button>
      </div>
      <p className="bw-session-muted">
        Wpis ręczny zachowuje źródło pomiaru. GPS nie mierzy tutaj krótkiego sprintu.
      </p>
      {trialDistance === 10 && trialStart === "standing" && ownerId && (
        <details
          onToggle={(e) => {
            if (e.currentTarget.open) {
              try {
                setVideos(
                  loadBrowserResults(ownerId).filter(
                    (r) =>
                      r.testId === "sprint_10m" && resultRecordingQuality(r).status === "reviewed",
                  ),
                );
                setOpen(true);
              } catch {
                setError("Nie można odczytać wyników Lab.");
              }
            }
          }}
        >
          <summary>Wybierz pomiar 10 m z Lab</summary>
          {open && videos.length === 0 && (
            <p className="bw-session-muted">Brak sprawdzonych prób 10 m na tym urządzeniu.</p>
          )}
          {videos.slice(0, 8).map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={busy}
              onClick={() => void save(v.primaryValue, `sprint_video:${v.id}`)}
            >
              {v.primaryValue.toFixed(3)} s · {new Date(v.recordedAt).toLocaleDateString("pl-PL")}
            </button>
          ))}
        </details>
      )}
      {saved.length > 0 && (
        <details>
          <summary>Zapisane powtórzenia</summary>
          <ul>
            {saved.map((r) => (
              <li key={r.setNumber}>
                Powtórzenie {r.setNumber}: {r.metricValue?.toFixed(3)} s ·{" "}
                {timingSource(r.metricKind)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="bw-training-error">
          {error}
        </p>
      )}
    </div>
  );
}
