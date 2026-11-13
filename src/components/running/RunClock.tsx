import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import { trainingStorageKey } from "@/lib/loadwise/trainingDetails";
import { useAuth } from "@/lib/loadwise/auth";
import { useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import {
  formatCountdown,
  isTimedProtocol,
  stageLabel,
  stepBoundaries,
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
import {
  durationLabel,
  goalOf,
  guidePhases,
  nextName,
  padClock,
  stepTitle,
  untilLabel,
} from "./runGuideText";

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
  const step = position.step;
  const stage = draft.finished ? "Koniec" : started ? stageLabel(step) : "Gotowy";
  const tone = !step || draft.finished ? "done" : step.kind === "work" ? "work" : "rest";
  const shown = started ? step : (protocol.steps[0] ?? null);
  const shownIndex = started ? position.index : 0;
  const following = started ? nextStep : (protocol.steps[1] ?? null);
  const shownLength = shown?.target.value ?? 0;
  const remaining = started ? position.stepRemainingSec : shownLength;
  const stepProgress = shownLength > 0 ? Math.min(1, 1 - remaining / shownLength) : 0;
  const work = protocol.steps.filter((s) => s.kind === "work" && (s.phase ?? "main") === "main");
  const workDone = protocol.steps
    .slice(0, started ? position.index : 0)
    .filter((s) => s.kind === "work" && (s.phase ?? "main") === "main").length;
  const workCurrent =
    shown && shown.kind === "work" && (shown.phase ?? "main") === "main" && !draft.finished
      ? workDone
      : -1;
  const phases = guidePhases(protocol, work.length);
  const currentPhase = draft.finished ? null : (shown?.phase ?? "main");
  const goal = goalOf(shown);
  const [plan, setPlan] = useState(false);

  return (
    <section
      className="bw-run-clock bw-run-guide"
      aria-label="Bieg bez GPS"
      data-tone={tone}
      data-started={started || undefined}
    >
      <div className="bw-run-clock-head">
        <span className="bw-run-clock-stage" data-live={running || undefined}>
          {stage}
        </span>
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
      {phases.length > 1 && (
        <ol className="bw-run-phases" aria-label="Części biegu">
          {phases.map((phase) => (
            <li
              key={phase.id}
              aria-current={phase.id === currentPhase ? "step" : undefined}
              data-current={phase.id === currentPhase || undefined}
            >
              {phase.label}
            </li>
          ))}
        </ol>
      )}
      <div className="bw-run-now">
        <p className="bw-run-now-title">{draft.finished ? "Bieg ukończony" : stepTitle(shown)}</p>
        <div className="bw-run-readout" role="timer" aria-live="off">
          {draft.finished
            ? formatCountdown(activeElapsed(draft, now))
            : padClock(formatCountdown(remaining))}
        </div>
        <p className="bw-run-now-until">{draft.finished ? "czas biegu" : untilLabel(shown)}</p>
        {!draft.finished && (
          <div
            className="bw-run-step-bar"
            role="progressbar"
            aria-label="Postęp kroku"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(stepProgress * 100)}
          >
            <span style={{ width: `${stepProgress * 100}%` }} />
          </div>
        )}
        {goal && !draft.finished && (
          <div className="bw-run-goal">
            <span>Cel</span>
            <strong className="bw-run-clock-target">{goal.value}</strong>
            {goal.note && <small>{goal.note}</small>}
          </div>
        )}
      </div>
      {!draft.finished && (
        <p className="bw-run-next bw-run-clock-next">
          <span>Następnie</span>
          <strong>
            {following
              ? `${nextName(following)} · ${durationLabel(following.target.value ?? 0)}`
              : "Koniec biegu"}
          </strong>
        </p>
      )}
      <div className="bw-run-reps">
        {work.length > 1 && (
          <>
            <p className="bw-run-reps-count">
              {Math.min(work.length, workDone + (workCurrent >= 0 ? 1 : 0))} z {work.length}{" "}
              odcinków
            </p>
            <ol
              className="bw-run-reps-dots"
              aria-label={`Ukończone odcinki: ${workDone} z ${work.length}`}
            >
              {work.map((item, i) => (
                <li
                  key={item.id}
                  data-state={i < workDone ? "done" : i === workCurrent ? "current" : "open"}
                />
              ))}
            </ol>
          </>
        )}
        <button
          type="button"
          className="bw-run-plan-toggle"
          aria-expanded={plan}
          onClick={() => setPlan((v) => !v)}
        >
          <span>Przebieg sesji</span>
          <small className="bw-run-clock-total">
            {formatCountdown(activeElapsed(draft, now))} / {formatCountdown(totalSec)}
          </small>
          <ChevronRight aria-hidden="true" size={18} />
        </button>
        {plan && (
          <ol className="bw-run-plan">
            {protocol.steps.map((item, i) => (
              <li
                key={item.id}
                data-state={
                  draft.finished || (started && i < shownIndex)
                    ? "done"
                    : started && i === shownIndex
                      ? "current"
                      : "open"
                }
              >
                <span>{stepTitle(item)}</span>
                <small>{durationLabel(item.target.value ?? 0)}</small>
              </li>
            ))}
          </ol>
        )}
      </div>
      {error && (
        <p role="alert" className="bw-training-error">
          {error}
        </p>
      )}
      <div className="bw-run-dock">
        {!draft.finished ? (
          <>
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
              <div className="bw-run-dock-links">
                <button type="button" disabled={!enabled} onClick={skip}>
                  <SkipForward size={16} aria-hidden="true" /> Pomiń krok
                </button>
                <button type="button" disabled={!enabled} onClick={finish}>
                  Zakończ bieg
                </button>
              </div>
            )}
          </>
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
      </div>
    </section>
  );
}
