import type { MethodExecution } from "./types";
export interface MethodClockState {
  phase: "idle" | "work" | "rest" | "done";
  round: number;
  repetition: number;
  group: number;
  paused: boolean;
  deadline: number | null;
  remainingMs: number;
}
export const initialMethodClock = (): MethodClockState => ({
  phase: "idle",
  round: 0,
  repetition: 0,
  group: 0,
  paused: false,
  deadline: null,
  remainingMs: 0,
});
const timedWork = (p: MethodExecution) =>
  p.mode !== "cluster" && Number.isFinite(p.workSeconds) && p.workSeconds! > 0;
const startWork = (p: MethodExecution, s: MethodClockState, now: number): MethodClockState => ({
  ...s,
  phase: "work",
  paused: false,
  remainingMs: timedWork(p) ? p.workSeconds! * 1000 : 0,
  deadline: timedWork(p) ? now + p.workSeconds! * 1000 : null,
});
export function startMethodClock(p: MethodExecution, now: number): MethodClockState {
  return startWork(p, initialMethodClock(), now);
}
function afterWork(p: MethodExecution, s: MethodClockState, now: number): MethodClockState {
  const groups = p.mode === "cluster" ? (p.repGroups?.length ?? 1) : 1;
  const nextGroup = s.group + 1 < groups,
    nextRep = !nextGroup && s.repetition + 1 < (p.mode === "cluster" ? 1 : p.repetitions),
    nextRound = !nextGroup && !nextRep && s.round + 1 < p.rounds;
  if (!nextGroup && !nextRep && !nextRound)
    return { ...s, phase: "done", deadline: null, remainingMs: 0, paused: false };
  const rest = nextRound ? p.roundRestSeconds || p.restSeconds : p.restSeconds;
  const next = {
    ...s,
    group: nextGroup ? s.group + 1 : 0,
    repetition: nextRep ? s.repetition + 1 : nextRound ? 0 : s.repetition,
    round: nextRound ? s.round + 1 : s.round,
  };
  return rest > 0
    ? { ...next, phase: "rest", deadline: now + rest * 1000, remainingMs: rest * 1000 }
    : startWork(p, next, now);
}
/** Manual distance/repetition work only advances after the athlete confirms a trial. */
export function completeManualMethodWork(
  p: MethodExecution,
  s: MethodClockState,
  now: number,
): MethodClockState {
  return s.phase === "work" && !s.paused && !timedWork(p) ? afterWork(p, s, now) : s;
}
export function advanceMethodClock(
  p: MethodExecution,
  s: MethodClockState,
  now: number,
): MethodClockState {
  if (s.paused || s.deadline === null || s.phase === "idle" || s.phase === "done") return s;
  let next = s,
    guard = 0;
  while (next.deadline !== null && now >= next.deadline && guard++ < 500) {
    const at = next.deadline;
    next = next.phase === "rest" ? startWork(p, next, at) : afterWork(p, next, at);
  }
  return next;
}
export function pauseMethodClock(
  p: MethodExecution,
  s: MethodClockState,
  now: number,
): MethodClockState {
  const current = advanceMethodClock(p, s, now);
  if (current.phase === "idle" || current.phase === "done") return current;
  return {
    ...current,
    paused: true,
    remainingMs: current.deadline === null ? 0 : Math.max(0, current.deadline - now),
    deadline: null,
  };
}
export function resumeMethodClock(
  p: MethodExecution,
  s: MethodClockState,
  now: number,
): MethodClockState {
  if (!s.paused) return s;
  return {
    ...s,
    paused: false,
    deadline: s.phase === "rest" || timedWork(p) ? now + s.remainingMs : null,
  };
}
export function velocityLoss(
  values: number[],
  limitPct: number,
): { lossPct: number | null; stop: boolean; error: string | null } {
  if (!Number.isFinite(limitPct) || limitPct < 5 || limitPct > 50)
    return { lossPct: null, stop: false, error: "Ustaw z trenerem próg od 5 do 50%." };
  if (values.some((v) => !Number.isFinite(v) || v < 0.05 || v > 4))
    return {
      lossPct: null,
      stop: false,
      error:
        "Wpisz ważne prędkości koncentryczne od 0,05 do 4 m/s, w tej samej metryce urządzenia.",
    };
  if (values.length < 2) return { lossPct: null, stop: false, error: null };
  const best = Math.max(...values),
    lossPct = Math.max(0, ((best - values[values.length - 1]) / best) * 100);
  return { lossPct, stop: lossPct + 1e-8 >= limitPct, error: null };
}
