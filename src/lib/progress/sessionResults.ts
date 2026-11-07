import type { SessionDay } from "@/lib/loadwise/types";
import { exerciseHistoryKey } from "@/lib/loadwise/setLogHistory";
import { canonicalExerciseName } from "@/lib/loadwise/sessionPresentation";
import { getExerciseDefinition } from "@/lib/loadwise/exerciseLibrary";
import {
  EXECUTION_PREFIX,
  executionKey,
  sessionExercises,
  timingSource,
} from "@/lib/loadwise/sessionExecution";
export interface SessionResultRow {
  exercise_key: string;
  exercise_name?: string | null;
  set_number: number;
  weight_kg: number | string | null;
  reps: number | null;
  rir: number | null;
  metric_kind: string | null;
  metric_value: number | string | null;
  performed_at: string;
  session_id?: string | null;
}
export function groupSessionResults(rows: SessionResultRow[], snapshot?: SessionDay | null) {
  const exercises = snapshot ? sessionExercises(snapshot) : [];
  const names = new Map(exercises.map((e) => [exerciseHistoryKey(e), canonicalExerciseName(e)]));
  const currentMarkers = new Map(exercises.map((e) => [executionKey(e), e.name]));
  const latest = new Map<string, SessionResultRow>();
  for (const row of rows) {
    const key = `${row.exercise_key}:${row.set_number}`;
    const old = latest.get(key);
    if (!old || old.performed_at <= row.performed_at) latest.set(key, row);
  }
  const marked = [...latest.values()].filter(
    (r) =>
      r.metric_kind === "completion" &&
      Number(r.metric_value) === 1 &&
      (!snapshot || currentMarkers.has(r.exercise_key) || r.exercise_key.startsWith("recovery:")),
  );
  const groups = new Map<string, { key: string; name: string; sets: SessionResultRow[] }>();
  for (const row of latest.values()) {
    if (row.exercise_key.startsWith(EXECUTION_PREFIX) || row.metric_kind === "completion") continue;
    const definition = getExerciseDefinition(row.exercise_key);
    const name =
      names.get(row.exercise_key) ||
      row.exercise_name ||
      definition?.displayNamePl ||
      definition?.name ||
      (/run-clock/.test(row.exercise_key) ? "Bieg bez GPS" : row.exercise_key);
    const group = groups.get(row.exercise_key) ?? { key: row.exercise_key, name, sets: [] };
    group.sets.push(row);
    groups.set(row.exercise_key, group);
  }
  return {
    marked: marked.length,
    markedNames: marked.map(
      (r) => r.exercise_name || currentMarkers.get(r.exercise_key) || "Ćwiczenie",
    ),
    total: [...latest.values()].some((r) => r.exercise_key.startsWith("recovery:"))
      ? [...latest.values()].filter((r) => r.exercise_key.startsWith("recovery:")).length
      : exercises.length,
    groups: [...groups.values()].map((g) => ({
      ...g,
      sets: g.sets.sort((a, b) => a.set_number - b.set_number),
    })),
  };
}
export function resultSetLabel(row: SessionResultRow) {
  if (row.weight_kg != null)
    return `${Number(row.weight_kg).toLocaleString("pl-PL")} kg × ${row.reps ?? "—"}${row.rir == null ? "" : ` · zapas ${row.rir}`}`;
  if ((row.metric_kind == null || row.metric_kind === "load") && row.reps != null)
    return `${row.reps} powtórzeń${row.rir == null ? "" : ` · zapas ${row.rir}`}`;
  if (row.metric_kind?.startsWith("sprint_"))
    return `${Number(row.metric_value).toFixed(3)} s · ${timingSource(row.metric_kind) ?? "Czas"}`;
  const unit =
    row.metric_kind === "distance" ? "m" : row.metric_kind === "contacts" ? "kontaktów" : "s";
  return row.metric_value == null
    ? "Zapis bez wartości"
    : `${Number(row.metric_value).toLocaleString("pl-PL")} ${unit}${row.metric_kind === "run_clock_partial" ? " · część odcinka" : ""}${row.metric_kind === "run_rest" ? " · przerwa" : ""}`;
}
