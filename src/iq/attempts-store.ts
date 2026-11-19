import type { Attempt } from "../engine/sim";
import { scoped } from "../lib/store";

const KEY = "iqAttempts";

export function loadAttempts(): Attempt[] {
  try { const v = JSON.parse(scoped.getItem(KEY) ?? "[]"); return Array.isArray(v) ? (v as Attempt[]) : []; } catch { return []; }
}

/** Dopisuje próbę (maks. 300 ostatnich). */
export function addAttempt(a: Attempt): void {
  try { scoped.setItem(KEY, JSON.stringify([...loadAttempts(), a].slice(-300))); } catch { /* brak pamięci */ }
}
