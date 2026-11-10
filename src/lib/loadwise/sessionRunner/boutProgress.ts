import type { Range } from "./presentation";

/**
 * Progress through the bouts of one task: sets or sprint repetitions, and
 * for one-sided work the left and right side of every set. Each bout is a
 * separate, explicit confirmation — nothing is ticked off by moving on.
 */
export interface BoutProgress {
  /** Confirmed bouts, counted from 0. */
  done: number;
}

export interface Bout {
  /** 1-based set or repetition number. */
  set: number;
  side: "Lewa" | "Prawa" | null;
}

export function boutsPerSet(unilateral: boolean): number {
  return unilateral ? 2 : 1;
}

export function boutAt(index: number, unilateral: boolean): Bout {
  const per = boutsPerSet(unilateral);
  return {
    set: Math.floor(index / per) + 1,
    side: unilateral ? (index % 2 === 0 ? "Lewa" : "Prawa") : null,
  };
}

/** Bouts needed for the minimum and the maximum planned sets. */
export function boutTargets(sets: Range, unilateral: boolean): { min: number; max: number } {
  const per = boutsPerSet(unilateral);
  return { min: Math.max(1, sets.min) * per, max: Math.max(1, sets.max) * per };
}

export function canFinishEarly(progress: BoutProgress, sets: Range, unilateral: boolean): boolean {
  const targets = boutTargets(sets, unilateral);
  return progress.done >= targets.min && progress.done < targets.max;
}

export function isComplete(progress: BoutProgress, sets: Range, unilateral: boolean): boolean {
  return progress.done >= boutTargets(sets, unilateral).max;
}

export function parseBoutProgress(value: unknown): BoutProgress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const done = (value as BoutProgress).done;
  return Number.isInteger(done) && done >= 0 && done <= 200 ? { done } : undefined;
}
