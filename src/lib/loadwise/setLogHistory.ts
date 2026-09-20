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
}

function toHistoryLog(row: HistorySetLogRow): HistorySetLog {
  return {
    setNumber: row.set_number,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    reps: row.reps,
    rir: row.rir,
    metricKind: row.metric_kind ?? null,
    metricValue:
      row.metric_value === null || row.metric_value === undefined
        ? null
        : Number(row.metric_value),
  };
}

/** Ostatnie 2–3 pełne ekspozycje na ćwiczenie, od najnowszej. */
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
      performedAt: group
        .map((row) => row.performed_at)
        .sort((a, b) => b.localeCompare(a))[0],
      sets: group.sort((a, b) => a.set_number - b.set_number).map(toHistoryLog),
    }))
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, Math.max(1, limit));
}
