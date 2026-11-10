import { useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { exerciseKey, useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { loadBrowserResults } from "@/features/browser-lab/storage";
import { resultRecordingQuality } from "@/features/browser-lab/timingQuality";
import { timingSource } from "@/lib/loadwise/sessionExecution";

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
  const next = () => Math.max(0, ...Object.keys(logs.current).map(Number)) + 1;
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
        setNumber: next(),
        weightKg: null,
        reps: null,
        rir: null,
        metricKind: source,
        metricValue: seconds,
      });
      if (!ok) throw new Error();
      setTime("");
      onRepeat();
    } catch {
      setError("Nie zapisano czasu. Zachowano wpis do ponowienia.");
    } finally {
      setBusy(false);
    }
  }
  const distance = Number(
    `${exercise.displayPrescription ?? ""} ${exercise.reps ?? ""}`.match(/\b(\d+)\s*m\b/i)?.[1],
  );
  return (
    <div className="bw-sprint-result-entry">
      <p className="bw-session-muted">Zapisane czasy: {saved.length}. Pomiar jest opcjonalny.</p>
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
          <ol>
            {saved.map((r) => (
              <li key={r.setNumber}>
                {r.setNumber}. {r.metricValue?.toFixed(3)} s · {timingSource(r.metricKind)}
              </li>
            ))}
          </ol>
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
