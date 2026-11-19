import type { SeasonGoal } from "./types";
import { scoped } from "../lib/store";

/**
 * „Jak czujesz się teraz na boisku?” – odpowiedzi podpowiadają cele,
 * a pytanie wraca co 5 tygodni, żeby było widać zmianę.
 */
export type FeelNow = "slow" | "duels" | "stamina";

export const FEEL_NOW: Array<[FeelNow, string]> = [
  ["slow", "Za wolny, spóźniam się"],
  ["duels", "Przegrywam pojedynki"],
  ["stamina", "Brakuje mi pary w końcówce"],
];

const GOAL_FOR: Record<FeelNow, SeasonGoal> = { slow: "speed", duels: "strength", stamina: "endurance" };

/** Cele podpowiedziane z odpowiedzi (w kolejności zaznaczenia, maks. dwa). */
export function suggestGoals(now: FeelNow[]): SeasonGoal[] {
  return [...new Set(now.map((f) => GOAL_FOR[f]))].slice(0, 2);
}

export interface FeelSnapshot { date: string; now: FeelNow[] }

export const FEEL_EVERY_DAYS = 35;

export function feelDue(last: FeelSnapshot | undefined, todayISO: string): boolean {
  if (!last) return true;
  return (Date.parse(todayISO) - Date.parse(last.date)) / 86_400_000 >= FEEL_EVERY_DAYS;
}

/** Porównanie pierwszej i ostatniej odpowiedzi: co zniknęło (poprawa), co doszło. */
export function feelChange(first: FeelSnapshot, last: FeelSnapshot): { better: FeelNow[]; worse: FeelNow[] } {
  return {
    better: first.now.filter((f) => !last.now.includes(f)),
    worse: last.now.filter((f) => !first.now.includes(f)),
  };
}

export function loadFeelings(): FeelSnapshot[] {
  try {
    const v = JSON.parse(scoped.getItem("feelings") ?? "[]");
    return Array.isArray(v) ? (v as FeelSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveFeeling(s: FeelSnapshot): void {
  try {
    scoped.setItem("feelings", JSON.stringify([...loadFeelings().filter((x) => x.date !== s.date), s]));
  } catch { /* brak pamięci */ }
}
