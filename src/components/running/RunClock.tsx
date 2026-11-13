import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useAuth } from "@/lib/loadwise/auth";
import { useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import {
  formatCountdown,
  isTimedProtocol,
  repLabel,
  stageLabel,
  stepBoundaries,
  targetLabel,
} from "@/lib/running/guideTimeline";
import {
  EMPTY_GUIDE_DRAFT,
  activeElapsed,
  advanceGuide,
  countdownSecond,
  finishGuide,
  guideElapsed,
  guidePosition,
  parseGuideDraft,
  pauseGuide,
  skipGuideStep,
  startGuide,
  type GuideAdvance,
  type GuideDraft,
  type ObservedStep,
} from "@/lib/running/guideClock";
import {
  loadSignalOptions,
  saveSignalOptions,
  signalStep,
  signalTick,
  unlockSignals,
  type SignalOptions,
} from "@/lib/running/runSignals";
import {
  cancelLockScreenCues,
  ensureLockScreenPermission,
  planLockScreenCues,
  scheduleLockScreenCues,
} from "@/lib/running/lockScreenCues";
import type { RunningIntervalProtocol } from "@/lib/running/types";
import { ManualRunClock } from "./ManualRunClock";

interface RunClockProps {
  session: SessionDay;
  enabled: boolean;
  onFinish: (seconds: number) => void;
  onBusy: (busy: boolean) => void;
}

/**
 * Licznik biegu bez GPS. Receptura czasowa prowadzi automatycznie (czas z zegara
 * ściennego, sygnały, ekran zablokowany); starsze sesje z odcinkami na dystans
 * albo ręcznymi zostają przy liczniku krok po kroku.
 */
export function RunClock(props: RunClockProps) {
  const protocol = useMemo(() => deriveRunningIntervalProtocol(props.session), [props.session]);
  return protocol && isTimedProtocol(protocol) ? (
    <GuidedRunClock {...props} protocol={protocol} />
  ) : (
    <ManualRunClock {...props} />
  );
}

function GuidedRunClock({
  session,
  enabled,
  onFinish,
  onBusy,
  protocol,
}: RunClockProps & { protocol: RunningIntervalProtocol }) {
  const { user } = useAuth();
  const context = trainingStorageKey(
    "run-clock:v3",
    user?.id,
    session.dbId ?? session.date,
    JSON.stringify(protocol),
  );
  const local = useTrainingLocalState(context, EMPTY_GUIDE_DRAFT, parseGuideDraft);
  const logs = useExerciseSetLogs(session.dbId, "run-clock:v1");
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalOptions>(() => loadSignalOptions());
  const live = useRef<GuideDraft>(local.value);
  const active = useRef(context);
  const writes = useRef(new Map<number, Promise<boolean>>());
  const lastTick = useRef<number | null>(null);
  const signalsRef = useRef(signals);
  live.current = local.value;
  active.current = context;
  signalsRef.current = signals;

  const draft = local.value;
  const running = draft.runningSince != null && !draft.finished;
  const position = guidePosition(protocol, draft, now);
  const { totalSec } = stepBoundaries(protocol);
  const nextStep = position.done ? null : (protocol.steps[position.index + 1] ?? null);

  function commit(value: GuideDraft) {
    live.current = value;
    local.setValue(value);
  }

  function saveObserved(result: ObservedStep) {
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
          setError("Zapis odcinka wymaga ponowienia. Licznik działa dalej.");
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
    const scope = context;
    const pending = live.current.results.filter((r) => !r.saved);
    const saved = await Promise.all(pending.map(saveObserved));
    if (active.current === scope && saved.every(Boolean) && live.current.finished)
      onFinish(activeElapsed(live.current, Date.now()));
  }

  /** Wspólna ścieżka po każdej zmianie: zapis szkicu, sygnał, zapis wyników. */
  function apply(step: GuideAdvance, signal = true) {
    if (!step.changed) return;
    commit(step.draft);
    if (signal) {
      const at = guidePosition(protocol, step.draft, Date.now());
      signalStep(step.draft.finished ? null : at.step, signalsRef.current);
    }
    if (step.draft.finished) void cancelLockScreenCues();
    const scope = context;
    for (const result of step.added)
      void saveObserved(result).then((ok) => {
        if (step.draft.finished && ok && active.current === scope) void finishSaved();
      });
  }

  // Zegar ekranu: odświeżanie i automatyczne przejścia.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const step = advanceGuide(protocol, live.current, now);
    apply(step);
    const at = guidePosition(protocol, step.draft, now);
    const tickAt = countdownSecond(protocol, at);
    if (tickAt != null && tickAt !== lastTick.current) signalTick(signalsRef.current);
    lastTick.current = tickAt;
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onBusy(running || saving > 0);
  }, [running, saving, onBusy]);

  // Po powrocie z tła licznik nadrabia przekroczone kroki bez serii sygnałów.
  useEffect(() => {
    function onVisibility() {
      const current = live.current;
      if (document.visibilityState === "hidden") {
        if (current.runningSince != null && !current.finished) {
          const nowMs = Date.now();
          void scheduleLockScreenCues(
            planLockScreenCues(protocol, guideElapsed(current, nowMs), nowMs),
          );
        }
        return;
      }
      void cancelLockScreenCues();
      const nowMs = Date.now();
      if (current.runningSince != null) apply(advanceGuide(protocol, current, nowMs), false);
      setNow(nowMs);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });

  // Wyjście z ekranu sesji to świadome przerwanie: licznik staje w pauzie.
  const persistOnExit = useRef(() => {});
  persistOnExit.current = () => {
    const nowMs = Date.now();
    const current = live.current;
    if (current.runningSince != null && !current.finished) {
      const step = advanceGuide(protocol, current, nowMs);
      commit(pauseGuide(step.draft, nowMs));
      for (const result of step.added) void saveObserved(result);
    }
    void cancelLockScreenCues();
    active.current = "";
  };
  useEffect(() => () => persistOnExit.current(), []);

  useEffect(() => {
    setError(null);
    writes.current = new Map();
  }, [context]);

  useEffect(() => {
    if (!enabled && live.current.runningSince != null) pause();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    if (!enabled) return;
    unlockSignals();
    void ensureLockScreenPermission();
    const nowMs = Date.now();
    const first = live.current.activeSec === 0 && live.current.skipSec === 0;
    commit(startGuide(live.current, nowMs));
    setNow(nowMs);
    if (first) signalStep(protocol.steps[0] ?? null, signalsRef.current);
  }

  function pause() {
    const nowMs = Date.now();
    const step = advanceGuide(protocol, live.current, nowMs);
    apply(step, false);
    commit(pauseGuide(live.current, nowMs));
    setNow(nowMs);
    void cancelLockScreenCues();
  }

  function skip() {
    if (!enabled) return;
    const nowMs = Date.now();
    apply(skipGuideStep(protocol, live.current, nowMs));
    setNow(nowMs);
  }

  function finish() {
    if (!enabled) return;
    const nowMs = Date.now();
    const step = finishGuide(protocol, live.current, nowMs);
    apply(step);
    setNow(nowMs);
    if (!step.added.length) void finishSaved();
  }

  function toggleSound() {
    const nextOptions = { ...signals, sound: !signals.sound };
    setSignals(nextOptions);
    saveSignalOptions(nextOptions);
    if (nextOptions.sound) unlockSignals();
  }

  const started = draft.activeSec > 0 || draft.skipSec > 0 || running;
  const elapsedGuide = Math.min(totalSec, guideElapsed(draft, now));
  const progress = totalSec ? Math.min(1, elapsedGuide / totalSec) : 0;
  const step = position.step;
  const stage = draft.finished ? "Koniec" : started ? stageLabel(step) : "Gotowy";
  const tone = !step || draft.finished ? "done" : step.kind === "work" ? "work" : "rest";
  const shown = started ? step : protocol.steps[0];
  const target = targetLabel(shown ?? null);
  const rep = repLabel(shown ?? null);

  return (
    <section className="bw-run-clock bw-focus-card" aria-label="Bieg bez GPS" data-tone={tone}>
      <div className="bw-run-clock-head">
        <span className="bw-run-clock-stage">{stage}</span>
        <button
          type="button"
          className="bw-run-clock-sound"
          aria-pressed={signals.sound}
          aria-label={signals.sound ? "Wycisz sygnały" : "Włącz dźwięk sygnałów"}
          onClick={toggleSound}
        >
          {signals.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>
      {rep && !draft.finished && <p className="bw-run-clock-rep">{rep}</p>}
      <div className="bw-run-readout" role="timer" aria-live="off">
        {draft.finished
          ? formatCountdown(activeElapsed(draft, now))
          : formatCountdown(started ? position.stepRemainingSec : (shown?.target.value ?? 0))}
      </div>
      {target && !draft.finished && <p className="bw-run-clock-target">{target}</p>}
      {!draft.finished && (
        <p className="bw-run-clock-next">
          {nextStep
            ? `Dalej: ${stageLabel(nextStep)} · ${formatCountdown(nextStep.target.value ?? 0)}`
            : "Dalej: koniec biegu"}
        </p>
      )}
      <div
        className="bw-run-clock-progress"
        role="progressbar"
        aria-label="Postęp biegu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="bw-run-clock-total">
        {formatCountdown(activeElapsed(draft, now))} / {formatCountdown(totalSec)}
      </p>
      {error && (
        <p role="alert" className="bw-training-error">
          {error}
        </p>
      )}
      {!draft.finished ? (
        <div className="bw-run-clock-actions">
          {started && (
            <button
              type="button"
              className="bw-run-clock-icon"
              disabled={!enabled}
              aria-label="Zakończ bieg"
              onClick={finish}
            >
              <Square size={20} />
            </button>
          )}
          <button
            type="button"
            className="bw-session-primary bw-run-clock-main"
            disabled={!enabled}
            onClick={running ? pause : start}
          >
            {running ? <Pause size={20} /> : <Play size={20} />}
            {running ? "Pauza" : started ? "Wznów" : "Start"}
          </button>
          {started && (
            <button
              type="button"
              className="bw-run-clock-icon"
              disabled={!enabled}
              aria-label="Pomiń krok"
              onClick={skip}
            >
              <SkipForward size={20} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="bw-session-primary"
          disabled={saving > 0}
          onClick={() => void finishSaved()}
        >
          {saving ? "Zapisuję wynik…" : "Przejdź do podsumowania"}
        </button>
      )}
    </section>
  );
}
