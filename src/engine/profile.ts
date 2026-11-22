import { loadMatchWeeks, matchDatesAround, type MatchWeeks } from "./matchweek";
import type { DaySkip, Level, Season, SeasonGoal, WeekInput } from "./types";
import { MIN_AGE, assessAge } from "../lib/age";
import { addDays, localISO, planWeek, weekStartOf } from "./week";
import { loadSkipped } from "../lib/skipped";
import { loadExtras } from "../lib/extras";
import { loadHistory } from "./history";
import { weekLevel, weekLoadTotal } from "./extra";

export type Position = "bramkarz" | "obronca" | "pomocnik" | "skrzydlowy" | "napastnik";
export const POSITION_LABEL: Record<Position, string> = {
  bramkarz: "Bramkarz", obronca: "Obrońca", pomocnik: "Pomocnik", skrzydlowy: "Skrzydłowy", napastnik: "Napastnik",
};
/** Gdzie zawodnik może ćwiczyć: siłownia, własny ciężar, boisko, bieżnia (starsze profile mają tylko trzy pierwsze). */
export type Equipment = "gym" | "bodyweight" | "field" | "track";

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
  /** Wiek w latach (dolne ograniczenie, odświeżane z upływem czasu). Data urodzenia NIE jest częścią profilu – patrz lib/private.ts. */
  age: number;
  /** Dzień (ISO), na który wiek został podany/obliczony – pozwala „postarzać” deklarację z upływem czasu. */
  ageAsOf?: string;
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

export { MIN_AGE } from "../lib/age";

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
  if (!p.age || assessAge({ declaredAge: p.age, declaredOn: p.ageAsOf }, p.ageAsOf ?? new Date().toISOString().slice(0, 10)).status !== "ok") e.push(`Aplikacja jest dla osób, które ukończyły ${MIN_AGE} lat.`);
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

/** Korekty planu zgłoszone przez zawodnika: dni, w których nie może trenować (sesje indywidualne są wtedy przekładane), i terminy meczów wpisane na poszczególne tygodnie. */
export interface PlanAdjust { skippedDays: DaySkip[]; matchWeeks?: MatchWeeks; weekLoad?: WeekInput["weekLoad"] }
const currentAdjust = (): PlanAdjust => ({ skippedDays: loadSkipped(), matchWeeks: loadMatchWeeks(), weekLoad: currentWeekLoad() });

/** Obciążenie bieżącego tygodnia (własne jednostki i wykonane sesje) do dziś; dotyczy tylko planu tego tygodnia. */
function currentWeekLoad(): WeekInput["weekLoad"] {
  const today = localISO();
  const level = weekLevel(weekLoadTotal(loadExtras(), loadHistory(), weekStartOf(today), today));
  return { level, from: today };
}

/**
 * Plan tygodnia dla profilu (wspólny dla Startu, Planu i Fuel). Silnik widzi: dni zajęte z onboardingu, staż siłowy (dzień po meczu dla siły
 * dopiero od 2 lat) oraz dni, w których zawodnik zgłosił w check-inie „nie mogę zrobić dzisiejszych treningów” (sesje indywidualne są przekładane).
 */
export function planForProfile(profile: Profile, weekStart: string, adj: PlanAdjust = currentAdjust()) {
  return planWeek({
    weekStart,
    matches: matchDatesAround(weekStart, profile.matchWeekdays, adj.matchWeeks ?? {}),
    clubDays: datesForWeek(weekStart, profile.clubWeekdays),
    offDays: datesForWeek(weekStart, profile.offWeekdays ?? []),
    level: levelOf(profile.age, profile.strengthYears),
    limitedGymAccess: profile.limitedGymAccess,
    strengthYears: profile.strengthYears,
    skippedDays: adj.skippedDays,
    season: profile.season,
    goal: profile.goal,
    goal2: profile.goal2,
    // plan innego tygodnia niż bieżący nie zależy od obciążenia „do dziś”
    ...(adj.weekLoad && weekStartOf(adj.weekLoad.from) === weekStart ? { weekLoad: adj.weekLoad } : {}),
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
