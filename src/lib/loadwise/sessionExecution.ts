import type { SessionCompletion, SessionDay, TrainingExercise } from "./types";
import { exerciseHistoryKey } from "./setLogHistory";
import { trainingFingerprint } from "./trainingDetails";

export const EXECUTION_PREFIX = "done:v1:";
/** A stable dose-specific key; a changed prescription cannot inherit completion. */
export function executionKey(exercise: TrainingExercise) {
  const value = trainingFingerprint([exercise]);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `${EXECUTION_PREFIX}${exerciseHistoryKey(exercise).slice(0, 75)}:${(hash >>> 0).toString(16)}`;
}
export function sessionExercises(session: SessionDay): TrainingExercise[] {
  if (session.structuredSections?.length)
    return session.structuredSections.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
  return [];
}
export function measuredSessionMinutes(
  completion?: SessionCompletion,
  now = Date.now(),
): number | null {
  if (completion?.durationMin != null) return completion.durationMin;
  const start = Date.parse(completion?.startedAt ?? "");
  const end = completion?.endedAt ? Date.parse(completion.endedAt) : now;
  const minutes = Math.round((end - start) / 60000);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 300 ? minutes : null;
}
export function timingSource(kind?: string | null) {
  return kind?.startsWith("sprint_video:")
    ? "Film Lab"
    : kind === "sprint_manual"
      ? "Wpis ręczny"
      : null;
}
