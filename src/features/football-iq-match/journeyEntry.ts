import { nextPractice } from "./journeyPractice";
import { createJourney } from "./journeyEngine";
import type { JourneyAttempt, JourneyDefinition, JourneyMode } from "./journeyTypes";

export const journeyVisitsKey = (owner?: string) => `ballwise:iq:visits:v1:${owner ?? "guest"}`;
const memory = new Map<string, string[]>();
const MAX_VISITS = 48;
export function journeyVisits(
  owner?: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): string[] {
  const key = journeyVisitsKey(owner);
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    if (raw.length > 12000) return memory.get(key) ?? [];
    const value: unknown = JSON.parse(raw);
    if (
      Array.isArray(value) &&
      value.length <= MAX_VISITS &&
      value.every((id) => typeof id === "string" && id.length <= 100)
    )
      return value;
  } catch {
    /* A blocked browser store cannot make the current action unavailable. */
  }
  return memory.get(key) ?? [];
}
export function rememberJourneyEntry(
  owner: string | undefined,
  id: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  const key = journeyVisitsKey(owner),
    values = [...journeyVisits(owner, storage), id].slice(-MAX_VISITS);
  memory.set(key, values);
  try {
    storage.setItem(key, JSON.stringify(values));
  } catch {
    /* Per-tab fallback preserves rotation when storage is unavailable. */
  }
}
const fingerprint = (d: JourneyDefinition) => {
  const s = createJourney(d);
  return JSON.stringify([d.role, d.steps, s.initial]);
};
export function freshJourneyEntry(
  pool: readonly JourneyDefinition[],
  history: readonly JourneyAttempt[],
  mode: JourneyMode,
  fallback: JourneyDefinition,
  visits: readonly string[],
) {
  const byId = new Map(pool.map((d) => [d.id, d]));
  const last = byId.get(visits.at(-1) ?? "") ?? fallback;
  const different = pool.filter((d) => d.id !== visits.at(-1));
  if (!different.length) return pool[0] ?? fallback;
  const seen = new Set(visits);
  const unseen = different.filter((d) => !seen.has(d.id));
  const candidatePool = unseen.length ? unseen : different;
  const lastSetups = new Set(
    visits.slice(-4).flatMap((id) => (byId.has(id) ? [fingerprint(byId.get(id)!)] : [])),
  );
  const newSetups = candidatePool.filter((d) => !lastSetups.has(fingerprint(d)));
  const eligible = newSetups.length ? newSetups : candidatePool;
  const otherTopic = eligible.filter((d) => d.topicId !== last.topicId);
  return nextPractice(
    otherTopic.length ? otherTopic : eligible,
    history,
    mode,
    last,
    undefined,
    pool,
  );
}
