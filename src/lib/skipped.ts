/**
 * Dni, w których zawodnik zgłosił „nie mogę zrobić dzisiejszych treningów” (w check-inie albo przy sesji w planie). Plan przekłada wtedy
 * sesje indywidualne na kolejny dozwolony dzień (patrz `planWeek`). Pamiętamy też dzień zgłoszenia (`since`), żeby przełożona sesja nie
 * zmieniała miejsca z upływem dni. Dane zostają na urządzeniu (przestrzeń gościa/konta), bez synchronizacji.
 */
import { useSyncExternalStore } from "react";
import { scoped } from "./store";
import type { DaySkip } from "../engine/types";

const KEY = "skippedDays";
const KEEP_DAYS = 70;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };

export function loadSkipped(): DaySkip[] {
  try {
    const v: unknown = JSON.parse(scoped.getItem(KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    const byDate = new Map<string, string>();
    for (const e of v) {
      const b = e as Partial<DaySkip> | null;
      if (b && isDay(b.date) && isDay(b.since) && b.since <= b.date) byDate.set(b.date, b.since);
    }
    return [...byDate].map(([date, since]) => ({ date, since })).sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

/**
 * Ustawia albo zdejmuje zgłoszenie „nie mogę trenować” dla dnia; zwraca aktualną listę. `todayISO` to dzień zgłoszenia (nie późniejszy niż `date`).
 * Stare wpisy (ponad ~10 tygodni) są porządkowane.
 */
export function setSkipped(date: string, on: boolean, todayISO: string): DaySkip[] {
  if (!isDay(date) || !isDay(todayISO)) return loadSkipped();
  const limit = new Date(Date.parse(`${todayISO}T00:00:00Z`) - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const next = loadSkipped().filter((b) => b.date >= limit && b.date !== date);
  if (on) next.push({ date, since: todayISO < date ? todayISO : date });
  next.sort((a, b) => a.date.localeCompare(b.date));
  try { scoped.setItem(KEY, JSON.stringify(next)); } catch { /* brak pamięci */ }
  emit();
  return next;
}

export const isSkipped = (date: string): boolean => loadSkipped().some((b) => b.date === date);

/** Hook odświeżający komponent po zmianie zgłoszeń (plan musi się wtedy przeliczyć). */
export function useSkippedVersion(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version, () => 0);
}
