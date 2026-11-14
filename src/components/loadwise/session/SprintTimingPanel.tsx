import { useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { exerciseKey, useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { loadBrowserResults } from "@/features/browser-lab/storage";
import { resultRecordingQuality } from "@/features/browser-lab/timingQuality";
import { timingSource } from "@/lib/loadwise/sessionExecution";
import { TRIAL_REASON_TEXT, bestComparableTrial, compareTrials } from "@/lib/loadwise/sprintTrials";

export function SprintTimingPanel({
  exercise,
  sessionId,
  onRepeat,
  logKey,
}: {
  exercise: TrainingExercise;
  sessionId?: string | null;
  onRepeat: () => void;
  /** Occurrence-specific key when the same exercise appears more than once. */
  logKey?: string;
}) {
  const { user } = useAuth(),
    logs = useExerciseSetLogs(sessionId, logKey ?? exerciseKey(exercise));
  const [time, setTime] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<ReturnType<typeof loadBrowserResults>>([]);
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
    (exercise.engineDose?.runInM ?? 0) > 0 ? "flying" : "standing";
  const planned = Math.min(
    20,
    Math.max(1, Math.round(Number(exercise.engineDose?.sets ?? exercise.sets) || 1)),
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
    if (busy || !Number.isFinite(seconds) || seconds <= 0 || seconds > 120) {
      setError("Wpisz czas odcinka w sekundach.");
      return;
    }
    if (source.startsWith("sprint_video:") && saved.some((r) => r.metricKind === source)) {
      setError("Ta próba z filmu jest już przypisana do powtórzenia.");
      return;
    }
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
      if (!ok) throw new Error();
      setTime("");
      setRep(null);
      onRepeat();
    } catch {
      setError("Nie zapisano czasu. Zachowano wpis do ponowienia.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bw-sprint-result-entry">
      <p className="bw-session-muted">
        Zapisane czasy: {saved.length} z {planned}. Pomiar jest opcjonalny.
      </p>
      {comparison}
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
      {distance === 10 && user && (
        <details
          onToggle={(e) => {
            if (e.currentTarget.open) {
              try {
                setVideos(
                  loadBrowserResults(user.id).filter(
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
