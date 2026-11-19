import type { Level, Season, SeasonGoal } from "./types";
import { addDays, planWeek } from "./week";

export type Position = "bramkarz" | "obronca" | "pomocnik" | "skrzydlowy" | "napastnik";
export const POSITION_LABEL: Record<Position, string> = {
  bramkarz: "Bramkarz", obronca: "Obrońca", pomocnik: "Pomocnik", skrzydlowy: "Skrzydłowy", napastnik: "Napastnik",
};
export type Equipment = "gym" | "bodyweight" | "field";

/** Polskie poziomy rozgrywek (wpływ na silnik – do ustalenia, na razie tylko zapis). */
export const LEAGUES = [
  "Ekstraklasa", "I liga", "II liga", "III liga", "IV liga", "V liga", "Klasa okręgowa",
  "A-klasa", "B-klasa", "C-klasa", "Juniorzy – CLJ", "Juniorzy – liga wojewódzka", "Juniorzy – liga okręgowa", "Amatorsko",
] as const;
export type League = (typeof LEAGUES)[number];

export interface Profile {
  name?: string;
  /** Domyślnie „w sezonie" (stare profile). */
  season?: Season;
  goal?: SeasonGoal;
  /** Drugi cel (dodatkowy). */
  goal2?: SeasonGoal;
  league?: League;
  age: number;
  /** Lata regularnego treningu siłowego. */
  strengthYears: number;
  weightKg: number;
  position: Position;
  equipment: Equipment[];
  /** Dni tygodnia 0 = poniedziałek … 6 = niedziela. */
  clubWeekdays: number[];
  matchWeekdays: number[];
  /** Dni całkowicie niedostępne (0 = pon). */
  offWeekdays?: number[];
  /** Mało dni na siłownię – siła pełna także dzień po meczu. */
  limitedGymAccess: boolean;
  /** Data rozpoczęcia planu (ISO) – od niej liczony cykl 5-tygodniowy. */
  startDate?: string;
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
  if ((p.season ?? "inseason") === "inseason" && !p.matchWeekdays?.length) e.push("Zaznacz dzień meczu.");
  if ((p.matchWeekdays?.length ?? 0) > 2) e.push("Maksymalnie dwa mecze w tygodniu.");
  return e;
}

export function datesForWeek(weekStart: string, weekdays: number[]): string[] {
  return weekdays.map((d) => addDays(weekStart, d));
}

/** Numer tygodnia w cyklu 5-tygodniowym (1–5) od tygodnia rozpoczęcia. */
export function weekInCycle(startDate: string | undefined, weekStart: string): number {
  if (!startDate) return 1;
  const start = new Date(Date.parse(startDate));
  const dow = (start.getUTCDay() + 6) % 7;
  const startMonday = Date.parse(startDate) - dow * 86_400_000;
  const weeks = Math.floor((Date.parse(weekStart) - startMonday) / (7 * 86_400_000));
  return (((weeks % 5) + 5) % 5) + 1;
}

/** Mecze z poprzedniego, bieżącego i następnego tygodnia – do fazy MD-x na granicy tygodni. */
export function matchesAround(weekStart: string, weekdays: number[]): string[] {
  return [-7, 0, 7].flatMap((off) => datesForWeek(addDays(weekStart, off), weekdays));
}

/** Kolejny tydzień odblokowuje się w dniu ostatniego meczu bieżącego tygodnia (aplikacja nie zna godziny meczu). */
export function nextWeekUnlocked(weekStart: string, matchWeekdays: number[], todayISO: string): boolean {
  if (!matchWeekdays.length) return false;
  const last = datesForWeek(weekStart, matchWeekdays).sort().pop()!;
  return todayISO >= last;
}

/** Plan tygodnia dla profilu (wspólny dla Startu, Planu i Fuel). */
export function planForProfile(profile: Profile, weekStart: string) {
  return planWeek({
    weekStart,
    matches: matchesAround(weekStart, profile.matchWeekdays),
    clubDays: datesForWeek(weekStart, profile.clubWeekdays),
    offDays: datesForWeek(weekStart, profile.offWeekdays ?? []),
    level: levelOf(profile.age, profile.strengthYears),
    limitedGymAccess: profile.limitedGymAccess,
    season: profile.season,
    goal: profile.goal,
    goal2: profile.goal2,
  });
}

/**
 * Tydzień cyklu do doboru faz. Cel „powrót po przerwie": pierwsze 2 tygodnie od startu
 * jako rozładowanie (tydzień 5 cyklu), potem zwykły cykl.
 */
export function cycleWeekFor(profile: Profile, weekStart: string): number {
  if (profile.goal === "return" && profile.startDate) {
    const weeks = Math.floor((Date.parse(weekStart) - Date.parse(weekStartOfISO(profile.startDate))) / (7 * 86_400_000));
    if (weeks >= 0 && weeks < 2) return 5;
  }
  return weekInCycle(profile.startDate, weekStart);
}

function weekStartOfISO(iso: string): string {
  const dow = (new Date(Date.parse(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
