import { useEffect, useMemo, useState } from "react";
import { imageryFor, totalSeconds } from "./engine";
import type { ImageryStep, Position, Vec } from "./engine";

function Board({ step }: { step: ImageryStep }) {
  const pts = [...(step.path ?? []), ...(step.ball ?? [])];
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  // połowa boiska, po której toczy się akcja
  const x0 = Math.min(...xs) < 52 ? 0 : 52;
  const d = (ps: Vec[]) => ps.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const me = step.path?.[0];
  return (
    <svg viewBox={`${x0 - 1} -1 55 70`} className="w-full rounded-2xl bg-hairline/60" aria-hidden="true">
      <rect x="0" y="0" width="105" height="68" fill="none" stroke="#ffffff" strokeWidth="0.5" />
      <line x1="52.5" x2="52.5" y1="0" y2="68" stroke="#ffffff" strokeWidth="0.4" />
      <rect x="88.5" y="13.8" width="16.5" height="40.3" fill="none" stroke="#ffffff" strokeWidth="0.4" />
      <rect x="0" y="13.8" width="16.5" height="40.3" fill="none" stroke="#ffffff" strokeWidth="0.4" />
      {step.ball && <path d={d(step.ball)} fill="none" stroke="#6b7a90" strokeWidth="0.5" strokeDasharray="1.4 1" />}
      {step.path && step.path.length > 1 && <path d={d(step.path)} fill="none" stroke="#1b2a41" strokeWidth="0.5" />}
      {me && step.path && (
        <circle r="1.6" fill="#1b2a41">
          <animateMotion dur={`${Math.min(6, step.seconds / 4)}s`} repeatCount="indefinite" path={d(step.path)} />
        </circle>
      )}
    </svg>
  );
}

/** Prowadzona wizualizacja: kroki przechodzą same, można pauzować i przeskoczyć. */
export function MatchInMind({ position, onClose }: { position: Position; onClose: () => void }) {
  const steps = useMemo(() => imageryFor(position), [position]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(steps[0]!.seconds);
  const [paused, setPaused] = useState(false);
  const step = steps[i]!;
  const done = i >= steps.length - 1 && left <= 0;

  useEffect(() => {
    if (paused || done) return;
    const id = setInterval(() => {
      setLeft((l) => {
        if (l > 1) return l - 1;
        if (i < steps.length - 1) { setI(i + 1); return steps[i + 1]!.seconds; }
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, i, steps, done]);

  const go = (n: number) => { const k = Math.max(0, Math.min(steps.length - 1, n)); setI(k); setLeft(steps[k]!.seconds); };
  const breathing = step.title === "Oddech";

  return (
    <div className="bw-sheet fixed inset-0 z-30 flex flex-col bg-canvas px-5 pb-10 pt-14">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">Mecz w głowie · {i + 1}/{steps.length}</span>
        <button onClick={onClose} className="text-sm text-muted">Zamknij</button>
      </div>
      <div className="mb-5 flex gap-1">
        {steps.map((_, k) => <div key={k} className={`h-0.5 flex-1 rounded-full ${k <= i ? "bg-accent" : "bg-hairline"}`} />)}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-2 text-base leading-relaxed text-ink/80">{step.cue}</p>
      <div className="mt-6 flex-1">
        {breathing ? (
          <div className="flex h-56 items-center justify-center">
            <div className="h-24 w-24 rounded-full border border-ink/30" style={{ animation: paused ? "none" : "bw-breathe 10s ease-in-out infinite" }} />
          </div>
        ) : (
          <Board step={step} />
        )}
      </div>
      <p className="mb-4 text-center text-sm tabular-nums text-muted">{done ? "Gotowe" : `${left} s`}</p>
      <div className="flex gap-2">
        <button onClick={() => go(i - 1)} className="rounded-xl border border-hairline px-4 py-3 text-sm">Wstecz</button>
        <button onClick={() => (done ? onClose() : setPaused(!paused))} className="flex-1 rounded-xl bw-grad py-3 text-sm font-medium text-card">
          {done ? "Zakończ" : paused ? "Wznów" : "Pauza"}
        </button>
        <button onClick={() => go(i + 1)} className="rounded-xl border border-hairline px-4 py-3 text-sm">Dalej</button>
      </div>
    </div>
  );
}

export function imageryMinutes(position: Position): number {
  return Math.round(totalSeconds(imageryFor(position)) / 60);
}
