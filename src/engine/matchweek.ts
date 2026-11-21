/**
 * Terminy meczów i sparingów na poszczególne tygodnie. Zawodnik wpisuje je co tydzień (od niedzieli na kolejny tydzień);
 * dla tygodnia bez wpisu obowiązują stałe dni z onboardingu (`Profile.matchWeekdays`). Zapis tylko na urządzeniu.
 */
import { scoped } from "../lib/store";
import { addDays, weekStartOf } from "./week";
import type { Season } from "./types";

/** Klucz: poniedziałek tygodnia (YYYY-MM-DD); wartość: dni 0–6 (Pn–Nd), pusta tablica = brak meczu i sparingu w tym tygodniu. */
export type MatchWeeks = Record<string, number[]>;
export const MAX_MATCHES = 2;
const KEY = "matchWeeks";
const CHANGED = "bw-match-weeks";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** „Mecz” w sezonie, „sparing” poza sezonem (przygotowanie, przerwa). */
export const matchWord = (season?: Season): "mecz" | "sparing" => (season === undefined || season === "inseason" ? "mecz" : "sparing");

/** Bezpieczny odczyt: tylko poprawne poniedziałki, dni całkowite 0–6 bez powtórzeń, maksymalnie dwa. */
export function parseMatchWeeks(raw: unknown): MatchWeeks {
  const out: MatchWeeks = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ISO.test(k) || weekStartOf(k) !== k || !Array.isArray(v)) continue;
    out[k] = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b).slice(0, MAX_MATCHES);
  }
  return out;
}

export function loadMatchWeeks(): MatchWeeks {
  try { return parseMatchWeeks(JSON.parse(scoped.getItem(KEY) ?? "null")); } catch { return {}; }
}

/** Zapis tygodnia ([] = „nie mam”); powiadamia otwarte ekrany. */
export function saveMatchWeek(weekStart: string, days: number[]): MatchWeeks {
  const all = loadMatchWeeks();
  const clean = parseMatchWeeks({ [weekStart]: days })[weekStart];
  if (clean) all[weekStart] = clean;
  // wpisy starsze niż ok. pół roku nie są potrzebne
  const cut = addDays(weekStart, -26 * 7);
  for (const k of Object.keys(all)) if (k < cut) delete all[k];
  scoped.setItem(KEY, JSON.stringify(all));
  try { window.dispatchEvent(new Event(CHANGED)); } catch { /* poza przeglądarką */ }
  return all;
}

export const MATCH_WEEKS_EVENT = CHANGED;

/** Dni meczów w danym tygodniu: wpis zawodnika albo stałe dni z profilu. */
export const matchWeekdaysFor = (weeks: MatchWeeks, defaults: number[], weekStart: string): number[] => weeks[weekStart] ?? defaults;

/** Daty meczów z poprzedniego, bieżącego i następnego tygodnia (faza MD-x na granicy tygodni). */
export function matchDatesAround(weekStart: string, defaults: number[], weeks: MatchWeeks): string[] {
  return [-7, 0, 7].flatMap((off) => {
    const w = addDays(weekStart, off);
    return matchWeekdaysFor(weeks, defaults, w).map((d) => addDays(w, d));
  });
}

const weekdayOf = (iso: string) => (new Date(Date.parse(iso)).getUTCDay() + 6) % 7;

/** Czy kolejny tydzień jest odblokowany: zawodnik wpisał jego terminy albo zaznaczył, że ich nie ma. */
export const nextWeekReady = (weeks: MatchWeeks, today: string): boolean => weeks[addDays(weekStartOf(today), 7)] !== undefined;

export interface WeekAsk { weekStart: string; kind: "next" | "current" }

/**
 * O który tydzień pytamy dziś: w niedzielę o kolejny; w pozostałe dni o bieżący, jeśli to nie pierwszy tydzień planu i nie ma wpisu
 * (pierwszy tydzień bierze dni z onboardingu). Brak pytania: null.
 */
export function weekToAsk(today: string, startDate: string | undefined, weeks: MatchWeeks): WeekAsk | null {
  const thisWeek = weekStartOf(today);
  const next = addDays(thisWeek, 7);
  if (weekdayOf(today) === 6 && weeks[next] === undefined) return { weekStart: next, kind: "next" };
  if (weeks[thisWeek] === undefined && startDate && thisWeek > weekStartOf(startDate)) return { weekStart: thisWeek, kind: "current" };
  return null;
}
