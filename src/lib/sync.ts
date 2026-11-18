import type { CheckIn, Profile, WeightLog } from "../engine";
import { supabase } from "./supabase";
import {
  checkInToRow, parseProfile, rowToCheckIn, rowsToWeightLog, weightLogToRows,
  type WeightRow,
} from "./sync-map";

async function uid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

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
  await safe(() => supabase!.from("profiles").upsert({ user_id, data: p, updated_at: new Date().toISOString() }));
}

export async function pushMas(distance_m: number): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id) return;
  await safe(() => supabase!.from("mas_tests").insert({ user_id, distance_m }));
}

export async function pushWeightLog(log: WeightLog): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id) return;
  const rows = weightLogToRows(log).map((r) => ({ ...r, user_id }));
  if (rows.length) await safe(() => supabase!.from("weight_log").upsert(rows));
}

export async function pushCheckIn(day: string, c: CheckIn): Promise<void> {
  const user_id = await uid();
  if (!supabase || !user_id) return;
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
    const [p, m, w, c] = await Promise.all([
      supabase.from("profiles").select("data").eq("user_id", user_id).maybeSingle(),
      supabase.from("mas_tests").select("distance_m").eq("user_id", user_id).order("tested_on", { ascending: false }).order("id", { ascending: false }).limit(1),
      supabase.from("weight_log").select("exercise_id,kg,reps,logged_on,next_kg").eq("user_id", user_id),
      supabase.from("check_ins").select("sleep,feeling,less").eq("user_id", user_id).eq("day", today).maybeSingle(),
    ]);
    if (p.error || m.error || w.error || c.error) return null;
    return {
      profile: parseProfile(p.data?.data),
      masDistance: m.data?.[0]?.distance_m ?? null,
      weightLog: rowsToWeightLog((w.data ?? []) as WeightRow[]),
      checkIn: c.data ? rowToCheckIn(c.data) : null,
    };
  } catch {
    return null;
  }
}
