/**
 * Własne jednostki zawodnika (poza aplikacją): zapis lokalny w przestrzeni gościa/konta, bez synchronizacji (jak zgłoszenia „nie mogę”).
 * Hook odświeża ekran po każdej zmianie, a plan i check-in przeliczają się od razu.
 */
import { useSyncExternalStore } from "react";
import { scoped } from "./store";
import { normalizeExtras, type ExtraActivity } from "../engine/extra";
import { addDays } from "../engine/week";

const KEY = "extras";
const KEEP_DAYS = 120;

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };

export function loadExtras(): ExtraActivity[] {
  try { return normalizeExtras(JSON.parse(scoped.getItem(KEY) ?? "[]")); } catch { return []; }
}

function save(list: ExtraActivity[], todayISO: string): ExtraActivity[] {
  const limit = addDays(todayISO, -KEEP_DAYS);
  const next = list.filter((a) => a.date >= limit);
  try { scoped.setItem(KEY, JSON.stringify(next)); } catch { /* brak pamięci */ }
  emit();
  return next;
}

export function addExtra(a: Omit<ExtraActivity, "id">, todayISO: string): ExtraActivity[] {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return save(normalizeExtras([...loadExtras(), { ...a, id }]), todayISO);
}

export function removeExtra(id: string, todayISO: string): ExtraActivity[] {
  return save(loadExtras().filter((a) => a.id !== id), todayISO);
}

/** Hook: numer wersji rośnie przy każdej zmianie (użyj w zależnościach `useMemo`). */
export function useExtrasVersion(): number {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version, () => 0);
}
