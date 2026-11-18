import { weekStartOf } from "./week";

export type EventType = "session" | "strength" | "mas" | "lab";

export interface HistoryEvent {
  date: string;
  type: EventType;
  /** session: rodzaj sesji; strength: id ćwiczenia (1RM); mas: "mas"; lab: id testu. */
  key: string;
  value: number;
}

export type TrendTone = "green" | "orange" | "red" | "neutral";
export type Better = "higher" | "lower";

/** Ostatnia wartość z każdego dnia, rosnąco po dacie. */
export function series(events: HistoryEvent[], type: EventType, key: string): Array<{ date: string; value: number }> {
  const byDate = new Map<string, number>();
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.type === type && e.key === key) byDate.set(e.date, e.value);
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value }));
}

/**
 * Trend: ostatnia wartość vs średnia z do 3 poprzednich.
 * >= +1% zielony, do −1% neutralny, do −5% pomarańczowy, poniżej czerwony.
 * Dla metryk „im mniej, tym lepiej" (czas, tempo) znak jest odwrócony.
 */
export function trend(values: number[], better: Better = "higher"): { tone: TrendTone; pct: number } | null {
  if (values.length < 2) return null;
  const last = values[values.length - 1]!;
  const prev = values.slice(-4, -1);
  const base = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (!(base > 0)) return null;
  let pct = ((last - base) / base) * 100;
  if (better === "lower") pct = -pct;
  const tone: TrendTone = pct >= 1 ? "green" : pct > -1 ? "neutral" : pct > -5 ? "orange" : "red";
  return { tone, pct };
}

/** Liczba wykonanych sesji w tygodniach (klucz = poniedziałek), rosnąco. */
export function sessionsPerWeek(events: HistoryEvent[]): Array<{ date: string; value: number }> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "session") continue;
    const w = weekStartOf(e.date);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export function loadHistory(): HistoryEvent[] {
  try {
    const v = JSON.parse(localStorage.getItem("history") ?? "[]");
    return Array.isArray(v) ? (v as HistoryEvent[]) : [];
  } catch {
    return [];
  }
}

export function addEvents(events: HistoryEvent[]): HistoryEvent[] {
  const all = [...loadHistory(), ...events];
  try {
    localStorage.setItem("history", JSON.stringify(all));
  } catch {
    /* brak pamięci */
  }
  return all;
}
