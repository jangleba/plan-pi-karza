import { normalizeCheckIn } from "../engine";
import type { CheckIn, Profile, WeightLog } from "../engine";
import { assessAge } from "./age";

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
  return { day, recovery: c.recovery, feeling: c.feeling, less: c.less };
}

export function rowToCheckIn(r: { recovery: number; feeling: number; less: boolean }): CheckIn {
  return normalizeCheckIn({ recovery: r.recovery, feeling: r.feeling, less: r.less });
}

/**
 * JAWNY KONTRAKT pól profilu wysyłanych do backendu. Cokolwiek spoza tej listy (w tym data urodzenia, rocznik czy pole dodane
 * w przyszłości do Profile) NIE jest synchronizowane, dopóki ktoś świadomie nie doda go tutaj i do dokumentacji (docs/MAPA-DANYCH.md).
 * Serwer dodatkowo odrzuca zapisy z polami spoza kontraktu (trigger w migracji 0005).
 */
export const REMOTE_PROFILE_FIELDS = [
  "name", "season", "goal", "goal2", "league", "age", "ageAsOf", "strengthYears", "weightKg", "position",
  "equipment", "clubWeekdays", "matchWeekdays", "offWeekdays", "limitedGymAccess", "missingGear", "homeGear", "startDate",
] as const satisfies ReadonlyArray<keyof Profile>;

/** Pola, które NIGDY nie mogą trafić na serwer w profilu (twarda lista obronna, niezależna od kontraktu). */
export const FORBIDDEN_REMOTE_KEYS = ["birthDate", "birthYear", "dob", "dateOfBirth", "birthday"] as const;

/** Profil do wysłania: tylko pola kontraktu i tylko dla osoby, której wiek jednoznacznie spełnia próg (inaczej null = nic nie wysyłamy). */
export function toRemoteProfile(p: Profile, todayISO: string): Record<string, unknown> | null {
  if (assessAge({ declaredAge: p.age, declaredOn: p.ageAsOf }, todayISO).status !== "ok") return null;
  const src = p as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of REMOTE_PROFILE_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/**
 * Profil z bazy jest zapisem JSON; sprawdzamy kształt i wiek, zanim mu zaufamy. Pola spoza kontraktu (np. dawne birthDate) są ignorowane,
 * a profil osoby poniżej progu wieku nie jest przyjmowany.
 */
export function parseProfile(data: unknown, todayISO: string = new Date().toISOString().slice(0, 10)): Profile | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  if (typeof raw.age !== "number" || typeof raw.weightKg !== "number" || !Array.isArray(raw.matchWeekdays)) return null;
  const out: Record<string, unknown> = {};
  for (const k of REMOTE_PROFILE_FIELDS) if (raw[k] !== undefined) out[k] = raw[k];
  const p = out as unknown as Profile;
  if (assessAge({ declaredAge: p.age, declaredOn: p.ageAsOf }, todayISO).status !== "ok") return null;
  return p;
}
