import type { LoadwiseState, SessionHistoryRecord } from "../types";

/** A slow startup read must not undo a click or a save made while it was in flight. */
export function mergeHydratedRecord<T>(
  current: Record<string, T>,
  baseline: Record<string, T>,
  remote: Record<string, T>,
): Record<string, T> {
  if (current === baseline) return remote;
  const merged = { ...remote };
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    if (current[key] === baseline[key]) continue;
    if (Object.hasOwn(current, key)) merged[key] = current[key];
    else delete merged[key];
  }
  return merged;
}

export function hasLocalPlanChanges(current: LoadwiseState, baseline: LoadwiseState): boolean {
  return (
    current.profile !== baseline.profile ||
    current.plan !== baseline.plan ||
    current.modifications !== baseline.modifications ||
    current.transitions !== baseline.transitions ||
    current.exerciseReplacements !== baseline.exerciseReplacements
  );
}

export function mergeHydratedHistory(
  current: SessionHistoryRecord[],
  baseline: SessionHistoryRecord[],
  remote: SessionHistoryRecord[],
): SessionHistoryRecord[] {
  const byKey = (rows: SessionHistoryRecord[]) =>
    Object.fromEntries(rows.map((row) => [row.key, row]));
  return Object.values(mergeHydratedRecord(byKey(current), byKey(baseline), byKey(remote))).sort(
    (a, b) => b.date.localeCompare(a.date),
  );
}

export function mergeHydratedState(
  current: LoadwiseState,
  baseline: LoadwiseState,
  remote: LoadwiseState,
): LoadwiseState {
  // These fields describe one plan revision; keep them together after a local edit.
  const planChanged = hasLocalPlanChanges(current, baseline);
  return {
    ...remote,
    ...(planChanged
      ? {
          profile: current.profile,
          plan: current.plan,
          planGeneratedFor: current.planGeneratedFor,
          modifications: current.modifications,
          transitions: current.transitions,
          exerciseReplacements: current.exerciseReplacements,
          planChangeEvents: current.planChangeEvents,
        }
      : {}),
    completions: mergeHydratedRecord(current.completions, baseline.completions, remote.completions),
    readiness: mergeHydratedRecord(current.readiness, baseline.readiness, remote.readiness),
    runningActivities: mergeHydratedRecord(
      current.runningActivities,
      baseline.runningActivities,
      remote.runningActivities,
    ),
    history: current.history === baseline.history ? remote.history : current.history,
  };
}
