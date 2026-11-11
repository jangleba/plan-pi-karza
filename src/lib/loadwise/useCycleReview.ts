import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addIsoDays } from "@/lib/isoDate";
import { buildLabProgress } from "@/lib/progress/measurements";
import type { ProgressPeriod } from "@/lib/progress/progress";
import { loadBrowserResults } from "@/features/browser-lab/storage";
import {
  buildCycleReview,
  plannedOwnSessions,
  type CycleReview,
  type PlannedOwnSession,
  type StrengthSetEntry,
  type TestChangeSummary,
} from "./cycleReview";
import { seasonPhaseForWeek } from "./offseasonPeriod";
import type { Profile, Readiness, SessionDay, SessionHistoryRecord } from "./types";

/** Podsumowanie pokazujemy tylko dla cyklu, który skończył się niedawno. */
export const CYCLE_REVIEW_MAX_AGE_DAYS = 21;
const STORAGE_KEY = (userId: string) => `ballwise:cycle-review:v1:${userId}`;

type Store = Pick<Storage, "getItem" | "setItem">;

function safeStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function dismissedCycles(userId: string, store: Store | null = safeStore()): string[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(STORAGE_KEY(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function dismissCycle(userId: string, cycleId: string, store: Store | null = safeStore()) {
  try {
    const next = [...dismissedCycles(userId, store).filter((id) => id !== cycleId), cycleId];
    store?.setItem(STORAGE_KEY(userId), JSON.stringify(next.slice(-12)));
  } catch {
    // Prywatna karta / pełna pamięć: karta zniknie do końca sesji ekranu.
  }
}

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

interface EndedCycleData {
  cycleId: string;
  startDate: string;
  endDate: string;
  planned: PlannedOwnSession[];
  /** Ukończone zaplanowane sesje odczytane wprost z dziennika (zanim dojdzie pełna historia). */
  logged: SessionHistoryRecord[];
  strengthSets: StrengthSetEntry[];
  tests: TestChangeSummary;
}

async function loadEndedCycle(
  userId: string,
  currentCycleId: string,
  todayIso: string,
  signal: AbortSignal,
): Promise<EndedCycleData | null> {
  const planRes = await supabase
    .from("training_plans")
    .select("cycle_id, plan_json")
    .abortSignal(signal)
    .eq("user_id", userId)
    .eq("status", "archived")
    .neq("cycle_id", currentCycleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planRes.error || !planRes.data) return null;
  const cycleId = planRes.data.cycle_id ? String(planRes.data.cycle_id) : null;
  const plan = Array.isArray(planRes.data.plan_json)
    ? (planRes.data.plan_json as unknown as SessionDay[])
    : [];
  const window = endedCycleWindow(plan, todayIso);
  if (!cycleId || !window || dismissedCycles(userId).includes(cycleId)) return null;
  const planned = plannedOwnSessions(plan);
  const sessionsByKey = new Map<string, PlannedOwnSession>();
  for (const item of planned) if (item.key) sessionsByKey.set(item.key, item);

  const [logRes, setRes] = await Promise.all([
    sessionsByKey.size
      ? supabase
          .from("session_logs")
          .select("session_id, rpe, duration_minutes")
          .abortSignal(signal)
          .eq("user_id", userId)
          .eq("completed", true)
          .in("session_id", [...sessionsByKey.keys()])
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("exercise_set_logs")
      .select("exercise_key, performed_at, weight_kg, reps")
      .abortSignal(signal)
      .eq("user_id", userId)
      .gte("performed_at", `${window.startDate}T00:00:00`)
      .lt("performed_at", `${addIsoDays(window.endDate, 1)}T12:00:00`)
      .limit(2000),
  ]);
  const logged: SessionHistoryRecord[] = [];
  for (const row of (logRes.data ?? []) as {
    session_id: string | null;
    rpe: number | null;
    duration_minutes: number | null;
  }[]) {
    const item = row.session_id ? sessionsByKey.get(row.session_id) : undefined;
    if (!item || !row.session_id) continue;
    logged.push({
      key: row.session_id,
      date: item.date,
      title: "",
      category: item.category as SessionHistoryRecord["category"],
      durationMin: row.duration_minutes ?? 0,
      rpe: row.rpe,
      notes: "",
    });
  }
  const strengthSets: StrengthSetEntry[] = setRes.error
    ? []
    : (
        (setRes.data ?? []) as {
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
  return {
    cycleId,
    ...window,
    planned,
    logged,
    strengthSets,
    tests: labChanges(userId, window.startDate, window.endDate),
  };
}

/**
 * Podsumowanie poprzedniego cyklu na ekranie Start — raz na cykl, do kliknięcia
 * „Zaczynam nowy cykl”. Bez nowego SQL: poprzedni cykl to zarchiwizowany plan.
 */
export function useCycleReview({
  userId,
  currentCycleId,
  todayIso,
  profile,
  history,
  readiness,
  enabled,
}: {
  userId: string | null | undefined;
  currentCycleId: string | null | undefined;
  todayIso: string;
  profile: Profile | null;
  history: SessionHistoryRecord[];
  readiness: Record<string, Readiness>;
  enabled: boolean;
}): { review: CycleReview | null; dismiss: () => void } {
  const [data, setData] = useState<EndedCycleData | null>(null);
  useEffect(() => {
    setData(null);
    if (!enabled || !userId || !currentCycleId) return;
    const controller = new AbortController();
    loadEndedCycle(userId, currentCycleId, todayIso, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, userId, currentCycleId, todayIso]);

  const review = useMemo(() => {
    if (!data || !profile) return null;
    const known = new Set(history.map((row) => row.key));
    return buildCycleReview({
      startDate: data.startDate,
      endDate: data.endDate,
      planned: data.planned,
      history: [...history, ...data.logged.filter((row) => !known.has(row.key))],
      readiness: Object.values(readiness),
      strengthSets: data.strengthSets,
      tests: data.tests,
      age: profile.age,
      phaseNext: seasonPhaseForWeek(profile, todayIso),
    });
  }, [data, profile, history, readiness, todayIso]);

  return {
    review,
    dismiss: () => {
      if (userId && data) dismissCycle(userId, data.cycleId);
      setData(null);
    },
  };
}
