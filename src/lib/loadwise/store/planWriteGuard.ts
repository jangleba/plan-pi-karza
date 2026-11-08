/**
 * Background plan writes made while the app loads (regeneration, revision stamp,
 * data migration) used to be retried on every app focus. When the server rejected
 * one with a concurrency conflict (40001), the stored plan stayed unchanged, so the
 * next load rebuilt the same snapshot and sent it again: hundreds of full-plan
 * writes per athlete. A rejected write is now remembered for the same stored plan
 * and inputs. A newer stored plan (another device saved) produces a new key, so the
 * write is attempted again only when something actually changed.
 */
const rejected = new Set<string>();

export function isPlanWriteConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /code: 40001\b/.test(message);
}

export function planWriteKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => part ?? "-").join("|");
}

/** Returns null when this write was already rejected or is rejected now. */
export async function guardedPlanWrite<T>(key: string, write: () => Promise<T>): Promise<T | null> {
  if (rejected.has(key)) return null;
  try {
    return await write();
  } catch (error) {
    if (!isPlanWriteConflict(error)) throw error;
    rejected.add(key);
    console.warn("[loadwise] plan snapshot rejected by the server; not retrying", error);
    return null;
  }
}

export function resetPlanWriteGuard() {
  rejected.clear();
}
