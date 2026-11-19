import { EXERCISES } from "./library";
import type { Strain } from "./adapt";
import { scoped } from "../lib/store";

export interface LogEntry {
  /** Ostatnio wpisane kg. */
  kg: number;
  /** Zaplanowane powtórzenia z sesji (do szacowania 1RM). */
  reps: number;
  date: string;
  /** Kg proponowane na następną sesję (po decyzji zawodnika). */
  next?: number;
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
  to: number;
  text: string;
}

/**
 * Sugestia po sesji: +2,5% (dolne partie/moc), +1,25 kg góra – tylko gdy sesja
 * była pełna (check-in dobry) i nie jest rozładowanie. Zawodnik może odrzucić.
 */
export function suggestNext(
  exerciseId: string, kg: number, strain: Strain, deload: boolean,
): Suggestion | null {
  const e = EXERCISES[exerciseId];
  if (!e || !e.loaded || kg <= 0) return null;
  if (strain !== "none") return { exerciseId, from: kg, to: kg, text: "Zostań przy tym ciężarze (dziś lżej)." };
  if (deload) return { exerciseId, from: kg, to: kg, text: "Tydzień rozładowania – bez zmiany ciężaru." };
  const upper = e.pattern === "push" || e.pattern === "pull";
  const step = upper ? 1.25 : Math.max(1.25, roundTo(kg * 0.025));
  const to = roundTo(kg + step);
  return { exerciseId, from: kg, to, text: `Możesz dodać ${to - kg} kg.` };
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
