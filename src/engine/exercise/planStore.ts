import { scoped } from "../../lib/store";
import { applyExerciseChange, previewExerciseChange, type Operation } from "./change";
import type { AthleteContext, GeneratedSession } from "./types";

/**
 * Zmiany użytkownika w sesji zapisujemy jako listę operacji, a nie gotowy plan: przy zmianie danych (opanowanie, sprzęt) plan generuje się
 * od nowa deterministycznie (to samo ziarno) i operacje odtwarzają się na widoku, który widzi zawodnik.
 */
export interface StoredOp { op: Operation; ack?: boolean }
export interface StoredPlan { key: string; ops: StoredOp[] }
const k = (date: string, module: string) => `exercisePlan:${date}:${module}`;

export function loadPlanOps(date: string, module: string, key: string): StoredOp[] {
  try {
    const p = JSON.parse(scoped.getItem(k(date, module)) ?? "null") as StoredPlan | null;
    return p && p.key === key && Array.isArray(p.ops) ? p.ops : [];
  } catch { return []; }
}
export function savePlanOps(date: string, module: string, key: string, ops: StoredOp[]): void {
  try { scoped.setItem(k(date, module), JSON.stringify({ key, ops } satisfies StoredPlan)); } catch { /* brak pamięci */ }
}

/** Odtworzenie operacji; operacje, które przestały przechodzić kwalifikację, są pomijane. */
export function replayOps(base: GeneratedSession, ops: StoredOp[], ctx: AthleteContext): { session: GeneratedSession; applied: StoredOp[] } {
  let session = base;
  const applied: StoredOp[] = [];
  for (const o of ops) {
    const r = applyExerciseChange(previewExerciseChange(session, o.op, ctx), session, ctx, { ack: o.ack });
    if (r.ok) { session = r.session; applied.push(o); }
  }
  return { session, applied };
}
