import { countdown, parseCountdown, pause, remaining, start, type Countdown } from "./timer";

/**
 * Trening w toku: zapisywany po KAŻDEJ zmianie (odhaczona seria, start przerwy), żeby zamknięcie karty, telefon
 * w kieszeni, zabicie aplikacji przez system albo brak baterii nie kasowały postępu. Po powrocie zawodnik wznawia.
 *
 * `id` to klucz idempotencji: ten sam trening zapisany dwa razy (dwa dotknięcia, ponowna wysyłka po utracie sieci)
 * jest na serwerze jednym wpisem.
 */
export interface RunItem { key: string; label: string; setsTotal: number; setsDone: number }

export interface WorkoutRun {
  v: 1;
  id: string;
  date: string; // YYYY-MM-DD (dzień planu)
  sessionKey: string; // rodzaj sesji z planu (strength, sprint, run, recovery, technique…)
  title: string;
  status: "active" | "finished";
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  items: RunItem[];
  timer: Countdown | null;
  /** Ile sekund ćwiczenia/przerw upłynęło w pauzach (do czasu trwania treningu nie liczymy pauz). */
  pausedMs: number;
  pausedSince: number | null;
}

/** Wpis „wykonania” wysyłany na serwer. */
export interface CompletionRecord {
  id: string;
  day: string;
  sessionKey: string;
  status: "done" | "partial";
  setsDone: number;
  setsTotal: number;
  startedAt: string;
  finishedAt: string;
  durationS: number;
  clientUpdatedAt: string;
}

/** Trening można wznowić przez 18 h od ostatniej zmiany (np. przerwany wieczorem, dokończony rano). */
export const RESUME_WINDOW_MS = 18 * 3_600_000;

export function newRun(p: { id: string; date: string; sessionKey: string; title: string; items: Array<Omit<RunItem, "setsDone">> }, now: number): WorkoutRun {
  return {
    v: 1, id: p.id, date: p.date, sessionKey: p.sessionKey, title: p.title, status: "active",
    startedAt: now, updatedAt: now, finishedAt: null,
    items: p.items.map((i) => ({ ...i, setsTotal: Math.max(1, Math.round(i.setsTotal)), setsDone: 0 })),
    timer: null, pausedMs: 0, pausedSince: null,
  };
}

const touch = (r: WorkoutRun, now: number): WorkoutRun => ({ ...r, updatedAt: Math.max(r.updatedAt, now) });

/** Odhacz kolejną serię (albo cofnij ostatnią, gdy `undo`). */
export function markSet(r: WorkoutRun, key: string, now: number, undo = false): WorkoutRun {
  if (r.status !== "active") return r;
  const items = r.items.map((i) => i.key !== key ? i : { ...i, setsDone: Math.min(i.setsTotal, Math.max(0, i.setsDone + (undo ? -1 : 1))) });
  return touch({ ...r, items }, now);
}

export function startTimer(r: WorkoutRun, ms: number, label: string, now: number): WorkoutRun {
  if (r.status !== "active") return r;
  return touch({ ...r, timer: start(countdown(ms, label), now) }, now);
}

export function setTimer(r: WorkoutRun, t: Countdown | null, now: number): WorkoutRun {
  return touch({ ...r, timer: t }, now);
}

/** Pauza całego treningu (np. telefon od trenera): stoper przerwy też staje. */
export function pauseRun(r: WorkoutRun, now: number): WorkoutRun {
  if (r.status !== "active" || r.pausedSince !== null) return r;
  return touch({ ...r, pausedSince: now, timer: r.timer ? pause(r.timer, now) : null }, now);
}

export function resumeRun(r: WorkoutRun, now: number): WorkoutRun {
  if (r.pausedSince === null) return r;
  return touch({ ...r, pausedMs: r.pausedMs + Math.max(0, now - r.pausedSince), pausedSince: null, timer: r.timer && remaining(r.timer, now) > 0 ? start(r.timer, now) : r.timer }, now);
}

export const totals = (r: WorkoutRun) => r.items.reduce((a, i) => ({ done: a.done + i.setsDone, total: a.total + i.setsTotal }), { done: 0, total: 0 });

/** Czas aktywny w sekundach (bez pauz). */
export function activeSeconds(r: WorkoutRun, now: number): number {
  const end = r.finishedAt ?? now;
  const paused = r.pausedMs + (r.pausedSince !== null ? Math.max(0, end - r.pausedSince) : 0);
  return Math.max(0, Math.round((end - r.startedAt - paused) / 1000));
}

/** Zakończenie: drugi „Zakończ” nic nie zmienia (ochrona przed podwójnym dotknięciem). */
export function finishRun(r: WorkoutRun, now: number): WorkoutRun {
  if (r.status === "finished") return r;
  const base = r.pausedSince !== null ? resumeRun(r, now) : r;
  return { ...base, status: "finished", finishedAt: now, updatedAt: Math.max(base.updatedAt, now), timer: null };
}

export function completionOf(r: WorkoutRun): CompletionRecord | null {
  if (r.status !== "finished" || r.finishedAt === null) return null;
  const t = totals(r);
  return {
    id: r.id, day: r.date, sessionKey: r.sessionKey,
    status: t.total > 0 && t.done >= t.total ? "done" : "partial",
    setsDone: t.done, setsTotal: t.total,
    startedAt: new Date(r.startedAt).toISOString(), finishedAt: new Date(r.finishedAt).toISOString(),
    durationS: activeSeconds(r, r.finishedAt), clientUpdatedAt: new Date(r.updatedAt).toISOString(),
  };
}

/** Czy zapisany trening nadaje się do wznowienia. */
export function resumable(r: WorkoutRun | null, now: number): r is WorkoutRun {
  return !!r && r.status === "active" && now - r.updatedAt < RESUME_WINDOW_MS && now >= r.startedAt - 60_000;
}

/** Odczyt z pamięci z walidacją: uszkodzony zapis nie może zablokować aplikacji. */
export function parseRun(raw: string | null): WorkoutRun | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<WorkoutRun>;
    if (o.v !== 1 || typeof o.id !== "string" || typeof o.date !== "string" || typeof o.sessionKey !== "string" || !Array.isArray(o.items)) return null;
    if (o.status !== "active" && o.status !== "finished") return null;
    const items = o.items.filter((i): i is RunItem => !!i && typeof i.key === "string" && typeof i.setsTotal === "number" && typeof i.setsDone === "number")
      .map((i) => ({ key: i.key, label: String(i.label ?? i.key), setsTotal: Math.max(1, i.setsTotal), setsDone: Math.min(i.setsTotal, Math.max(0, i.setsDone)) }));
    const n = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    return {
      v: 1, id: o.id, date: o.date, sessionKey: o.sessionKey, title: String(o.title ?? ""), status: o.status,
      startedAt: n(o.startedAt), updatedAt: n(o.updatedAt), finishedAt: typeof o.finishedAt === "number" ? o.finishedAt : null,
      items, timer: parseCountdown(o.timer), pausedMs: n(o.pausedMs), pausedSince: typeof o.pausedSince === "number" ? o.pausedSince : null,
    };
  } catch { return null; }
}
