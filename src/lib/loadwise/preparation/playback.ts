import type { PreparationStep } from "./protocols";
export interface PreparationPlayback {
  index: number;
  remainingMs: number | null;
  running: boolean;
  anchorMs: number;
  started: boolean;
  finished: boolean;
  skipped: number[];
}
export function initialPlayback(steps: PreparationStep[]): PreparationPlayback {
  return {
    index: 0,
    remainingMs: steps[0]?.seconds != null ? steps[0].seconds * 1000 : null,
    running: false,
    anchorMs: 0,
    started: false,
    finished: steps.length === 0,
    skipped: [],
  };
}
export function pausePlayback(state: PreparationPlayback, now: number): PreparationPlayback {
  return { ...state, running: false, remainingMs: remainingPlaybackMs(state, now), anchorMs: now };
}
export function remainingPlaybackMs(state: PreparationPlayback, now: number): number | null {
  if (state.remainingMs == null) return null;
  return Math.max(0, state.remainingMs - (state.running ? Math.max(0, now - state.anchorMs) : 0));
}
export function startPlayback(state: PreparationPlayback, now: number): PreparationPlayback {
  return state.finished ? state : { ...state, started: true, running: true, anchorMs: now };
}
export function nextPlayback(
  state: PreparationPlayback,
  steps: PreparationStep[],
  now: number,
  skipExercise = false,
): PreparationPlayback {
  const current = steps[state.index];
  if (!current || state.finished) return state;
  let nextIndex = state.index + 1;
  if (skipExercise) while (steps[nextIndex]?.exerciseIndex === current.exerciseIndex) nextIndex++;
  const next = steps[nextIndex];
  return {
    ...state,
    index: nextIndex,
    remainingMs: next?.seconds != null ? next.seconds * 1000 : null,
    anchorMs: now,
    finished: !next,
    running: Boolean(next) && state.running,
    skipped: skipExercise ? [...new Set([...state.skipped, current.exerciseIndex])] : state.skipped,
  };
}
export function tickPlayback(
  state: PreparationPlayback,
  steps: PreparationStep[],
  now: number,
): PreparationPlayback {
  // At most one transition: a blocked tab never silently consumes several exercises.
  return state.running && state.remainingMs != null && remainingPlaybackMs(state, now) === 0
    ? nextPlayback(state, steps, now)
    : state;
}
export function parsePlayback(raw: unknown): PreparationPlayback | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (
    !Number.isInteger(r.index) ||
    Number(r.index) < 0 ||
    Number(r.index) > 500 ||
    (r.remainingMs !== null &&
      (typeof r.remainingMs !== "number" ||
        !Number.isFinite(r.remainingMs) ||
        r.remainingMs < 0 ||
        r.remainingMs > 3_600_000)) ||
    typeof r.started !== "boolean" ||
    typeof r.finished !== "boolean" ||
    !Array.isArray(r.skipped)
  )
    return undefined;
  return {
    index: Number(r.index),
    remainingMs: r.remainingMs as number | null,
    started: r.started,
    finished: r.finished,
    skipped: r.skipped.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 100),
    running: false,
    anchorMs: 0,
  };
}
