import { labDue, series } from "../engine";
import type { HistoryEvent, LabMethod, LabTest } from "../engine";

/** Opisy testów do kafelków Lab: co mierzy test, który zapis jest „głównym” wynikiem i w którą stronę jest lepiej. */
export const LAB_INFO: Record<LabTest["key"], { what: string; main: string; better: "up" | "down"; unit: string }> = {
  cmj: { what: "Moc nóg i wyskok", main: "cmj", better: "up", unit: "cm" },
  "broad-jump": { what: "Siła wybicia w poziomie", main: "broad-jump", better: "up", unit: "cm" },
  sprint: { what: "Przyspieszenie na 10–30 m", main: "sprint-10", better: "down", unit: "s" },
};

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export interface TestSummary {
  key: LabTest["key"];
  better: "up" | "down";
  points: Array<{ date: string; value: number }>;
  last?: { date: string; value: number; approx: boolean };
  prev?: number;
  /** Zmiana względem poprzedniego wyniku (w jednostce testu). */
  delta?: number;
  /** true = lepiej, false = gorzej, null = bez zmiany lub brak porównania. */
  improved: boolean | null;
  best?: number;
  due: boolean;
  /** Dni od ostatniego wyniku (z dowolnego zapisu tego testu). */
  daysSince?: number;
  /** Za ile dni test wypada ponownie (0 = dziś lub zaległy). */
  dueInDays: number;
}

/** Podsumowanie jednego testu z historii (jedno przejście po zapisach, bez ponownego wczytywania). */
export function summarizeTest(events: HistoryEvent[], test: LabTest, todayISO: string): TestSummary {
  const info = LAB_INFO[test.key];
  const keys = test.key === "sprint" ? ["sprint-10", "sprint-20", "sprint-30"] : [test.key];
  const points = series(events, "lab", info.main);
  const lastDate = events.filter((e) => e.type === "lab" && keys.includes(e.key)).map((e) => e.date).sort().pop();
  const lastPoint = points.at(-1);
  const prevPoint = points.length > 1 ? points[points.length - 2] : undefined;
  const method: LabMethod | undefined = events.filter((e) => e.type === "lab" && e.key === info.main && e.date === lastPoint?.date).at(-1)?.method;
  const delta = lastPoint && prevPoint ? lastPoint.value - prevPoint.value : undefined;
  const eps = 1e-9;
  const improved = delta === undefined || Math.abs(delta) < eps ? null : info.better === "up" ? delta > 0 : delta < 0;
  const vals = points.map((p) => p.value);
  const best = vals.length ? (info.better === "up" ? Math.max(...vals) : Math.min(...vals)) : undefined;
  const since = lastDate ? days(lastDate, todayISO) : undefined;
  return {
    key: test.key, better: info.better, points,
    last: lastPoint ? { date: lastPoint.date, value: lastPoint.value, approx: method === "video_estimate" } : undefined,
    prev: prevPoint?.value, delta, improved, best,
    due: labDue(lastDate, todayISO), daysSince: since, dueInDays: since === undefined ? 0 : Math.max(0, 35 - since),
  };
}

export interface LabCycle {
  total: number;
  /** Testy aktualne (nie wymagają powtórzenia). */
  current: number;
  due: LabTest["key"][];
  /** Najbliższy test do powtórzenia, gdy żaden nie jest zaległy. */
  next?: { key: LabTest["key"]; inDays: number };
}

export function labCycle(summaries: TestSummary[]): LabCycle {
  const due = summaries.filter((s) => s.due).map((s) => s.key);
  const upcoming = summaries.filter((s) => !s.due).sort((a, b) => a.dueInDays - b.dueInDays)[0];
  return { total: summaries.length, current: summaries.length - due.length, due, next: upcoming ? { key: upcoming.key, inDays: upcoming.dueInDays } : undefined };
}

const comma = (n: number, d: number) => n.toFixed(d).replace(".", ",");
/** Wartość testu do wyświetlenia: sprint 2 miejsca, reszta do 1 miejsca po przecinku, bez zbędnego „,0”. */
export function fmtValue(key: LabTest["key"] | string, v: number): string {
  if (key === "sprint" || key.startsWith("sprint")) return comma(v, 2);
  const t = comma(v, 1);
  return t.endsWith(",0") ? t.slice(0, -2) : t;
}

/** „+3,2 cm” / „−0,05 s” względem poprzedniego wyniku; pusty, gdy brak porównania. */
export function deltaText(key: LabTest["key"], s: TestSummary): string {
  if (s.delta === undefined) return "";
  if (Math.abs(s.delta) < 1e-9) return "bez zmiany";
  const info = LAB_INFO[key];
  return `${s.delta > 0 ? "+" : "−"}${fmtValue(key, Math.abs(s.delta))} ${info.unit}`;
}

/** Podpis statusu kafelka: „Do zrobienia”, „Za 12 dni” albo „Dziś”. */
export function statusText(s: TestSummary): string {
  if (!s.last) return "Do zrobienia";
  if (s.due) return "Czas na powtórkę";
  return s.dueInDays <= 0 ? "Dziś" : s.dueInDays === 1 ? "Za 1 dzień" : `Za ${s.dueInDays} dni`;
}

export const plDate = (iso: string) => iso.split("-").reverse().join(".");
