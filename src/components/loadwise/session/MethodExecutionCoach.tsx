import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import type { MethodExecution } from "@/lib/loadwise/methods/types";
import {
  advanceMethodClock,
  completeManualMethodWork,
  initialMethodClock,
  pauseMethodClock,
  resumeMethodClock,
  startMethodClock,
  velocityLoss,
} from "@/lib/loadwise/methods/clock";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { parseTrainingNumber, trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useAuth } from "@/lib/loadwise/auth";
import "./training-methods.css";
const parseMeasurements = (raw: unknown) =>
  Array.isArray(raw) &&
  raw.length <= 40 &&
  raw.every((x) => typeof x === "number" && x >= 0.05 && x <= 4)
    ? (raw as number[])
    : undefined;
export function VelocityCoach({ plan, context }: { plan: MethodExecution; context: string }) {
  const { user } = useAuth(),
    [entry, setEntry] = useState(""),
    [limit, setLimit] = useState(plan.velocityLossLimitPct ?? 15),
    [error, setError] = useState<string | null>(null);
  const draft = useTrainingLocalState(
    trainingStorageKey("velocity", user?.id, context),
    [] as number[],
    parseMeasurements,
  );
  const result = velocityLoss(draft.value, limit);
  return (
    <div className="bw-method-clock" data-testid="velocity-coach">
      <strong>Pomiary z urządzenia</strong>
      <p>
        Wpisuj tę samą metrykę prędkości koncentrycznej z urządzenia sprawdzonego dla tego
        ćwiczenia. Telefon jej nie mierzy.
      </p>
      <label>
        Próg ustalony z trenerem (%)
        <input
          type="number"
          min="5"
          max="50"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseTrainingNumber(entry);
          const check = velocityLoss(n === null ? [NaN] : [n], limit);
          if (check.error) {
            setError(check.error);
            return;
          }
          if (draft.value.length >= 40) {
            setError("Rozpocznij nową serię pomiarów.");
            return;
          }
          draft.setValue([...draft.value, n!]);
          setEntry("");
          setError(null);
        }}
      >
        <label>
          Prędkość powtórzenia (m/s)
          <input
            inputMode="decimal"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            required
          />
        </label>
        <button type="submit">Dodaj pomiar</button>
      </form>
      {draft.value.length > 0 && (
        <p>{draft.value.map((n) => n.toLocaleString("pl-PL")).join(" · ")} m/s</p>
      )}
      <p role="status">
        {result.error ??
          (result.lossPct === null
            ? "Co najmniej dwa ważne pomiary w jednej serii."
            : `Spadek względem najszybszego powtórzenia: ${result.lossPct.toFixed(1)}%. ${result.stop ? "Osiągnięto ustawiony próg — zakończ serię i oceń wykonanie z trenerem." : "Próg nie został osiągnięty. Nadal oceniaj technikę i zapas."}`)}
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => draft.clear()}>
        Nowa seria pomiarów
      </button>
      <small>
        Pomiary są notatką na tym urządzeniu. Zapis wykonanej serii wymaga osobnego potwierdzenia.
      </small>
      {!draft.available && <small>Przeglądarka nie udostępnia trwałego zapisu tej notatki.</small>}
    </div>
  );
}
export function MethodExecutionCoach({
  plan,
  context,
  enabled = true,
}: {
  plan: MethodExecution;
  context: string;
  enabled?: boolean;
}) {
  const [clock, setClock] = useState(initialMethodClock),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (clock.phase === "idle" || clock.phase === "done" || clock.paused) return;
    const id = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      setClock((s) => advanceMethodClock(plan, s, at));
    }, 200);
    return () => window.clearInterval(id);
  }, [plan, clock.phase, clock.paused]);
  useEffect(() => {
    if (!enabled) setClock((s) => pauseMethodClock(plan, s, Date.now()));
  }, [enabled, plan]);
  if (plan.mode === "velocity")
    return enabled ? (
      <VelocityCoach plan={plan} context={context} />
    ) : (
      <div className="bw-method-clock" data-testid="velocity-preview">
        <strong>Pomiary z urządzenia</strong>
        <p>
          Wpisuj tę samą metrykę prędkości koncentrycznej z urządzenia sprawdzonego dla tego
          ćwiczenia. Telefon jej nie mierzy.
        </p>
        <p>{plan.focus}</p>
        <small>Pomiary możesz wpisać po rozpoczęciu treningu i otwarciu zapisu serii.</small>
      </div>
    );
  if (plan.mode === "none") return null;
  const manual = clock.phase === "work" && clock.deadline === null,
    remaining = clock.paused ? clock.remainingMs : Math.max(0, (clock.deadline ?? now) - now),
    seconds = Math.ceil(remaining / 1000);
  return (
    <div className="bw-method-clock" data-testid="method-clock">
      <div className="bw-method-clock-head">
        <Timer size={17} />
        <strong>{plan.mode === "cluster" ? "Zegar klastra" : "Zegar zadania"}</strong>
        <span>
          {clock.phase === "done" ? "Koniec programu" : `Blok ${clock.round + 1}/${plan.rounds}`}
        </span>
      </div>
      <p>{plan.focus}</p>
      <div className="bw-method-clock-readout" role="timer">
        {clock.phase === "idle"
          ? "Gotowy"
          : clock.phase === "done"
            ? "Zakończono"
            : clock.paused
              ? "Pauza"
              : manual
                ? plan.mode === "cluster"
                  ? `${plan.repGroups?.[clock.group] ?? plan.workReps ?? 1} powt.`
                  : `${plan.distanceM ?? ""} m`
                : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
      </div>
      <p>
        {clock.phase === "rest"
          ? "Odpoczynek przed kolejnym zadaniem"
          : clock.phase === "work"
            ? plan.mode === "cluster"
              ? `Grupa ${clock.group + 1}/${plan.repGroups?.length ?? 1}`
              : `Próba ${clock.repetition + 1}/${plan.repetitions}`
            : plan.intensityLabel}
      </p>
      {(plan.runInM || plan.runOutM) && (
        <small>
          {plan.runInM ? `Rozbieg ${plan.runInM} m. ` : ""}
          {plan.runOutM ? `Wolna droga wyhamowania ${plan.runOutM} m.` : ""}
        </small>
      )}
      <div className="bw-method-clock-actions">
        {clock.phase === "idle" || clock.phase === "done" ? (
          <button
            type="button"
            disabled={!enabled}
            onClick={() => {
              const at = Date.now();
              setNow(at);
              setClock(startMethodClock(plan, at));
            }}
          >
            <Play size={16} />
            Uruchom zegar
          </button>
        ) : (
          <button
            type="button"
            disabled={!enabled}
            onClick={() =>
              setClock((s) =>
                s.paused
                  ? resumeMethodClock(plan, s, Date.now())
                  : pauseMethodClock(plan, s, Date.now()),
              )
            }
          >
            {clock.paused ? <Play size={16} /> : <Pause size={16} />}{" "}
            {clock.paused ? "Wznów" : "Pauza"}
          </button>
        )}
        {manual && !clock.paused && (
          <button
            type="button"
            disabled={!enabled}
            onClick={() => {
              const at = Date.now();
              setNow(at);
              setClock((s) => completeManualMethodWork(plan, s, at));
            }}
          >
            {plan.mode === "cluster" ? "Grupa wykonana" : "Próba wykonana"}
          </button>
        )}
        {clock.phase !== "idle" && (
          <button
            type="button"
            aria-label="Wyzeruj zegar"
            onClick={() => setClock(initialMethodClock())}
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>
      <details>
        <summary>Jakość i pomiar</summary>
        <p>{plan.stopRule}</p>
        <p>
          Zegar prowadzi plan pracy i odpoczynku. Nie potwierdza wykonania, techniki, kierunku ani
          czasu reakcji i nie zapisuje wyniku treningu. Praca w tle zależy od przeglądarki —
          pozostaw ekran aktywny.
        </p>
      </details>
    </div>
  );
}
