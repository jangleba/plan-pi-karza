import { supabase } from "@/integrations/supabase/client";
import { addIsoDays } from "@/lib/isoDate";
import { buildLabProgress } from "@/lib/progress/measurements";
import type { ProgressPeriod } from "@/lib/progress/progress";
import { loadBrowserResults } from "@/features/browser-lab/storage";
import {
  buildCycleReview,
  cycleStartRecord,
  plannedOwnSessions,
  type StrengthSetEntry,
  type TestChangeSummary,
} from "./cycleReview";
import { seasonPhaseForWeek } from "./offseasonPeriod";
import { historyCategoryOf } from "./store/model";
import type {
  CycleStartRecord,
  Profile,
  Readiness,
  SessionCompletion,
  SessionDay,
  SessionHistoryRecord,
  SessionModification,
} from "./types";

/** Podsumowanie liczymy tylko dla cyklu, który skończył się niedawno. */
export const CYCLE_REVIEW_MAX_AGE_DAYS = 21;

/** Zakończony cykl: ostatni dzień przed dziś i nie dawniej niż CYCLE_REVIEW_MAX_AGE_DAYS. */
export function endedCycleWindow(
  plan: readonly SessionDay[],
  todayIso: string,
): { startDate: string; endDate: string } | null {
  const dates = plan
    .map((day) => day.date)
    .filter(Boolean)
    .sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  if (!startDate || !endDate) return null;
  if (endDate >= todayIso) return null; // przebudowa w trakcie cyklu, a nie jego koniec
  if (endDate < addIsoDays(todayIso, -CYCLE_REVIEW_MAX_AGE_DAYS)) return null;
  return { startDate, endDate };
}

function localDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Zmiany wyników testów Lab w cyklu (cm: więcej = lepiej, s: mniej = lepiej). */
export function labChanges(userId: string, startDate: string, endDate: string): TestChangeSummary {
  const result: TestChangeSummary = { improved: 0, declined: 0, flat: 0 };
  let rows;
  try {
    rows = loadBrowserResults(userId);
  } catch {
    return result;
  }
  const days = Math.max(
    1,
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1,
  );
  for (const item of buildLabProgress(rows, endDate, days as ProgressPeriod)) {
    if (item.date < startDate || item.delta === null) continue;
    if (item.overlaps === true || item.delta === 0) {
      result.flat += 1;
      continue;
    }
    const better = item.unit === "cm" ? item.delta > 0 : item.delta < 0;
    if (better) result.improved += 1;
    else result.declined += 1;
  }
  return result;
}

async function loadStrengthSets(
  userId: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<StrengthSetEntry[]> {
  let query = supabase
    .from("exercise_set_logs")
    .select("exercise_key, performed_at, weight_kg, reps")
    .eq("user_id", userId)
    .gte("performed_at", `${addIsoDays(startDate, -1)}T00:00:00Z`)
    .lt("performed_at", `${addIsoDays(endDate, 2)}T00:00:00Z`)
    .limit(2000);
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  if (result.error) return [];
  return (
    (result.data ?? []) as {
      exercise_key: string;
      performed_at: string;
      weight_kg: number | null;
      reps: number | null;
    }[]
  ).map((row) => ({
    exerciseKey: row.exercise_key,
    date: localDate(row.performed_at),
    weightKg: row.weight_kg,
    reps: row.reps,
  }));
}

/**
 * Wykonane sesje cyklu z zapisów ukończenia: sesje planu i dodane/zamienione
 * (modyfikacje) — data i rodzaj z planu, bo dziennik ich nie ma.
 */
export function completedFromLogs(
  plan: readonly SessionDay[],
  modifications: readonly SessionModification[],
  completions: Record<string, SessionCompletion>,
): SessionHistoryRecord[] {
  const sessions = new Map<string, { date: string; session: SessionDay }>();
  for (const day of plan)
    for (const session of [day, day.secondSession])
      if (session?.dbId) sessions.set(session.dbId, { date: day.date, session });
  for (const mod of modifications)
    for (const session of [mod.session, mod.session?.secondSession])
      if (session?.dbId) sessions.set(session.dbId, { date: mod.date, session });
  const out: SessionHistoryRecord[] = [];
  for (const [key, completion] of Object.entries(completions)) {
    if (!completion.completed || completion.status === "missed") continue;
    const found = sessions.get(key);
    if (!found) continue;
    const category = historyCategoryOf(found.session.type ?? null, found.session.dayType);
    if (!category) continue;
    out.push({
      key,
      date: found.date,
      title: found.session.title,
      category,
      durationMin: completion.durationMin ?? found.session.durationMin ?? 0,
      rpe: completion.rpe,
      notes: "",
    });
  }
  return out;
}

/**
 * Gdy cykl się skończył: podsumowanie + reguła startu nowego cyklu dla silnika.
 * Wywoływane raz, przy generowaniu nowego cyklu. Bez nowego SQL.
 */
export async function reviewEndedCycle(input: {
  userId: string;
  todayIso: string;
  profile: Profile;
  plan: readonly SessionDay[];
  modifications: readonly SessionModification[];
  completions: Record<string, SessionCompletion>;
  readiness: readonly Readiness[];
  signal?: AbortSignal;
}): Promise<CycleStartRecord | null> {
  const window = endedCycleWindow(input.plan, input.todayIso);
  if (!window) return null;
  const strengthSets = await loadStrengthSets(
    input.userId,
    window.startDate,
    window.endDate,
    input.signal,
  ).catch(() => []);
  const review = buildCycleReview({
    ...window,
    planned: plannedOwnSessions(input.plan),
    history: completedFromLogs(input.plan, input.modifications, input.completions),
    readiness: input.profile.healthPersonalizationEnabled ? [...input.readiness] : [],
    strengthSets,
    tests: labChanges(input.userId, window.startDate, window.endDate),
    age: input.profile.age,
    phaseNext: seasonPhaseForWeek(input.profile, input.todayIso),
  });
  if (!review) return null;
  const cycleId = input.plan.find((day) => day.cycleId)?.cycleId ?? null;
  return cycleStartRecord(review, cycleId);
}

/** Wcześniejsze podsumowania cykli z zarchiwizowanych planów (tylko pierwszy dzień planu). */
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
  if (result.error) return [];
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
