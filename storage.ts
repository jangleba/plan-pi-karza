import type { ReactiveCustomSet } from "./types";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isCustomSet(value: unknown): value is ReactiveCustomSet {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ReactiveCustomSet>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.createdAt === "string" &&
    Array.isArray(row.actions) &&
    row.actions.every(
      (action) =>
        action &&
        typeof action === "object" &&
        typeof (action as { id?: unknown }).id === "string" &&
        typeof (action as { label?: unknown }).label === "string",
    )
  );
}

export function loadReactiveCustomSets(key: string, storage?: StorageLike | null): ReactiveCustomSet[] {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!source) return [];
  try {
    const parsed = JSON.parse(source.getItem(key) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCustomSet) : [];
  } catch {
    return [];
  }
}

export function saveReactiveCustomSets(
  key: string,
  sets: ReactiveCustomSet[],
  storage?: StorageLike | null,
): void {
  const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(key, JSON.stringify(sets.filter(isCustomSet)));
  } catch {
    // Brak miejsca / tryb prywatny: trening nadal działa, tylko zestaw nie zostaje zapisany.
  }
}

