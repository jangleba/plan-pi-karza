import type { SessionCompletion, TrainingExercise } from "./types";

export interface HistorySetLog {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  metricKind?: string | null;
  metricValue?: number | null;
}

export interface HistorySetLogRow {
  session_id: string | null;
  set_number: number;
  weight_kg: number | string | null;
  reps: number | null;
  rir: number | null;
  metric_kind?: string | null;
  metric_value?: number | string | null;
  performed_at: string;
}

export interface ExerciseSessionLog {
  sessionKey: string;
  performedAt: string;
  sets: HistorySetLog[];
  /** Present only when the completed execution snapshot proves this prescription. */
  verification?: {
    expectedSets: number;
    prescriptionKey: string;
  };
}

export function exerciseHistoryKey(e: Pick<TrainingExercise, "exerciseId" | "name">): string {
  return (e.exerciseId?.trim() || e.name.trim().toLowerCase()).slice(0, 120);
}

export function plannedExerciseSets(e: Pick<TrainingExercise, "sets" | "displayPrescription">): number {
  if (typeof e.sets === "number" && Number.isFinite(e.sets)) return Math.max(0, Math.round(e.sets));
  const explicit = String(e.sets ?? "").trim().match(/^(\d+)(?:\s*[–-]\s*\d+)?$/);
  if (explicit) return Number(explicit[1]);
  const match = String(e.displayPrescription ?? "").match(/(\d+)\s*(?:serie|serii|seria|×)/i);
  return match ? Number(match[1]) : 0;
}

type ComparableExercise = Pick<TrainingExercise, "sets" | "displayPrescription" | "reps" | "rir" | "tempo">;

/** Do not compare results from a different dose or tempo as two stable exposures. */
export function exercisePrescriptionKey(exercise: ComparableExercise): string {
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase()
    .replace(/[–—]/g, "-").replace(/\s+/g, "").replace(/,/g, ".");
  return JSON.stringify([
    plannedExerciseSets(exercise), normalize(exercise.reps), normalize(exercise.rir), normalize(exercise.tempo),
  ]);
}

/**
 * Uses already hydrated, user-scoped completions. Unknown/unfinished legacy logs
 * remain useful for “Ostatnio”, but cannot authorise a load increase.
 */
export function verifyExerciseHistory(
  history: ExerciseSessionLog[],
  exerciseKey: string,
  completions: Record<string, SessionCompletion>,
): ExerciseSessionLog[] {
  return history.map(source => {
    const item = { ...source, verification: undefined };
    const completion = completions[item.sessionKey];
    const snapshot = completion?.executionSnapshot;
    if (!completion?.completed || completion.status === "started" || completion.status === "missed" ||
        !snapshot || (snapshot.dbId && snapshot.dbId !== item.sessionKey)) return item;
    const structured = snapshot.structuredSections?.flatMap(section =>
      section.blocks.flatMap(block => block.exercises)) ?? [];
    const exercises = structured.length ? structured : Object.values(snapshot.sections ?? {}).flat();
    const candidates = exercises.filter(exercise => typeof exercise?.name === "string" &&
      exerciseHistoryKey(exercise) === exerciseKey && !exercise.executionBlockedReason);
    // Repeated occurrences in a session are ambiguous without per-block log keys.
    if (candidates.length !== 1) return item;
    const expectedSets = plannedExerciseSets(candidates[0]);
    if (expectedSets < 1) return item;
    return { ...item, verification: { expectedSets, prescriptionKey: exercisePrescriptionKey(candidates[0]) } };
  });
}

export function toSetLog(row: HistorySetLogRow): HistorySetLog {
  return {
    setNumber: row.set_number,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    reps: row.reps,
    rir: row.rir,
    metricKind: row.metric_kind ?? null,
    metricValue:
      row.metric_value === null || row.metric_value === undefined ? null : Number(row.metric_value),
  };
}

/** Ostatnie 2–3 ekspozycje; samo istnienie wpisu nie dowodzi ukończenia sesji. */
export function previousExerciseSessions(
  rows: HistorySetLogRow[],
  currentSessionId: string | null | undefined,
  limit = 3,
): ExerciseSessionLog[] {
  const groups = new Map<string, HistorySetLogRow[]>();
  for (const row of rows) {
    if (currentSessionId && row.session_id === currentSessionId) continue;
    const key = row.session_id ?? row.performed_at.slice(0, 10);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([sessionKey, group]) => ({
      sessionKey,
      performedAt: group.map((row) => row.performed_at).sort((a, b) => b.localeCompare(a))[0],
      // Pending offline writes may overlay a server row for the same set.
      sets: [...group.reduce((sets, row) => {
        const old = sets.get(row.set_number);
        if (!old || row.performed_at >= old.performed_at) sets.set(row.set_number, row);
        return sets;
      }, new Map<number, HistorySetLogRow>()).values()]
        .sort((a, b) => a.set_number - b.set_number).map(toSetLog),
    }))
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, Math.max(1, limit));
}

