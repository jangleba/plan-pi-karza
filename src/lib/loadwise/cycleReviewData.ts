import { supabase } from "@/integrations/supabase/client";
import type { CycleStartRecord } from "./types";

/** Wcześniejsze podsumowania cykli z zarchiwizowanych planów (tylko pierwszy dzień planu). Błąd odczytu: wyjątek. */
export async function loadPastCycleReviews(
  userId: string,
  signal?: AbortSignal,
): Promise<CycleStartRecord[]> {
  let query = supabase
    .from("training_plans")
    .select("cycle_id, created_at, start:plan_json->0->cycleStart")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  // A failed read is reported, so the caller keeps what it already shows instead of "no summaries".
  if (result.error) throw new Error(result.error.message);
  const seen = new Set<string>();
  const out: CycleStartRecord[] = [];
  for (const row of (result.data ?? []) as unknown as { start: CycleStartRecord | null }[]) {
    const record = row.start;
    if (!record?.review || typeof record.review.endDate !== "string") continue;
    const key = record.reviewedCycleId ?? record.review.endDate;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}
