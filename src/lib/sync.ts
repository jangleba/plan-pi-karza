import type { CheckIn, Profile, WeightLog } from "../engine";
import { supabase } from "./supabase";
import {
  checkInToRow, parseProfile, rowToCheckIn, rowsToWeightLog, toRemoteProfile, weightLogToRows,
  type WeightRow,
} from "./sync-map";

import { getScope } from "./store";
import { loadConsent } from "../legal/consent";

/**
 * Identyfikator użytkownika, ale TYLKO gdy bieżąca przestrzeń danych należy do tego samego konta.
 * Dzięki temu dane jednego konta (lub gościa) nie mogą zostać wysłane na inne konto, np. po zmianie sesji.
 */
export async function uid(): Promise<string | null> {
  if (!supabase) return null;
  const scope = getScope();
  if (scope.kind !== "user") return null;
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id ?? null;
  return id !== null && id === scope.id ? id : null;
}

/** Dane zdrowotne/samopoczucia (check-in, masa, MAS) idą do chmury tylko po jawnej, odwoływalnej zgodzie na tę synchronizację. */
const healthSyncOn = (): boolean => loadConsent("health_sync").granted;

/** Zapisy do chmury są „po cichu": błąd sieci nie psuje pracy offline. */
async function safe(fn: () => PromiseLike<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    /* brak sieci – dane zostają lokalnie */
  }
}

export async function pushProfile(p: Profile): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id) return;
  const data = toRemoteProfile(p, new Date().toISOString().slice(0, 10)); // jawny kontrakt pól; null = osoba poniżej progu wieku
  if (!data) return;
  await safe(() => supabase!.from("profiles").upsert({ user_id, data, updated_at: new Date().toISOString() }));
}

export async function pushMas(distance_m: number): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id || !healthSyncOn()) return;
  await safe(() => supabase!.from("mas_tests").insert({ user_id, distance_m }));
}

export async function pushWeightLog(log: WeightLog): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id || !healthSyncOn()) return;
  const rows = weightLogToRows(log).map((r) => ({ ...r, user_id }));
  if (rows.length) await safe(() => supabase!.from("weight_log").upsert(rows));
}

export async function pushCheckIn(day: string, c: CheckIn): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id || !healthSyncOn()) return;
  await safe(() => supabase!.from("check_ins").upsert({ user_id, ...checkInToRow(day, c) }));
}

export interface Remote {
  profile: Profile | null;
  masDistance: number | null;
  weightLog: WeightLog;
  checkIn: CheckIn | null;
}

/** Pobiera dane użytkownika; null przy braku sesji lub sieci. */
export async function pullAll(today: string): Promise<Remote | null> {
  const user_id = await uid();
  if (!supabase || !user_id) return null;
  try {
    const health = healthSyncOn(); // bez zgody na synchronizację danych zdrowotnych nie pobieramy ich z chmury
    const [p, m, w, c] = await Promise.all([
      supabase.from("profiles").select("data").eq("user_id", user_id).maybeSingle(),
      health ? supabase.from("mas_tests").select("distance_m").eq("user_id", user_id).order("tested_on", { ascending: false }).order("id", { ascending: false }).limit(1) : Promise.resolve({ data: [], error: null }),
      health ? supabase.from("weight_log").select("exercise_id,kg,reps,logged_on,next_kg").eq("user_id", user_id) : Promise.resolve({ data: [], error: null }),
      health ? supabase.from("check_ins").select("recovery,feeling,less").eq("user_id", user_id).eq("day", today).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (p.error || m.error || w.error || c.error) return null;
    return {
      profile: parseProfile(p.data?.data),
      masDistance: (m.data as Array<{ distance_m: number }> | null)?.[0]?.distance_m ?? null,
      weightLog: rowsToWeightLog((w.data ?? []) as WeightRow[]),
      checkIn: c.data ? rowToCheckIn(c.data as never) : null,
    };
  } catch {
    return null;
  }
}
