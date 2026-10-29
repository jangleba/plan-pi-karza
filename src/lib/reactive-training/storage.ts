import type { ReactiveCustomSet, ReactiveSessionStats, ReactiveSettings } from "./types";

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
    row.name.length <= 160 &&
    typeof row.createdAt === "string" &&
    Number.isFinite(Date.parse(row.createdAt)) &&
    Array.isArray(row.actions) &&
    row.actions.length >= 1 &&
    row.actions.length <= 50 &&
    row.actions.every(
      (action) =>
        action &&
        typeof action === "object" &&
        typeof (action as { id?: unknown }).id === "string" &&
        typeof (action as { label?: unknown }).label === "string" &&
        [undefined, null, "left", "right", "forward", "back"].includes(action.direction) &&
        [undefined, null, "blue", "green", "yellow", "red"].includes(action.color),
    )
  );
}

export function loadReactiveCustomSets(
  key: string,
  storage?: StorageLike | null,
): ReactiveCustomSet[] {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!source) return [];
  try {
    const parsed = JSON.parse(source.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(parsed) || parsed.length > 100 || !parsed.every(isCustomSet))
      throw new Error();
    return parsed;
  } catch {
    throw new Error("Nie można odczytać własnych zestawów. Oryginalny zapis zachowano.");
  }
}

export function saveReactiveCustomSets(
  key: string,
  sets: ReactiveCustomSet[],
  storage?: StorageLike | null,
): boolean {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!target) return false;
    // Validate the old value before writing: corruption is never silently replaced.
    loadReactiveCustomSets(key, target);
    if (sets.length > 100 || !sets.every(isCustomSet)) return false;
    target.setItem(key, JSON.stringify(sets));
    return true;
  } catch {
    return false;
  }
}

export interface ReactiveSavedSession {
  version: 1;
  id: string;
  settings: ReactiveSettings;
  stats: ReactiveSessionStats;
  phase: "paused" | "summary";
}
function validSession(value: unknown): value is ReactiveSavedSession {
  if (!value || typeof value !== "object") return false;
  const row = value as ReactiveSavedSession;
  return (
    row.version === 1 &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    ["paused", "summary"].includes(row.phase) &&
    Boolean(row.settings) &&
    Boolean(row.stats) &&
    ["directions", "colors", "opponent", "combo", "flash", "sequence", "custom"].includes(
      row.settings.mode,
    ) &&
    ["basic", "intermediate", "advanced"].includes(row.settings.level) &&
    Number.isFinite(row.settings.intervalSec) &&
    Number.isFinite(row.settings.flashDurationMs) &&
    Number.isFinite(row.settings.sequenceLength) &&
    Array.isArray(row.settings.activeDirections) &&
    Array.isArray(row.settings.activeColors) &&
    Number.isFinite(row.stats.elapsedSec) &&
    row.stats.elapsedSec >= 0 &&
    Number.isFinite(row.stats.cueCount) &&
    row.stats.cueCount >= 0 &&
    Number.isFinite(row.stats.decisionChanges) &&
    Boolean(row.stats.directionCounts) &&
    ["left", "right", "forward", "back"].every(
      (key) =>
        Number.isFinite(row.stats.directionCounts[key as keyof typeof row.stats.directionCounts]) &&
        row.stats.directionCounts[key as keyof typeof row.stats.directionCounts] >= 0,
    ) &&
    Boolean(row.stats.colorCounts) &&
    ["blue", "green", "yellow", "red"].every(
      (key) =>
        Number.isFinite(row.stats.colorCounts[key as keyof typeof row.stats.colorCounts]) &&
        row.stats.colorCounts[key as keyof typeof row.stats.colorCounts] >= 0,
    ) &&
    Number.isFinite(Date.parse(row.stats.startedAt))
  );
}
export function loadReactiveSession(
  key: string,
  storage: StorageLike = localStorage,
): ReactiveSavedSession | null {
  const raw = storage.getItem(`${key}:session`);
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!validSession(parsed))
    throw new Error("Nie można odczytać rozpoczętego treningu reakcji. Zachowano zapis.");
  return parsed;
}
export function loadReactiveResults(
  key: string,
  storage: StorageLike = localStorage,
): ReactiveSavedSession[] {
  const raw = storage.getItem(`${key}:history`);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 100 || !parsed.every(validSession))
    throw new Error("Historia reakcji jest nieprawidłowa. Zachowano zapis.");
  return parsed;
}
export function saveReactiveSession(
  key: string,
  session: ReactiveSavedSession,
  storage?: StorageLike,
): boolean {
  try {
    const target = storage ?? localStorage;
    loadReactiveSession(key, target);
    if (!validSession(session)) return false;
    if (session.phase === "summary") {
      const previous = loadReactiveResults(key, target);
      if (previous.length >= 100 && !previous.some((row) => row.id === session.id)) return false;
      // Persist the result before replacing the recoverable draft. A full/corrupt
      // history or a failed history write must leave the previous session intact.
      target.setItem(
        `${key}:history`,
        JSON.stringify([...previous.filter((row) => row.id !== session.id), session]),
      );
    }
    target.setItem(`${key}:session`, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
