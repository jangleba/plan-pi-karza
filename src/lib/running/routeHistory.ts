import { buildKilometerSplits, sanitizeRoute } from "./metrics";
import type { KilometerSplit, RoutePoint, RunningActivityDraft } from "./types";

/**
 * Historia biegów z mapą, zapisana tylko w tym telefonie. Na konto trafia
 * wynik (czas, dystans, tempo, odcinki) przez kolejkę offline; współrzędne
 * trasy nie opuszczają urządzenia.
 */

const PREFIX = "ballwise:run-history:v1:";
export const HISTORY_LIMIT = 30;
/** Wystarcza na mapę i międzyczasy, a mieści się w pamięci przeglądarki. */
export const MAX_STORED_POINTS = 2500;

export interface RunHistoryEntry {
  schema: 1;
  sessionId: string;
  date: string;
  title: string;
  startedAt: string;
  durationSec: number;
  distanceM: number;
  avgPaceSecPerKm: number | null;
  splits: KilometerSplit[];
  /** [lat, lng, sekundy biegu, segment] — 5 miejsc po przecinku ≈ 1 m. */
  points: [number, number, number, number][];
}

const key = (owner: string) => `${PREFIX}${encodeURIComponent(owner)}`;

/** Zmniejsza liczbę punktów, zachowując początek i koniec każdego segmentu. */
export function thinRoute(route: RoutePoint[], max = MAX_STORED_POINTS): RoutePoint[] {
  if (route.length <= max) return route;
  const step = route.length / max;
  const keep = new Set<number>([0, route.length - 1]);
  for (let i = 0; i < max; i += 1) keep.add(Math.floor(i * step));
  route.forEach((point, index) => {
    if (index > 0 && route[index - 1].segment !== point.segment) {
      keep.add(index - 1);
      keep.add(index);
    }
  });
  return [...keep].sort((a, b) => a - b).map((index) => route[index]);
}

function isEntry(value: unknown): value is RunHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const x = value as RunHistoryEntry;
  return (
    x.schema === 1 &&
    typeof x.sessionId === "string" &&
    typeof x.date === "string" &&
    typeof x.title === "string" &&
    Number.isFinite(Date.parse(x.startedAt)) &&
    Number.isFinite(x.durationSec) &&
    x.durationSec > 0 &&
    Number.isFinite(x.distanceM) &&
    x.distanceM >= 0 &&
    Array.isArray(x.splits) &&
    Array.isArray(x.points) &&
    x.points.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 4 &&
        p.every((n) => typeof n === "number" && Number.isFinite(n)) &&
        Math.abs(p[0]) <= 90 &&
        Math.abs(p[1]) <= 180,
    )
  );
}

export function loadRunHistory(
  owner: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): RunHistoryEntry[] {
  try {
    const raw = storage.getItem(key(owner));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function historyEntryFromDraft(draft: RunningActivityDraft, title: string): RunHistoryEntry {
  const route = sanitizeRoute(draft.route);
  const splits = draft.splits.length ? draft.splits : buildKilometerSplits(route);
  return {
    schema: 1,
    sessionId: draft.sessionId,
    date: draft.date,
    title,
    startedAt: draft.startedAt,
    durationSec: draft.durationSec,
    distanceM: draft.distanceM,
    avgPaceSecPerKm: draft.avgPaceSecPerKm,
    splits,
    points: thinRoute(route).map((p) => [
      Number(p.lat.toFixed(5)),
      Number(p.lng.toFixed(5)),
      Math.round(p.elapsedSec * 10) / 10,
      p.segment ?? 0,
    ]),
  };
}

/**
 * Zapisuje bieg na początku historii (jeden wpis na sesję). Gdy brakuje
 * miejsca, usuwa najstarsze wpisy; zwraca false, jeśli nie zmieścił się nawet sam.
 */
export function saveRunToHistory(
  owner: string,
  entry: RunHistoryEntry,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): boolean {
  let list = [
    entry,
    ...loadRunHistory(owner, storage).filter((e) => e.sessionId !== entry.sessionId),
  ].slice(0, HISTORY_LIMIT);
  while (list.length) {
    try {
      storage.setItem(key(owner), JSON.stringify(list));
      return true;
    } catch {
      list = list.slice(0, -1);
    }
  }
  return false;
}

export function removeRunFromHistory(
  owner: string,
  sessionId: string,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): void {
  try {
    const list = loadRunHistory(owner, storage).filter((e) => e.sessionId !== sessionId);
    storage.setItem(key(owner), JSON.stringify(list));
  } catch {
    /* Historia jest dodatkiem; brak miejsca nie blokuje usunięcia wyniku. */
  }
}

export function historyRoute(entry: RunHistoryEntry): RoutePoint[] {
  const start = Date.parse(entry.startedAt);
  return entry.points.map(([lat, lng, elapsedSec, segment]) => ({
    lat,
    lng,
    elapsedSec,
    segment,
    recordedAt: new Date(start + elapsedSec * 1000).toISOString(),
  }));
}
