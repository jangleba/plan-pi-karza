import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StrengthSetEntry } from "./cycleReview";
import { readAllPages } from "./pagination";
import type { SessionCompletion } from "./types";

export interface StrengthSetRow {
  session_id: string | null;
  exercise_key: string;
  weight_kg: number | string | null;
  reps: number | null;
  metric_kind: string | null;
  performed_at: string;
}

/**
 * Comparable strength sets from real logs. Only sets of a completed session count, with a
 * weight and repetitions (not an isometric hold or timer metric), and sets from a lighter
 * (deload) session are left out so a reduced load never reads as a decline.
 */
export function rowsToStrengthSets(
  rows: readonly StrengthSetRow[],
  completions: Record<string, SessionCompletion>,
): StrengthSetEntry[] {
  const out: StrengthSetEntry[] = [];
  for (const row of rows) {
    const completion = row.session_id ? completions[row.session_id] : undefined;
    if (!completion?.completed || completion.status === "missed") continue;
    if (row.metric_kind) continue;
    if (completion.executionSnapshot?.engineV2?.phase === "deload") continue;
    const weight = row.weight_kg === null ? null : Number(row.weight_kg);
    if (weight === null || !Number.isFinite(weight) || weight <= 0 || !row.reps || row.reps < 1)
      continue;
    out.push({
      exerciseKey: row.exercise_key,
      date: completion.executionSnapshot?.date ?? row.performed_at.slice(0, 10),
      weightKg: weight,
      reps: row.reps,
    });
  }
  return out;
}

export async function loadStrengthSetRows(
  userId: string,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<StrengthSetRow[]> {
  const result = await readAllPages(
    (from, to) =>
      supabase
        .from("exercise_set_logs")
        .select("session_id,exercise_key,weight_kg,reps,metric_kind,performed_at")
        .eq("user_id", userId)
        .gte("performed_at", `${fromDate}T00:00:00Z`)
        .lte("performed_at", `${toDate}T23:59:59Z`)
        .order("id")
        .range(from, to),
    signal,
  );
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as StrengthSetRow[];
}

/** Rows for a plan window; `null` while loading or when the read failed (shown as no data). */
export function useStrengthSetRows(
  userId: string | undefined,
  fromDate: string | undefined,
  toDate: string | undefined,
): StrengthSetRow[] | null {
  const [rows, setRows] = useState<StrengthSetRow[] | null>(null);
  useEffect(() => {
    if (!userId || !fromDate || !toDate) {
      setRows(null);
      return;
    }
    const controller = new AbortController();
    loadStrengthSetRows(userId, fromDate, toDate, controller.signal)
      .then((r) => !controller.signal.aborted && setRows(r))
      .catch(() => !controller.signal.aborted && setRows(null));
    return () => controller.abort();
  }, [userId, fromDate, toDate]);
  return rows;
}
