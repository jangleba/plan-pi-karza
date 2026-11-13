import { useEffect, useRef, useState } from "react";
import { CircleCheck, Pause, Play, X } from "lucide-react";
import {
  extendCountdown,
  formatClock,
  pauseCountdown,
  remainingSeconds,
  resumeCountdown,
  type Countdown,
} from "@/lib/loadwise/sessionRunner/countdown";
import { vibrate } from "@/lib/haptics";

/** Re-renders only itself once a second; the session screen stays still. */
function useSecondTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const refresh = () => setTick((value) => value + 1);
    const id = window.setInterval(refresh, 500);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [active]);
}

/** Buzzes once when a running countdown reaches zero, even if seen only after returning. */
function useFinishSignal(countdown: Countdown | null, left: number, onFinish?: () => void) {
  const signalled = useRef<number | null>(null);
  useEffect(() => {
    if (!countdown || countdown.endsAt === null || left > 0) return;
    if (signalled.current === countdown.id) return;
    signalled.current = countdown.id;
    vibrate([200, 100, 200]);
    onFinish?.();
  }, [countdown, left, onFinish]);
}

/** Rest after a confirmed set. Started only by a saved set, never by browsing. */
export function RestCountdown({
  countdown,
  onChange,
}: {
  countdown: Countdown;
  onChange: (next: Countdown | null) => void;
}) {
  useSecondTick(countdown.endsAt !== null);
  const left = remainingSeconds(countdown);
  useFinishSignal(countdown, left);
  const done = left === 0;
  return (
    <div className="bw-rest-card" data-done={done || undefined} role="group" aria-label="Przerwa">
      <div className="bw-rest-main">
        <span className="bw-rest-name">{done ? "Przerwa zakończona" : "Przerwa"}</span>
        <span
          className="bw-rest-clock"
          role="timer"
          aria-live="off"
          aria-label={`Pozostało ${formatClock(left)}`}
        >
          {formatClock(left)}
        </span>
        {countdown.label && <span className="bw-rest-next">{countdown.label}</span>}
      </div>
      <div className="bw-rest-actions">
        {!done && (
          <button
            type="button"
            aria-label={countdown.endsAt === null ? "Wznów przerwę" : "Wstrzymaj przerwę"}
            onClick={() =>
              onChange(
                countdown.endsAt === null ? resumeCountdown(countdown) : pauseCountdown(countdown),
              )
            }
          >
            {countdown.endsAt === null ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
        )}
        <button type="button" onClick={() => onChange(extendCountdown(countdown, 30))}>
          +30 s
        </button>
        <button type="button" aria-label="Zamknij przerwę" onClick={() => onChange(null)}>
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Full rest screen between sets: what was saved, the large clock with its
 * bar, what comes next, and ±15 s. Tapping the clock pauses it. Reaching zero
 * signals once and waits; the next set starts only on the athlete's tap.
 */
export function RestScreen({
  countdown,
  saved,
  onChange,
}: {
  countdown: Countdown;
  /** "Seria zapisana" / "Odcinek zaliczony"; null for a rest before another exercise. */
  saved: string | null;
  onChange: (next: Countdown | null) => void;
}) {
  useSecondTick(countdown.endsAt !== null);
  const left = remainingSeconds(countdown);
  useFinishSignal(countdown, left);
  const done = left === 0;
  const paused = countdown.endsAt === null && !done;
  const elapsed = countdown.total > 0 ? 1 - left / countdown.total : 1;
  return (
    <section className="bw-rest-screen" aria-label="Przerwa" data-done={done || undefined}>
      <div className="bw-rest-panel">
        {saved && (
          <p className="bw-rest-saved">
            <CircleCheck aria-hidden="true" /> {saved}
          </p>
        )}
        <p className="bw-rest-title">
          {done ? "Przerwa zakończona" : paused ? "Przerwa wstrzymana" : "Przerwa"}
        </p>
        <button
          type="button"
          className="bw-rest-big"
          role="timer"
          aria-live="off"
          disabled={done}
          aria-label={`Pozostało ${formatClock(left)}. ${paused ? "Wznów przerwę" : "Wstrzymaj przerwę"}`}
          onClick={() => onChange(paused ? resumeCountdown(countdown) : pauseCountdown(countdown))}
        >
          {formatClock(left).padStart(5, "0")}
        </button>
        <div className="bw-rest-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(1, elapsed)) * 100}%` }} />
        </div>
        {countdown.label && (
          <p className="bw-rest-following">
            {countdown.label}
            {countdown.detail && <span>{countdown.detail}</span>}
          </p>
        )}
      </div>
      <div className="bw-rest-adjust" role="group" aria-label="Długość przerwy">
        <button
          type="button"
          disabled={done}
          aria-label="Skróć przerwę o 15 sekund"
          onClick={() => onChange(extendCountdown(countdown, -15))}
        >
          −15 s
        </button>
        <button
          type="button"
          aria-label="Wydłuż przerwę o 15 sekund"
          onClick={() => onChange(extendCountdown(countdown, 15))}
        >
          +15 s
        </button>
      </div>
    </section>
  );
}

/** Work bout of a timed task. Reaching zero signals; it never marks the task as done. */
export function WorkCountdown({
  countdown,
  onChange,
  onFinish,
}: {
  countdown: Countdown;
  onChange: (next: Countdown | null) => void;
  onFinish?: () => void;
}) {
  useSecondTick(countdown.endsAt !== null);
  const left = remainingSeconds(countdown);
  useFinishSignal(countdown, left, onFinish);
  return (
    <div className="bw-work" data-done={left === 0 || undefined}>
      <span className="bw-work-label">{left === 0 ? "Czas minął" : countdown.label}</span>
      <span className="bw-work-clock" role="timer" aria-live="off">
        {formatClock(left)}
      </span>
      {left > 0 && (
        <button
          type="button"
          aria-label={countdown.endsAt === null ? "Wznów odliczanie" : "Wstrzymaj odliczanie"}
          onClick={() =>
            onChange(
              countdown.endsAt === null ? resumeCountdown(countdown) : pauseCountdown(countdown),
            )
          }
        >
          {countdown.endsAt === null ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
