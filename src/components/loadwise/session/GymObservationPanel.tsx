import { useState } from "react";
import { useGymEvidence } from "@/lib/loadwise/useGymEvidence";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { GYM_EXERCISE_RULES } from "@/lib/loadwise/gymStrengthExercises";
import type { GymObservation, GymSetObservation } from "@/lib/loadwise/engineV2/gymProgression";
import { parseTrainingNumber } from "@/lib/loadwise/trainingDetails";

export function GymObservationPanel({
  exercise,
  sessionId,
  canRecord = true,
}: {
  exercise: TrainingExercise;
  sessionId?: string | null;
  canRecord?: boolean;
}) {
  const evidence = useGymEvidence();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState(""),
    [method, setMethod] = useState<"" | "device" | "video_reviewed">("");
  const id = exercise.exerciseId,
    d = exercise.engineDose;
  const supportsMetric =
    !!id && ["gym_cmj", "gym_cmj_assisted", "gym_cmj_resisted", "gym_fast_band_curl"].includes(id);
  if (!id || !GYM_EXERCISE_RULES[id] || !d || !sessionId || !canRecord || !evidence.available)
    return null;
  const saved = evidence.records.find((r) => r.record_key === `observation:${sessionId}:${id}`);
  async function save(choice: "stable" | "lost" | "unknown") {
    if (!id || !sessionId || !d) return;
    const sets: GymSetObservation[] =
      choice === "stable"
        ? Array.from({ length: d.sets }, (_, i) =>
            (d.perSide ? (["left", "right"] as const) : (["both"] as const)).map((side) => ({
              setNumber: i + 1,
              side,
              completed: d.seconds ?? d.reps ?? 0,
              control: "stable" as const,
            })),
          ).flat()
        : [];
    const value = supportsMetric ? parseTrainingNumber(metric) : null;
    if (
      choice === "stable" &&
      supportsMetric &&
      metric.trim() &&
      (value === null || value <= 0 || !method)
    ) {
      setError("Podaj dodatni wynik oraz rzeczywistą metodę pomiaru.");
      return;
    }
    const observation: GymObservation = {
      sessionId,
      exerciseId: id,
      source: "athlete_observed",
      sets,
      ...(choice === "lost" ? { controlLossReported: true as const } : {}),
      ...(choice === "stable" && value !== null && method
        ? {
            minimumMetric: {
              kind:
                id === "gym_fast_band_curl"
                  ? ("cycles_per_second" as const)
                  : ("jump_height_cm" as const),
              method,
              value,
            },
          }
        : {}),
    };
    setBusy(true);
    setError(null);
    try {
      await evidence.save({
        kind: "observation",
        version: 1,
        sessionId,
        exerciseId: id,
        observation,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie zapisano obserwacji.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="my-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2">
        {saved ? "Jakość zapisana · popraw" : "Zapis jakości skoków / gum"}
      </summary>
      <p className="mb-2 text-xs text-muted-foreground">
        Potwierdź wyłącznie to, co faktycznie wykonano, także po obu stronach. To Twoja obserwacja,
        nie automatyczna ocena techniki.
      </p>
      <fieldset disabled={busy} className="space-y-2">
        {supportsMetric && (
          <details>
            <summary>Opcjonalny rzeczywisty pomiar</summary>
            <label className="block">
              Najniższy wynik ze wszystkich serii i stron (
              {id === "gym_fast_band_curl" ? "pełne cykle/s" : "wysokość skoku w cm"})
              <input
                className="block w-full rounded-lg border p-2"
                inputMode="decimal"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              />
            </label>
            <label className="block">
              Metoda
              <select
                className="block w-full rounded-lg border p-2"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                <option value="">Wybierz faktyczną metodę</option>
                <option value="device">Urządzenie pomiarowe</option>
                <option value="video_reviewed">Analiza nagrania</option>
              </select>
            </label>
          </details>
        )}
        <button type="button" className="block min-h-11" onClick={() => void save("stable")}>
          Cała zaplanowana dawka, pod kontrolą
        </button>
        <button type="button" className="block min-h-11" onClick={() => void save("lost")}>
          Utrata kontroli / przerwano z tego powodu
        </button>
        <button type="button" className="block min-h-11" onClick={() => void save("unknown")}>
          Nie potrafię ocenić jakości
        </button>
      </fieldset>
      {saved?.pending && <p role="status">Zapisano na telefonie; czeka na synchronizację.</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
