import type { CheckIn, Profile, WeightLog } from "../engine";

export interface WeightRow {
  exercise_id: string;
  kg: number;
  reps: number;
  logged_on: string;
  next_kg: number | null;
}

export function weightLogToRows(log: WeightLog): WeightRow[] {
  return Object.entries(log).map(([exercise_id, e]) => ({
    exercise_id,
    kg: e.kg,
    reps: e.reps,
    logged_on: e.date,
    next_kg: e.next ?? null,
  }));
}

export function rowsToWeightLog(rows: WeightRow[]): WeightLog {
  const log: WeightLog = {};
  for (const r of rows) {
    log[r.exercise_id] = {
      kg: Number(r.kg),
      reps: r.reps,
      date: r.logged_on,
      ...(r.next_kg !== null ? { next: Number(r.next_kg) } : {}),
    };
  }
  return log;
}

export function checkInToRow(day: string, c: CheckIn) {
  return { day, sleep: c.sleep, feeling: c.feeling, less: c.less };
}

export function rowToCheckIn(r: { sleep: number; feeling: number; less: boolean }): CheckIn {
  return { sleep: r.sleep as CheckIn["sleep"], feeling: r.feeling as CheckIn["feeling"], less: r.less };
}

/** Profil z bazy jest zapisem JSON; sprawdzamy kształt, zanim mu zaufamy. */
export function parseProfile(data: unknown): Profile | null {
  if (!data || typeof data !== "object") return null;
  const p = data as Partial<Profile>;
  if (typeof p.age !== "number" || typeof p.weightKg !== "number" || !Array.isArray(p.matchWeekdays)) return null;
  return p as Profile;
}
