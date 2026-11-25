import { scoped } from "../lib/store";
import { completionOf, finishRun, newRun, parseRun, resumable, type RunItem, type WorkoutRun } from "./run";
import { queueCompletion } from "../sync/client";

/**
 * Trwały stan treningu w toku (w przestrzeni bieżącego konta lub gościa) i stałe identyfikatory zapisów.
 * Ten sam trening dnia ma zawsze ten sam identyfikator – także gdy zawodnik kończy go raz w trybie treningowym,
 * a raz przyciskiem „Koniec sesji” – więc serwer nie dostanie dwóch wpisów.
 */
const RUN_KEY = "workoutRun";
const IDS_KEY = "runIds";
const DONE_KEY = "runsCompleted";

function completedIds(): string[] {
  try { const v = JSON.parse(scoped.getItem(DONE_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
}
const markCompleted = (id: string) => scoped.setItem(DONE_KEY, JSON.stringify([...completedIds().filter((x) => x !== id), id].slice(-60)));
export const isCompleted = (day: string, sessionKey: string): boolean => completedIds().includes(runIdFor(day, sessionKey));

export function uuid(): string {
  const c = globalThis.crypto as Partial<Crypto> | undefined;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Identyfikator zapisu dla (dzień, rodzaj sesji); trzymamy ostatnie 60 dni. */
export function runIdFor(day: string, sessionKey: string): string {
  let map: Record<string, string> = {};
  try { map = JSON.parse(scoped.getItem(IDS_KEY) ?? "{}") as Record<string, string>; } catch { /* nowa mapa */ }
  const k = `${day}|${sessionKey}`;
  if (typeof map[k] === "string") return map[k];
  map[k] = uuid();
  const keep = Object.keys(map).sort().slice(-60);
  scoped.setItem(IDS_KEY, JSON.stringify(Object.fromEntries(keep.map((x) => [x, map[x]]))));
  return map[k]!;
}

export const loadRun = (): WorkoutRun | null => parseRun(scoped.getItem(RUN_KEY));
export const saveRun = (r: WorkoutRun): void => scoped.setItem(RUN_KEY, JSON.stringify(r));
export const clearRun = (): void => scoped.removeItem(RUN_KEY);

/** Trening do wznowienia (dowolnego dnia w oknie 18 h) – do karty na „Dziś”. */
export function activeRun(now = Date.now()): WorkoutRun | null {
  const r = loadRun();
  return resumable(r, now) ? r : null;
}

/** Start albo wznowienie treningu tej sesji. */
export function openRun(p: { day: string; sessionKey: string; title: string; items: Array<Omit<RunItem, "setsDone">> }, now = Date.now()): WorkoutRun {
  const cur = loadRun();
  if (cur && resumable(cur, now) && cur.date === p.day && cur.sessionKey === p.sessionKey) return cur;
  const r = newRun({ id: runIdFor(p.day, p.sessionKey), date: p.day, sessionKey: p.sessionKey, title: p.title, items: p.items }, now);
  saveRun(r);
  return r;
}

/** Zakończenie: zapis lokalny, potem kolejka do wysłania. Zwraca zapis wykonania. */
export function completeRun(r: WorkoutRun, now = Date.now()) {
  const done = finishRun(r, now);
  saveRun(done);
  const c = completionOf(done);
  if (c) { markCompleted(c.id); queueCompletion(c); }
  clearRun();
  return c;
}

/** „Koniec sesji” bez trybu treningowego: wpis wykonania z tym samym identyfikatorem dnia. */
export function completeWithoutRun(day: string, sessionKey: string, title: string, now = Date.now()) {
  const cur = loadRun();
  if (cur && cur.date === day && cur.sessionKey === sessionKey && cur.status === "active") return completeRun(cur, now);
  if (isCompleted(day, sessionKey)) return null; // zapisany już w trybie treningowym – nie nadpisujemy wykonania
  const r = newRun({ id: runIdFor(day, sessionKey), date: day, sessionKey, title, items: [{ key: "main", label: title, setsTotal: 1 }] }, now);
  return completeRun({ ...r, items: r.items.map((i) => ({ ...i, setsDone: i.setsTotal })) }, now);
}
