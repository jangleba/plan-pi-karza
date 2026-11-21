import { EXERCISES } from "../engine";
import type { HistoryEvent, Metric } from "../engine";

export type Group = "strength" | "speed" | "run";
export const GROUP_TITLE: Record<Group, string> = { strength: "Siła", speed: "Sprint", run: "Bieganie" };
/** Rodzaj sesji w historii odpowiadający karcie. */
export const GROUP_KIND: Record<Group, string> = { strength: "strength", speed: "sprint", run: "run" };

const lab = (key: string, title: string, unit: string, better: "higher" | "lower", group: Metric["group"], dec = 1): Metric => ({ type: "lab", key, title, unit, better, group, dec });

/** Stałe metryki; 1RM dla ćwiczeń siłowych dochodzą z historii. */
export const STATIC_METRICS: Metric[] = [
  lab("sprint-10", "Sprint 10 m", " s", "lower", "speed", 2),
  lab("sprint-20", "Sprint 20 m", " s", "lower", "speed", 2),
  lab("sprint-30", "Sprint 30 m", " s", "lower", "speed", 2),
  lab("cmj", "CMJ", " cm", "higher", "speed"),
  lab("broad-jump", "Skok w dal", " cm", "higher", "speed", 0),
  { type: "mas", key: "mas", title: "MAS", unit: " km/h", better: "higher", group: "run", dec: 1 },
];

export function allMetrics(events: HistoryEvent[]): Metric[] {
  const keys = [...new Set(events.filter((e) => e.type === "strength").map((e) => e.key))];
  const lifts: Metric[] = keys.map((k) => ({ type: "strength", key: k, title: `${EXERCISES[k]?.name ?? k} 1RM`, unit: " kg", better: "higher", group: "strength", dec: 1 }));
  return [...lifts, ...STATIC_METRICS];
}

export const groupOf = (m: Metric): Group => (m.group === "strength" ? "strength" : m.group === "run" ? "run" : "speed");

export const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** „1 sesja”, „2 sesje”, „5 sesji”. */
export function sesji(n: number): string {
  const w = n === 1 ? "sesja" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "sesje" : "sesji";
  return `${n} ${w}`;
}
