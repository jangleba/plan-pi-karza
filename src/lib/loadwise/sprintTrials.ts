import type { HistorySetLog } from "./setLogHistory";

export interface TrialConditions {
  distanceM: number;
  startType: "standing" | "flying";
  method: "manual_stopwatch" | "video_reviewed";
}

/** Conditions a trial was recorded under; null when any of them is unknown (older rows). */
export function trialConditions(log: HistorySetLog): TrialConditions | null {
  if (
    !log.metricKind?.startsWith("sprint_") ||
    typeof log.distanceM !== "number" ||
    !(log.distanceM > 0) ||
    !log.startType ||
    !log.measurementMethod
  )
    return null;
  return { distanceM: log.distanceM, startType: log.startType, method: log.measurementMethod };
}

export type TrialComparison =
  | { comparable: true }
  | { comparable: false; reason: "unknown_conditions" | "distance" | "start" | "method" };

/** Two trials are compared only when distance, kind of start and measurement method all match. */
export function compareTrials(a: HistorySetLog, b: HistorySetLog): TrialComparison {
  const x = trialConditions(a);
  const y = trialConditions(b);
  if (!x || !y) return { comparable: false, reason: "unknown_conditions" };
  if (x.distanceM !== y.distanceM) return { comparable: false, reason: "distance" };
  if (x.startType !== y.startType) return { comparable: false, reason: "start" };
  if (x.method !== y.method) return { comparable: false, reason: "method" };
  return { comparable: true };
}

export const TRIAL_REASON_TEXT: Record<
  Extract<TrialComparison, { comparable: false }>["reason"],
  string
> = {
  unknown_conditions: "brak zapisanego dystansu, startu lub metody pomiaru",
  distance: "inny dystans",
  start: "inny rodzaj startu",
  method: "inna metoda pomiaru (ręczny pomiar i sprawdzony film nie są porównywane)",
};

/** Fastest earlier trial recorded under the same conditions; never mixes conditions. */
export function bestComparableTrial(
  current: HistorySetLog,
  earlier: readonly HistorySetLog[],
): { best: HistorySetLog | null; skipped: number } {
  let best: HistorySetLog | null = null;
  let skipped = 0;
  for (const trial of earlier) {
    if (typeof trial.metricValue !== "number") continue;
    if (!compareTrials(current, trial).comparable) {
      skipped += 1;
      continue;
    }
    if (!best || trial.metricValue < (best.metricValue as number)) best = trial;
  }
  return { best, skipped };
}
