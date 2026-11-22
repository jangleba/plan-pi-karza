import { EXERCISES } from "./library";
import type { Strain } from "./adapt";
import { scoped } from "../lib/store";

/** Co zawodnik POTWIERDZIŁ po sesji (samo kliknięcie „koniec” i wpisanie kg niczego nie potwierdza). */
export type Completion = "all" | "partial" | "stopped";
/** Decyzja zawodnika co do kolejnej sesji. */
export type Choice = "raise" | "stay" | "lower" | "swap" | "skip";

export interface LogEntry {
  /** Wpisane przez zawodnika kg (wartość zgłoszona, nie zalecona). */
  kg: number;
  /** ZAPLANOWANE powtórzenia z sesji. To plan, a nie dowód wykonania. */
  reps: number;
  date: string;
  /** Kg na następną sesję – tylko po jawnej decyzji zawodnika. */
  next?: number;
  /** Zgłoszone wykonanie. Brak = niepotwierdzone (nie wolno z tego wyciągać 1RM ani podnosić ciężaru). */
  completion?: Completion;
  /** Jawna decyzja o kolejnej sesji (zostaję/zwiększam/obniżam/zmieniam ćwiczenie/pomijam). */
  choice?: Choice;
}
export type WeightLog = Record<string, LogEntry>;

/** Szacowane 1RM wg Epleya. */
export function estimate1RM(kg: number, reps: number): number {
  if (reps <= 1) return kg;
  return kg * (1 + reps / 30);
}

export function firstNumber(reps: string): number {
  const m = /\d+/.exec(reps);
  return m ? Number(m[0]) : 1;
}

export function roundTo(v: number, step = 1.25): number {
  return Math.round(v / step) * step;
}

export interface Suggestion {
  exerciseId: string;
  from: number;
  /** Proponowany ciężar; równy `from`, gdy nie ma podstaw do zwiększenia. */
  to: number;
  text: string;
  /** Opcje do wyboru przez zawodnika (zawsze można zostać, obniżyć, zmienić ćwiczenie albo pominąć). */
  options: Choice[];
  /** Ciężar po obniżeniu (o ten sam krok co ewentualne zwiększenie); brak, gdy obniżenie nie ma sensu. */
  lowerTo?: number;
}

/** Krok zmiany ciężaru (konwencja aplikacji, nie wynik badań): góra 1,25 kg, reszta 2,5% (min. 1,25 kg). */
export function stepFor(exerciseId: string, kg: number, who: { years?: number; age?: number } = {}): number {
  const e = EXERCISES[exerciseId];
  const upper = e?.pattern === "push" || e?.pattern === "pull";
  if (upper) return 1.25;
  // Staż siłowy steruje tempem: początkujący (<1 rok) szybciej, długi staż (>3 lat) wolniej. Poniżej 18 lat nie więcej niż 2,5%. Progi umowne – do przeglądu trenera.
  let pct = who.years === undefined ? 0.025 : who.years < 1 ? 0.03 : who.years <= 3 ? 0.025 : 0.015;
  if (who.age !== undefined && who.age < 18) pct = Math.min(pct, 0.025);
  return Math.max(1.25, roundTo(kg * pct));
}

/**
 * Propozycja po sesji. Zwiększenie ciężaru jest proponowane TYLKO, gdy zawodnik potwierdził wykonanie wszystkich
 * zaplanowanych powtórzeń (`completion: "all"`), check-in nie wskazywał na odciążenie i nie jest tydzień rozładowania.
 * Brak potwierdzenia, wykonanie częściowe albo przerwanie = ciężar bez zmian (brak danych nie oznacza „zwiększ”).
 * To ostrożna propozycja z przyjętym krokiem, a nie zalecenie ani pewna ocena gotowości; decyzja należy do zawodnika.
 */
export function suggestNext(
  exerciseId: string, kg: number, strain: Strain, deload: boolean, completion?: Completion, who: { years?: number; age?: number } = {},
): Suggestion | null {
  const e = EXERCISES[exerciseId];
  if (!e || !e.loaded || kg <= 0) return null;
  const step = stepFor(exerciseId, kg, who);
  const lowerTo = kg - step > 0 ? roundTo(kg - step) : undefined;
  const stay = (text: string): Suggestion => ({ exerciseId, from: kg, to: kg, text, options: ["stay", "lower", "swap", "skip"], ...(lowerTo ? { lowerTo } : {}) });
  if (completion === undefined) return stay("Nie potwierdzono wykonania wszystkich powtórzeń – ciężar zostaje bez zmian.");
  if (completion === "stopped") return stay("Sesję przerwano – nie zwiększamy ciężaru. Zostań, obniż, zmień ćwiczenie albo pomiń.");
  if (completion === "partial") return stay("Nie wszystkie powtórzenia – nie zwiększamy ciężaru.");
  if (strain !== "none") return stay("Zostań przy tym ciężarze (dziś lżej).");
  if (deload) return stay("Tydzień rozładowania – bez zmiany ciężaru.");
  const to = roundTo(kg + step);
  return { exerciseId, from: kg, to, text: `Możesz spróbować dodać ${to - kg} kg (ostrożna propozycja, decydujesz Ty).`, options: ["raise", "stay", "lower", "swap", "skip"], ...(lowerTo ? { lowerTo } : {}) };
}

/** Szacowane 1RM tylko z POTWIERDZONEGO wykonania wszystkich zaplanowanych powtórzeń; inaczej brak oszacowania (null). */
export function estimatedRM(e: LogEntry | undefined): number | null {
  return e && e.completion === "all" ? estimate1RM(e.kg, e.reps) : null;
}

/** Zastosowanie decyzji zawodnika do wpisu w dzienniku. Zwraca nowy wpis. */
export function applyChoice(entry: LogEntry, sug: Suggestion, choice: Choice): LogEntry {
  const base = { ...entry, choice };
  if (choice === "raise" && sug.options.includes("raise")) return { ...base, next: sug.to };
  if (choice === "lower" && sug.lowerTo) return { ...base, next: sug.lowerTo };
  if (choice === "stay") return { ...base, next: sug.from };
  const { next: _drop, ...rest } = base; // swap / skip: bez ciężaru na następny raz
  return rest;
}

/** Krótka etykieta wyboru do pokazania przy ćwiczeniu w kolejnej sesji. */
export function choiceNote(e: LogEntry | undefined): string | null {
  if (!e?.choice) return null;
  if (e.choice === "swap") return "Poprzednio wybrano zmianę ćwiczenia – zobacz zamienniki w opisie ćwiczenia.";
  if (e.choice === "skip") return "Poprzednio pominięto to ćwiczenie.";
  return null;
}

export function loadLog(): WeightLog {
  try {
    return JSON.parse(scoped.getItem("weightLog") ?? "{}") as WeightLog;
  } catch {
    return {};
  }
}

export function saveLog(log: WeightLog): void {
  try {
    scoped.setItem("weightLog", JSON.stringify(log));
  } catch {
    /* brak pamięci */
  }
}
