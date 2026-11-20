/**
 * Dni, w których zawodnik zgłosił, że NIE zrobi siły (w check-inie albo przy sesji w planie). Plan przekłada wtedy siłę na kolejny
 * dozwolony dzień (patrz `planWeek`). Pamiętamy też dzień zgłoszenia (`since`), żeby przełożona siła nie zmieniała miejsca z upływem dni.
 * Dane zostają na urządzeniu (przestrzeń gościa/konta), bez synchronizacji.
 */
import { useSyncExternalStore } from "react";
import { scoped } from "./store";
import type { StrengthBlock } from "../engine/types";

const KEY = "strengthBlocked";
const KEEP_DAYS = 70;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };

export function loadBlocked(): StrengthBlock[] {
  try {
    const v: unknown = JSON.parse(scoped.getItem(KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    const byDate = new Map<string, string>();
    for (const e of v) {
      const b = e as Partial<StrengthBlock> | null;
      if (b && isDay(b.date) && isDay(b.since) && b.since <= b.date) byDate.set(b.date, b.since);
    }
    return [...byDate].map(([date, since]) => ({ date, since })).sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

/**
 * Ustawia albo zdejmuje zgłoszenie „bez siły” dla dnia; zwraca aktualną listę. `todayISO` to dzień zgłoszenia (nie późniejszy niż `date`).
 * Stare wpisy (ponad ~10 tygodni) są porządkowane.
 */
export function setBlocked(date: string, on: boolean, todayISO: string): StrengthBlock[] {
  if (!isDay(date) || !isDay(todayISO)) return loadBlocked();
  const limit = new Date(Date.parse(`${todayISO}T00:00:00Z`) - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const next = loadBlocked().filter((b) => b.date >= limit && b.date !== date);
  if (on) next.push({ date, since: todayISO < date ? todayISO : date });
  next.sort((a, b) => a.date.localeCompare(b.date));
  try { scoped.setItem(KEY, JSON.stringify(next)); } catch { /* brak pamięci */ }
  emit();
  return next;
}

export const isBlocked = (date: string): boolean => loadBlocked().some((b) => b.date === date);

/** Hook odświeżający komponent po zmianie zgłoszeń (plan musi się wtedy przeliczyć). */
export function useBlockedVersion(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version, () => 0);
}
