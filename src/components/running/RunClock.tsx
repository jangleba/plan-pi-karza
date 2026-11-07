import { useEffect, useRef, useState } from "react";
import type { SessionDay } from "@/lib/loadwise/types";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useAuth } from "@/lib/loadwise/auth";
import { useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import { formatRunDuration } from "@/lib/running/metrics";

type Observed = { number: number; seconds: number; kind: string; saved: boolean };
type ClockDraft = {
  index: number;
  stepSec: number;
  totalSec: number;
  finished: boolean;
  results: Observed[];
};
const parse = (v: unknown): ClockDraft | undefined => {
  if (!v || typeof v !== "object") return;
  const x = v as ClockDraft;
  if (
    !Number.isInteger(x.index) ||
    x.index < 0 ||
    x.index > 80 ||
    ![x.stepSec, x.totalSec].every((n) => Number.isFinite(n) && n >= 0 && n < 86400) ||
    typeof x.finished !== "boolean" ||
    !Array.isArray(x.results) ||
    x.results.length > 80 ||
    !x.results.every(
      (r) =>
        Number.isInteger(r.number) &&
        r.number >= 1 &&
        r.number <= 80 &&
        Number.isFinite(r.seconds) &&
        r.seconds > 0 &&
        r.seconds < 86400 &&
        ["run_clock", "run_clock_partial", "run_rest"].includes(r.kind) &&
        typeof r.saved === "boolean",
    )
  )
    return;
  return x;
};
export function RunClock({
  session,
  enabled,
  onFinish,
  onBusy,
}: {
  session: SessionDay;
  enabled: boolean;
  onFinish: (seconds: number) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const protocol = deriveRunningIntervalProtocol(session);
  const context = trainingStorageKey(
    "run-clock:v2",
    user?.id,
    session.dbId ?? session.date,
    JSON.stringify(protocol),
  );
  const local = useTrainingLocalState(
    context,
    { index: 0, stepSec: 0, totalSec: 0, finished: false, results: [] },
    parse,
  );
  const logs = useExerciseSetLogs(session.dbId, "run-clock:v1");
  const [running, setRunning] = useState(false),
    [saving, setSaving] = useState(0),
    [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0),
    live = useRef(local.value),
    start = useRef<number | null>(null),
    lock = useRef(false),
    active = useRef(context),
    writes = useRef(new Map<number, Promise<boolean>>());
  live.current = local.value;
  active.current = context;
  const extra =
    running && start.current != null ? Math.max(0, (performance.now() - start.current) / 1000) : 0;
  const step = protocol?.steps[local.value.index];
  function commit(value: ClockDraft) {
    live.current = value;
    local.setValue(value);
  }
  const measured = () => {
    const delta =
      start.current == null ? 0 : Math.max(0, (performance.now() - start.current) / 1000);
    return {
      ...live.current,
      stepSec: live.current.stepSec + delta,
      totalSec: live.current.totalSec + delta,
    };
  };
  function pause() {
    if (start.current == null) return;
    const value = measured();
    start.current = null;
    setRunning(false);
    commit(value);
  }
  const persistOnExit = useRef(() => {});
  persistOnExit.current = () => {
    pause();
    active.current = "";
  };
  useEffect(() => () => persistOnExit.current(), []);
  useEffect(() => {
    start.current = null;
    setRunning(false);
    setError(null);
    writes.current = new Map();
  }, [context]);
  useEffect(() => {
    onBusy(running || saving > 0);
  }, [running, saving, onBusy]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 200);
    return () => window.clearInterval(id);
  }, [running]);
  useEffect(() => {
    const stop = () => {
      if (document.visibilityState === "hidden") pause();
    };
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", stop);
    };
  });
  useEffect(() => {
    if (!enabled) pause();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  function saveObserved(result: Observed) {
    const existing = writes.current.get(result.number);
    if (existing) return existing;
    const scope = context;
    setSaving((v) => v + 1);
    const promise = (async () => {
      try {
        const ok = await logs.saveSet({
          setNumber: result.number,
          weightKg: null,
          reps: null,
          rir: null,
          metricKind: result.kind,
          metricValue: result.seconds,
        });
        if (!ok) throw new Error();
        if (active.current === scope)
          commit({
            ...live.current,
            results: live.current.results.map((r) =>
              r.number === result.number ? { ...r, saved: true } : r,
            ),
          });
        return true;
      } catch {
        if (active.current === scope)
          setError("Zapis odcinka wymaga ponowienia. Zegar i lokalny szkic nadal działają.");
        return false;
      } finally {
        if (active.current === scope) {
          writes.current.delete(result.number);
          setSaving((v) => Math.max(0, v - 1));
        }
      }
    })();
    writes.current.set(result.number, promise);
    return promise;
  }
  async function finishSaved() {
    setError(null);
    const scope = context,
      results = live.current.results;
    const saved = await Promise.all(results.filter((r) => !r.saved).map(saveObserved));
    if (active.current === scope && saved.every(Boolean)) onFinish(live.current.totalSec);
  }
  function next(final = false) {
    if (lock.current || !enabled) return;
    lock.current = true;
    const value = measured();
    if (value.stepSec < 0.5) {
      lock.current = false;
      return;
    }
    const result: Observed = {
      number: value.index + 1,
      seconds: Math.round(value.stepSec * 10) / 10,
      kind:
        step?.kind === "recovery"
          ? "run_rest"
          : final && step?.target.mode === "time" && value.stepSec < (step.target.value ?? 0) * 0.95
            ? "run_clock_partial"
            : "run_clock",
      saved: false,
    };
    const finished = final || !protocol || value.index >= protocol.steps.length - 1;
    const nextValue = {
      ...value,
      index: finished ? value.index : value.index + 1,
      stepSec: finished ? value.stepSec : 0,
      finished,
      results: [...value.results.filter((r) => r.number !== result.number), result],
    };
    commit(nextValue);
    start.current = finished ? null : performance.now();
    setRunning(!finished);
    lock.current = false;
    // Network I/O must never delay the start of the next work/rest interval.
    void saveObserved(result).then((ok) => {
      if (finished && ok && active.current === context) void finishSaved();
    });
  }
  useEffect(() => {
    if (
      running &&
      step?.target.autoAdvance &&
      step.target.mode === "time" &&
      local.value.stepSec + extra >= (step.target.value ?? Infinity)
    )
      next();
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const seconds = local.value.stepSec + extra,
    remaining =
      step?.target.mode === "time" ? Math.max(0, (step.target.value ?? 0) - seconds) : seconds;
  return (
    <section className="bw-run-clock bw-focus-card" aria-label="Bieg bez GPS">
      <div className="bw-focus-stage">
        <span>{step?.kind === "recovery" ? "Przerwa" : "Bieg bez GPS"}</span>
        <span>{step ? `${step.repeatIndex}/${step.repeatTotal}` : "Stoper"}</span>
      </div>
      <h2>{protocol?.summary ?? session.title}</h2>
      <div className="bw-run-readout" role="timer">
        {formatRunDuration(remaining)}
      </div>
      <p className="bw-session-muted">{step?.instruction ?? "Biegnij zgodnie z planem."}</p>
      <p className="bw-session-muted">
        Czas zapisu: {formatRunDuration(local.value.totalSec + extra)}. Bez pomiaru dystansu.
      </p>
      {error && (
        <p role="alert" className="bw-training-error">
          {error}
        </p>
      )}
      {!local.value.finished && (
        <div className="bw-clock-actions">
          <button
            type="button"
            className="bw-session-primary"
            disabled={!enabled}
            onClick={() => {
              if (running) pause();
              else {
                start.current = performance.now();
                setRunning(true);
              }
            }}
          >
            {running ? "Pauza" : local.value.totalSec ? "Wznów bieg" : "Start biegu"}
          </button>
          {local.value.totalSec + extra > 0 && (
            <button type="button" disabled={!enabled} onClick={() => next(true)}>
              Zakończ bieg
            </button>
          )}
          {step?.target.mode !== "time" && running && (
            <button type="button" onClick={() => next()}>
              Odcinek wykonany
            </button>
          )}
        </div>
      )}
      {local.value.finished && (
        <button
          type="button"
          className="bw-session-primary"
          disabled={saving > 0}
          onClick={() => void finishSaved()}
        >
          {saving ? "Zapisuję wynik…" : "Przejdź do podsumowania"}
        </button>
      )}
      <p className="bw-session-muted">
        Zegar działa przy widocznym ekranie. Po ukryciu aplikacji zatrzymuje się; powrót odtwarza
        szkic.
      </p>
    </section>
  );
}
