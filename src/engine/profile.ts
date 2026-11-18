import type { Level } from "./types";
import { addDays } from "./week";

export type Position = "bramkarz" | "obronca" | "pomocnik" | "skrzydlowy" | "napastnik";
export type Equipment = "gym" | "bodyweight" | "field";

export interface Profile {
  age: number;
  /** Lata regularnego treningu siłowego. */
  strengthYears: number;
  weightKg: number;
  position: Position;
  equipment: Equipment[];
  /** Dni tygodnia 0 = poniedziałek … 6 = niedziela. */
  clubWeekdays: number[];
  matchWeekdays: number[];
  /** Mało dni na siłownię – siła pełna także dzień po meczu. */
  limitedGymAccess: boolean;
}

export const MIN_AGE = 16;

/**
 * Poziom ze stażu i wieku. PROGI TYMCZASOWE (do ustalenia):
 * staż <1 / 1–3 / >3 lat; 16–17 lat o stopień niżej.
 */
export function levelOf(age: number, strengthYears: number): Level {
  const order: Level[] = ["beginner", "intermediate", "advanced"];
  let i = strengthYears < 1 ? 0 : strengthYears <= 3 ? 1 : 2;
  if (age < 18) i = Math.max(0, i - 1);
  return order[i]!;
}

export function validateProfile(p: Partial<Profile>): string[] {
  const e: string[] = [];
  if (!p.age || p.age < MIN_AGE) e.push(`Aplikacja jest dla zawodników od ${MIN_AGE} lat.`);
  if (p.strengthYears === undefined || p.strengthYears < 0) e.push("Podaj staż siłowy.");
  if (!p.weightKg || p.weightKg < 40 || p.weightKg > 160) e.push("Podaj masę ciała (40–160 kg).");
  if (!p.position) e.push("Wybierz pozycję.");
  if (!p.equipment?.length) e.push("Wybierz dostępny sprzęt.");
  if (!p.matchWeekdays?.length) e.push("Zaznacz dzień meczu.");
  if ((p.matchWeekdays?.length ?? 0) > 2) e.push("Maksymalnie dwa mecze w tygodniu.");
  return e;
}

export function datesForWeek(weekStart: string, weekdays: number[]): string[] {
  return weekdays.map((d) => addDays(weekStart, d));
}
