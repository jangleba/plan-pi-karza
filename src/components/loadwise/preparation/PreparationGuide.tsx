import { useExerciseSetLogs } from "@/lib/loadwise/setLogs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { useTrainingLocalState } from "@/lib/loadwise/useTrainingLocalState";
import {
  buildRecoveryProtocol,
  EVIDENCE,
  expandPreparationSteps,
  protocolDuration,
  RECOVERY_FOCI,
  warmupFromExercises,
  type PreparationKind,
  type PreparationProtocol,
  type RecoveryContext,
  type RecoveryFocus,
} from "@/lib/loadwise/preparation/protocols";
import {
  initialPlayback,
  nextPlayback,
  parsePlayback,
  pausePlayback,
  remainingPlaybackMs,
  startPlayback,
  tickPlayback,
  type PreparationPlayback,
} from "@/lib/loadwise/preparation/playback";
import { PreparationIllustration } from "./PreparationIllustration";
import "./preparation.css";

function usePreparationPlayback(key: string, fallback: PreparationPlayback) {
  const initial = useMemo(() => {
    if (typeof window === "undefined")
      return { key, value: undefined as PreparationPlayback | undefined, available: false };
    try {
      const raw = window.localStorage.getItem(key);
      return { key, value: raw ? parsePlayback(JSON.parse(raw)) : undefined, available: true };
    } catch {
      return { key, value: undefined as PreparationPlayback | undefined, available: false };
    }
  }, [key]);
  const [snapshot, setSnapshot] = useState(initial);
  const selected = snapshot.key === key ? snapshot : initial;
  const setValue = useCallback(
    (value: PreparationPlayback) => {
      let available = false;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        available = true;
      } catch {
        /* Keep in-memory guidance. */
      }
      setSnapshot({ key, value, available });
    },
    [key],
  );
  return { value: selected.value ?? fallback, setValue, available: selected.available };
}

function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function sourceLabel(side: "left" | "right" | null) {
  return side === "left" ? "Lewa strona" : side === "right" ? "Prawa strona" : "Wykonaj spokojnie";
}
function speak(text: string) {
  try {
    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === "undefined"
    )
      return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pl-PL";
    utterance.rate = 0.98;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    /* Visual guidance remains available when speech is blocked. */
  }
}
/**
 * Short buzz when the step changes (switch side, next set, rest), so the
 * athlete does not have to watch the screen while holding a stretch.
 * Browsers without the Vibration API (iOS WebView) rely on the voice cue.
 */
function buzz(type: "work" | "switch" | "rest") {
  try {
    navigator.vibrate?.(type === "switch" ? [120, 80, 120] : type === "rest" ? 200 : [60]);
  } catch {
    /* Vibration is optional. */
  }
}
/** Plain-language dose: what to do, how long and on which side. */
function plainDose(e: PreparationProtocol["exercises"][number]): string {
  const work =
    e.seconds != null
      ? e.seconds >= 60
        ? `${Math.round(e.seconds / 60)} min`
        : `${e.seconds} s`
      : `${e.reps ?? 1} powtórzeń`;
  const sets = (e.sets ?? 1) > 1 ? `${e.sets} serie × ` : "";
  return `${sets}${work}${e.sides ? " na każdą stronę" : ""}`;
}

/**
 * Every exercise visible before the start: drawing, dose and the exact
 * starting position. Nothing important is hidden behind a toggle.
 */
function ExerciseOverview({ protocol }: { protocol: PreparationProtocol }) {
  return (
    <ol className="bw-prep-list">
      {protocol.exercises.map((e, i) => (
        <li key={`${e.id}:${i}`}>
          <PreparationIllustration small visual={e.visual} label={e.name} />
          <div>
            <strong>{e.name}</strong>
            <span className="bw-prep-list-dose">{plainDose(e)}</span>
            <p>{e.setup}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function PreparationEvidence({ protocol }: { protocol: PreparationProtocol }) {
  const ids = [...new Set([...protocol.sources, ...protocol.exercises.flatMap((e) => e.sources)])];
  return (
    <details className="bw-prep-evidence">
      <summary>
        <BookOpen size={17} />
        Dlaczego ten zestaw?
      </summary>
      <p>{protocol.goal}</p>
      <p>{protocol.note}</p>
      <div className="bw-prep-science">
        {protocol.exercises.map((e) => (
          <div key={e.id}>
            <strong>{e.name}</strong>
            <p>{e.anatomy}</p>
            <p>{e.mechanism}</p>
            <p>Ustawienie: {e.setup}</p>
            <small>
              Dawka: {plainDose(e)}. {e.doseReason}
            </small>
          </div>
        ))}
      </div>
      <ul>
        {ids.map(
          (id) =>
            EVIDENCE[id] && (
              <li key={id}>
                <a href={EVIDENCE[id].url} target="_blank" rel="noopener noreferrer">
                  {EVIDENCE[id].title}
                </a>
                <small>{EVIDENCE[id].scope}</small>
              </li>
            ),
        )}
      </ul>
    </details>
  );
}

export function PreparationGuide({
  protocol,
  storageKey,
  autoStart = false,
  onFinish,
}: {
  protocol: PreparationProtocol;
  storageKey: string;
  autoStart?: boolean;
  onFinish?: (
    allStepsCompleted: boolean,
    execution?: { name: string; completed: boolean }[],
  ) => void | Promise<void>;
}) {
  const steps = useMemo(() => expandPreparationSteps(protocol), [protocol]);
  const persistenceKey = `${storageKey}:${protocol.id}:${protocol.exercises.map((e) => `${e.id}:${e.seconds ?? e.reps}:${e.sets ?? 1}:${e.sides}`).join("|")}`;
  const local = usePreparationPlayback(persistenceKey, initialPlayback(steps));
  const validSaved =
    local.value.index <= steps.length && (local.value.finished || local.value.index < steps.length);
  const progress = validSaved ? local.value : initialPlayback(steps);
  const live = useRef(progress);
  live.current = progress;
  const [now, setNow] = useState(0);
  const [voice, setVoice] = useState(true);
  const [hiddenPause, setHiddenPause] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const current = steps[progress.index];
  const exercise = current ? protocol.exercises[current.exerciseIndex] : null;
  const remaining = remainingPlaybackMs(progress, now || progress.anchorMs);
  const seconds = remaining == null ? null : Math.ceil(remaining / 1000);
  const next = steps[progress.index + 1];
  const estimated = protocolDuration(protocol);
  const savePlayback = local.setValue;
  const commit = useCallback(
    (value: PreparationPlayback) => {
      live.current = value;
      savePlayback(value);
      setNow(Date.now());
    },
    [savePlayback],
  );

  useEffect(() => {
    if (autoStart && !progress.started && !progress.finished)
      commit(startPlayback(progress, Date.now()));
  }, [autoStart, progress, commit]);
  useEffect(() => {
    if (!progress.running || progress.finished || progress.remainingMs == null) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      const before = live.current;
      const after = tickPlayback(before, steps, timestamp);
      if (after !== before) commit(after);
      else setNow(timestamp);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [progress.running, progress.finished, progress.remainingMs, steps, commit]);
  useEffect(
    () => () => {
      // SPA navigation also checkpoints remaining time; returning never auto-starts.
      try {
        window.localStorage.setItem(
          persistenceKey,
          JSON.stringify(pausePlayback(live.current, Date.now())),
        );
      } catch {
        /* In-memory mode remains usable when storage is blocked. */
      }
    },
    [persistenceKey],
  );

  useEffect(() => {
    function suspend(event: Event) {
      if ((event.type === "pagehide" || document.hidden) && live.current.running) {
        commit(pausePlayback(live.current, Date.now()));
        setHiddenPause(true);
      }
    }
    window.addEventListener("pagehide", suspend);
    document.addEventListener("visibilitychange", suspend);
    return () => {
      window.removeEventListener("pagehide", suspend);
      document.removeEventListener("visibilitychange", suspend);
    };
  }, [commit]);
  const lastBuzz = useRef<number | null>(null);
  useEffect(() => {
    if (!progress.running) return;
    const step = steps[progress.index];
    if (step && lastBuzz.current !== null && lastBuzz.current !== progress.index) buzz(step.type);
    lastBuzz.current = progress.index;
  }, [progress.index, progress.running, steps]);
  useEffect(() => {
    if (!progress.running || !voice) return;
    const step = steps[progress.index];
    if (step)
      speak(
        step.type === "work"
          ? `${step.label}. ${sourceLabel(step.side)}. ${step.seconds ? `${step.seconds} sekund` : `${step.reps} powtórzeń`}.`
          : `${step.label}. ${step.seconds} sekund.`,
      );
  }, [progress.index, progress.running, voice, steps]);
  useEffect(() => {
    if (!progress.running) {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* Optional speech. */
      }
    }
    if (!progress.running || document.hidden) return;
    let released = false;
    let lock: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    void nav.wakeLock
      ?.request("screen")
      .then((value) => {
        if (released) void value.release();
        else lock = value;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void lock?.release().catch(() => undefined);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* Optional speech. */
      }
    };
  }, [progress.running]);

  if (progress.finished)
    return (
      <section className="bw-prep bw-prep-finished" aria-label={protocol.title}>
        <Check size={28} />
        <h3>{confirmed ? "Prowadzenie zakończone" : "Koniec prowadzenia"}</h3>
        <p>
          {progress.skipped.length
            ? `Pominięte ćwiczenia: ${progress.skipped.length}. Podsumuj faktycznie wykonany wysiłek.`
            : "Potwierdź, że wykonałeś ćwiczenia."}
        </p>
        {!confirmed && (
          <button
            type="button"
            className="bw-prep-primary"
            disabled={confirming}
            onClick={async () => {
              setConfirming(true);
              setConfirmationError(null);
              try {
                await onFinish?.(
                  progress.skipped.length === 0,
                  protocol.exercises.map((e, i) => ({
                    name: e.name,
                    completed: !steps.some(
                      (step, index) =>
                        step.exerciseIndex === i &&
                        step.type === "work" &&
                        progress.skipped.includes(index),
                    ),
                  })),
                );
                setConfirmed(true);
              } catch {
                setConfirmationError("Nie zapisano zestawu. Zachowano postęp do ponowienia.");
              } finally {
                setConfirming(false);
              }
            }}
          >
            Potwierdź zakończenie
          </button>
        )}
        {confirmationError && <p role="alert">{confirmationError}</p>}
        <button
          type="button"
          className="bw-prep-text"
          onClick={() => {
            setConfirmed(false);
            commit(initialPlayback(steps));
          }}
        >
          <RotateCcw size={15} />
          Powtórz prowadzenie
        </button>
        <PreparationEvidence protocol={protocol} />
      </section>
    );

  if (!progress.started)
    return (
      <section className="bw-prep">
        <div className="bw-prep-heading">
          <div>
            <small>PRZYGOTOWANIE</small>
            <h3>{protocol.title}</h3>
          </div>
          <span>ok. {Math.ceil(estimated.seconds / 60)} min</span>
        </div>
        <p className="bw-prep-reason">{protocol.reason}</p>
        <ExerciseOverview protocol={protocol} />
        <button
          type="button"
          className="bw-prep-primary"
          onClick={() => commit(startPlayback(progress, Date.now()))}
        >
          <Play size={18} />
          {protocol.kind === "recovery" ? "Rozpocznij regenerację" : "Rozpocznij rozgrzewkę"}
        </button>
        <PreparationEvidence protocol={protocol} />
      </section>
    );

  if (!current || !exercise) return null;
  const phaseLabel =
    current.type === "switch"
      ? "Zmień stronę"
      : current.type === "rest"
        ? "Przerwa"
        : sourceLabel(current.side);
  const nextText = next
    ? next.type === "switch"
      ? `${next.seconds} s na zmianę strony`
      : next.type === "rest"
        ? `${next.seconds} s przerwy`
        : `${protocol.exercises[next.exerciseIndex].name}${next.side ? ` · ${sourceLabel(next.side).toLowerCase()}` : ""}`
    : "Potwierdzenie zakończenia";
  return (
    <section className="bw-prep bw-prep-player" aria-label={protocol.title}>
      <div className="bw-prep-player-top">
        <small>
          ĆWICZENIE {current.exerciseIndex + 1} Z {protocol.exercises.length}
          {(exercise.sets ?? 1) > 1 ? ` · SERIA ${current.set}/${exercise.sets}` : ""}
        </small>
        <button
          type="button"
          className="bw-prep-sound"
          aria-label={voice ? "Wyłącz komendy głosowe" : "Włącz komendy głosowe"}
          aria-pressed={voice}
          onClick={() => {
            if (voice) window.speechSynthesis?.cancel();
            setVoice(!voice);
          }}
        >
          {voice ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>
      <h3>{exercise.name}</h3>
      {protocol.kind === "recovery" ? (
        // Mobility and stretching: a still picture of the position is clearer
        // than a looping animation while holding a stretch.
        <div className={`bw-prep-still ${current.side === "right" ? "is-mirrored" : ""}`}>
          <PreparationIllustration small visual={exercise.visual} label={exercise.name} />
        </div>
      ) : (
        <PreparationIllustration
          visual={exercise.visual}
          label={exercise.name}
          side={current.side}
        />
      )}
      {current.type === "work" ? (
        <>
          <p className="bw-prep-setup">
            <strong>Ustawienie:</strong> {exercise.setup}
          </p>
          <ol className="bw-prep-cues">
            {exercise.cues.map((cue, i) => (
              <li key={cue}>
                <span>{i + 1}</span>
                {cue}
              </li>
            ))}
          </ol>
          <details className="bw-prep-why">
            <summary>Co pracuje i dlaczego tyle</summary>
            <p>{exercise.anatomy}</p>
            <p>
              <strong>{plainDose(exercise)}.</strong> {exercise.doseReason}
            </p>
          </details>
        </>
      ) : (
        <p className="bw-prep-transition">
          {current.type === "switch"
            ? "Ustaw drugą stronę. Za chwilę zaczynamy."
            : "Odpocznij i przygotuj się do kolejnego kroku."}
        </p>
      )}
      <div className="bw-prep-side" aria-live="polite">
        {phaseLabel}
      </div>
      {seconds != null ? (
        <>
          <div role="timer" aria-label={phaseLabel} className="bw-prep-time">
            {formatSeconds(seconds)}
          </div>
          <progress
            value={Math.max(0, (current.seconds ?? 0) - (seconds ?? 0))}
            max={current.seconds ?? 1}
            aria-label="Postęp kroku"
          />
        </>
      ) : (
        <>
          <div className="bw-prep-reps">
            {current.reps} <span>powtórzeń</span>
          </div>
          <p className="bw-prep-rep-note">Powoli. Potwierdź po wykonaniu.</p>
        </>
      )}
      <p className="bw-prep-next">Następnie: {nextText}</p>
      {hiddenPause && !progress.running && (
        <p role="status" className="bw-prep-rep-note">
          Pauza po schowaniu aplikacji. Wznów, gdy jesteś gotowy.
        </p>
      )}
      {protocol.kind === "recovery" && (
        <p className="bw-prep-rep-note">Łagodne napięcie. Przy bólu przerwij.</p>
      )}
      <div className="bw-prep-actions">
        <button
          type="button"
          className="bw-prep-primary"
          onClick={() => {
            setHiddenPause(false);
            commit(
              progress.running
                ? pausePlayback(progress, Date.now())
                : startPlayback(progress, Date.now()),
            );
          }}
        >
          {progress.running ? (
            <>
              <Pause size={18} />
              Pauza
            </>
          ) : (
            <>
              <Play size={18} />
              Wznów
            </>
          )}
        </button>
        {current.seconds == null ? (
          <button
            type="button"
            className="bw-prep-secondary"
            onClick={() => commit(nextPlayback(progress, steps, Date.now()))}
          >
            Wykonane
            <ChevronRight size={17} />
          </button>
        ) : (
          <button
            type="button"
            className="bw-prep-secondary"
            onClick={() => commit(nextPlayback(progress, steps, Date.now(), true))}
          >
            Pomiń ćwiczenie
          </button>
        )}
      </div>
      {current.seconds == null && (
        <button
          type="button"
          className="bw-prep-text"
          onClick={() => commit(nextPlayback(progress, steps, Date.now(), true))}
        >
          Pomiń ćwiczenie
        </button>
      )}
      {!local.available && (
        <p className="bw-prep-rep-note">Postęp zachowany tylko w otwartym widoku.</p>
      )}
      <PreparationEvidence protocol={protocol} />
    </section>
  );
}

function parseFocus(raw: unknown): RecoveryFocus | undefined {
  return RECOVERY_FOCI.some((f) => f.id === raw) ? (raw as RecoveryFocus) : undefined;
}
export function RecoveryCoach({
  storageKey,
  context,
  onFinish,
  onDurationChange,
  sessionId,
  blocked = false,
}: {
  storageKey: string;
  context: RecoveryContext;
  onFinish: () => void;
  onDurationChange?: (minutes: number) => void;
  sessionId?: string | null;
  blocked?: boolean;
}) {
  const focus = useTrainingLocalState(`${storageKey}:focus`, "whole" as RecoveryFocus, parseFocus);
  const [choosing, setChoosing] = useState(true);
  const { afterMatch, highLoad, limited, nextDemandingDay } = context;
  const protocol = useMemo(
    () => buildRecoveryProtocol(focus.value, { afterMatch, highLoad, limited, nextDemandingDay }),
    [focus.value, afterMatch, highLoad, limited, nextDemandingDay],
  );
  const logs = useExerciseSetLogs(sessionId, `recovery:${protocol.id}`);
  const estimate = protocolDuration(protocol);
  const estimatedMinutes = Math.ceil(estimate.seconds / 60);
  useEffect(() => {
    onDurationChange?.(estimatedMinutes);
  }, [estimatedMinutes, onDurationChange]);
  return (
    <div className="bw-prep-recovery">
      {choosing || blocked ? (
        <section className="bw-prep">
          <div className="bw-prep-heading">
            <div>
              <small>REGENERACJA</small>
              <h2>{RECOVERY_FOCI.find((f) => f.id === focus.value)?.label}</h2>
            </div>
            <span>ok. {estimatedMinutes} min</span>
          </div>
          <div className="bw-prep-chips" role="group" aria-label="Obszar">
            {RECOVERY_FOCI.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={focus.value === item.id}
                onClick={() => focus.setValue(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="bw-prep-reason">{protocol.reason}</p>
          <ExerciseOverview protocol={protocol} />
          <p className="bw-prep-rep-note">
            Minutnik prowadzi każdą stronę i serię, a głos mówi, kiedy zmienić stronę.
          </p>
          <button
            type="button"
            className="bw-prep-primary"
            disabled={blocked}
            onClick={() => {
              if (!blocked) setChoosing(false);
            }}
          >
            <Play size={18} />
            Rozpocznij
          </button>
          <PreparationEvidence protocol={protocol} />
        </section>
      ) : (
        <>
          <button type="button" className="bw-prep-text" onClick={() => setChoosing(true)}>
            Zmień obszar
          </button>
          <PreparationGuide
            key={`${storageKey}:${protocol.id}`}
            protocol={protocol}
            storageKey={storageKey}
            autoStart
            onFinish={async (_all, execution) => {
              if (sessionId)
                for (const [index, item] of (execution ?? []).entries()) {
                  const ok = await logs.saveSet({
                    setNumber: index + 1,
                    exerciseName: item.name,
                    weightKg: null,
                    reps: null,
                    rir: null,
                    metricKind: "completion",
                    metricValue: item.completed ? 1 : 0,
                  });
                  if (!ok) throw new Error("Recovery save failed");
                }
              onFinish();
            }}
          />
        </>
      )}
      <p className="bw-prep-after">Po sesji: posiłek, płyny i odpoczynek.</p>
    </div>
  );
}
export function WarmupCoach({
  exercises,
  kind,
  storageKey,
  onFinish,
}: {
  exercises: TrainingExercise[];
  kind: Exclude<PreparationKind, "recovery">;
  storageKey: string;
  onFinish?: (allStepsCompleted: boolean) => void;
}) {
  const protocol = useMemo(() => warmupFromExercises(exercises, kind), [exercises, kind]);
  return (
    <PreparationGuide
      key={`${storageKey}:${protocol.id}`}
      protocol={protocol}
      storageKey={storageKey}
      onFinish={onFinish}
    />
  );
}

/** Guided cool-down: the planned stretches with side switches, sets and timer. */
export function CooldownCoach({
  protocol,
  storageKey,
  onFinish,
}: {
  protocol: PreparationProtocol;
  storageKey: string;
  onFinish?: (allStepsCompleted: boolean) => void | Promise<void>;
}) {
  return (
    <PreparationGuide
      key={`${storageKey}:${protocol.id}`}
      protocol={protocol}
      storageKey={storageKey}
      onFinish={onFinish}
    />
  );
}
