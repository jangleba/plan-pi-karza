import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { formatRestTime, parseRestDuration } from "@/lib/loadwise/restTimer";
import "./sprint-session.css";

export function SprintRestTimer({
  label,
  compact = false,
  startToken,
  nextLabel,
}: {
  label: string;
  compact?: boolean;
  /** Changes after a successfully saved set, never on loading old results. */
  startToken?: number;
  nextLabel?: string;
}) {
  const duration = parseRestDuration(label);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [added, setAdded] = useState(0);
  const deadline = useRef<number | null>(null);
  const handledToken = useRef(startToken ?? 0);
  const latest = useRef({ running, remaining });
  latest.current = { running, remaining };

  function start(seconds: number) {
    deadline.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
    setFinished(false);
    setRunning(true);
  }

  useEffect(() => {
    setRunning(false);
    setRemaining(null);
    setFinished(false);
    setAdded(0);
    deadline.current = null;
  }, [label]);

  useEffect(() => {
    if (startToken === undefined || startToken === handledToken.current) return;
    handledToken.current = startToken;
    if (duration !== null && startToken > 0) {
      setAdded(0);
      start(duration);
    }
  }, [duration, startToken]);

  useEffect(() => {
    if (!running) return;
    function update() {
      const next = Math.max(0, Math.ceil(((deadline.current ?? Date.now()) - Date.now()) / 1000));
      if (next === 0) {
        setRunning(false);
        setRemaining(null);
        setFinished(true);
        deadline.current = null;
      } else setRemaining(next);
    }
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [running]);

  if (duration === null) return <p className="mt-3 text-xs text-muted-foreground">{label}</p>;

  function toggle() {
    if (latest.current.running) {
      const seconds = Math.max(
        0,
        Math.ceil(((deadline.current ?? Date.now()) - Date.now()) / 1000),
      );
      setRunning(false);
      deadline.current = null;
      setRemaining(seconds > 0 ? seconds : null);
      setFinished(seconds === 0);
    } else start(latest.current.remaining ?? duration!);
  }

  function extend() {
    const current = latest.current.running
      ? Math.max(0, Math.ceil(((deadline.current ?? Date.now()) - Date.now()) / 1000))
      : (latest.current.remaining ?? (finished ? 0 : duration!));
    const seconds = Math.min(7200, current + 30);
    if (latest.current.running) deadline.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
    setAdded((value) => value + seconds - current);
    setFinished(false);
  }

  return (
    <div className={`bw-sprint-rest ${compact ? "bw-sprint-rest-compact" : ""}`}>
      <span className="bw-rest-label">Przerwa</span>
      <span
        className="bw-rest-time"
        role={remaining === null ? undefined : "timer"}
        aria-label={remaining === null ? undefined : "Pozostały czas przerwy"}
      >
        {formatRestTime(remaining ?? (finished ? 0 : duration))}
      </span>
      <div className="bw-rest-controls">
        <button type="button" className="bw-rest-play min-h-11 min-w-11" onClick={toggle}>
          {running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span className="sr-only">{running ? "Pauza" : "Start"}</span>
        </button>
        <button
          type="button"
          onClick={extend}
          className="min-h-11 px-2 text-xs font-semibold text-primary"
          aria-label="Wydłuż przerwę o 30 sekund"
        >
          +30 s
        </button>
        {remaining !== null && (
          <button
            type="button"
            className="bw-rest-reset min-h-11"
            onClick={() => {
              setRunning(false);
              setRemaining(null);
              setFinished(false);
              setAdded(0);
              deadline.current = null;
            }}
          >
            <RotateCcw aria-hidden="true" />
            <span>Reset</span>
          </button>
        )}
      </div>
      <span className="bw-rest-prescription">
        {label}
        {added > 0 ? ` · dodano ${added} s` : ""}
      </span>
      {nextLabel && <span className="block text-xs text-muted-foreground">Dalej: {nextLabel}</span>}
      {finished && (
        <span className="bw-rest-finished" role="status">
          Przerwa zakończona
        </span>
      )}
    </div>
  );
}
