/**
 * Progres: realizacja planu, rekordy, wnioski i odżywianie – czyste funkcje na danych z historii.
 * Wnioski są wyłącznie opisem liczb z danych zawodnika; progi (np. „seria” = tydzień z realizacją ≥ 80%) są umowne.
 */
import { addDays, weekStartOf } from "./week";
import type { Better, HistoryEvent } from "./history";
import { series } from "./history";

export const KIND_PL: Record<string, string> = {
  strength: "Siła", run: "Bieganie", sprint: "Sprint", technique: "Technika", activation: "Aktywacja", recovery: "Regeneracja",
};

/* ------------------------------ zakres dat ------------------------------ */

export type Range = "4w" | "12w" | "all";
export const RANGE_DAYS: Record<Range, number> = { "4w": 28, "12w": 84, all: Infinity };

export function inRange<T extends { date: string }>(points: T[], range: Range, today: string): T[] {
  const d = RANGE_DAYS[range];
  if (!Number.isFinite(d)) return points;
  const from = addDays(today, -d);
  return points.filter((p) => p.date >= from);
}

/* ------------------------------ realizacja planu ------------------------------ */

export interface PlannedDay { date: string; kind: string }
export type CellState = "done" | "missed" | "planned" | "rest";
export interface Cell { date: string; state: CellState; kind?: string }
export interface WeekAdherence { week: string; planned: number; done: number }

/** Sesje wykonane (zdarzenia „session”) w dniach zaplanowanych; przyszłe dni nie liczą się jako pominięte. */
export function adherence(planned: PlannedDay[], events: HistoryEvent[], today: string, from?: string) {
  const doneSet = new Set(events.filter((e) => e.type === "session").map((e) => `${e.date}|${e.key}`));
  const days = planned.filter((p) => !from || p.date >= from);
  const cells = new Map<string, Cell>();
  for (const p of days) {
    const done = doneSet.has(`${p.date}|${p.kind}`);
    cells.set(p.date, { date: p.date, kind: p.kind, state: done ? "done" : p.date < today ? "missed" : "planned" });
  }
  const weeks = new Map<string, WeekAdherence>();
  for (const c of cells.values()) {
    if (c.state === "planned" && c.date > today) continue; // przyszłość – jeszcze nie oceniamy
    const w = weekStartOf(c.date);
    const x = weeks.get(w) ?? { week: w, planned: 0, done: 0 };
    x.planned++; if (c.state === "done") x.done++;
    weeks.set(w, x);
  }
  const list = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
  return { cells, weeks: list };
}

export const STREAK_MIN = 0.8;

/** Seria pełnych tygodni z realizacją ≥ 80% (tygodnie bez planu nie przerywają serii, ale jej nie wydłużają); bieżący tydzień pomijamy. */
export function streak(weeks: WeekAdherence[], today: string): number {
  const current = weekStartOf(today);
  let n = 0;
  for (const w of [...weeks].filter((x) => x.week < current).sort((a, b) => b.week.localeCompare(a.week))) {
    if (w.planned === 0) continue;
    if (w.done / w.planned >= STREAK_MIN) n++; else break;
  }
  return n;
}

/** Realizacja w ostatnich `n` pełnych tygodniach: { planned, done, pct } lub null bez planu. */
export function recentAdherence(weeks: WeekAdherence[], today: string, n = 4): { planned: number; done: number; pct: number } | null {
  const current = weekStartOf(today);
  const last = weeks.filter((w) => w.week < current).sort((a, b) => b.week.localeCompare(a.week)).slice(0, n);
  const planned = last.reduce((s, w) => s + w.planned, 0);
  if (!planned) return null;
  const done = last.reduce((s, w) => s + w.done, 0);
  return { planned, done, pct: Math.round((done / planned) * 100) };
}

/** Pominięte vs zaplanowane wg rodzaju sesji w oknie ostatnich `days` dni. */
export function byKind(cells: Map<string, Cell>, today: string, days = 28): Array<{ kind: string; planned: number; done: number }> {
  const from = addDays(today, -days);
  const m = new Map<string, { kind: string; planned: number; done: number }>();
  for (const c of cells.values()) {
    if (!c.kind || c.date < from || c.date > today || (c.state === "planned" && c.date > today)) continue;
    if (c.state === "planned") continue;
    const x = m.get(c.kind) ?? { kind: c.kind, planned: 0, done: 0 };
    x.planned++; if (c.state === "done") x.done++;
    m.set(c.kind, x);
  }
  return [...m.values()].sort((a, b) => b.planned - a.planned);
}

/** Sesje danego rodzaju w tygodniach (z zerami), rosnąco; bez bieżącego tygodnia. */
export function weeklyByKind(events: HistoryEvent[], kind: string, today: string): Array<{ date: string; value: number }> {
  const current = weekStartOf(today);
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "session" || e.key !== kind) continue;
    const w = weekStartOf(e.date);
    if (w >= current) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const all = [...events].filter((e) => e.type === "session").map((e) => weekStartOf(e.date)).filter((w) => w < current).sort();
  if (!all.length) return [];
  const out: Array<{ date: string; value: number }> = [];
  for (let w = all[0]!; w < current; w = addDays(w, 7)) out.push({ date: w, value: counts.get(w) ?? 0 });
  return out;
}

/* ------------------------------ rekordy ------------------------------ */

export interface Metric { type: HistoryEvent["type"]; key: string; title: string; unit: string; better: Better; group: "strength" | "speed" | "run" | "lab"; /** Miejsca po przecinku przy wyświetlaniu (domyślnie 1). */ dec?: number }
export interface RecordRow { metric: Metric; value: number; date: string; isNew: boolean; first: boolean; measurements: number }

/** Najlepsza wartość każdej metryki; „nowy” = rekord z ostatnich `recentDays` dni, ustanowiony po wcześniejszym pomiarze. */
export function records(events: HistoryEvent[], metrics: Metric[], today: string, recentDays = 14): RecordRow[] {
  const out: RecordRow[] = [];
  for (const m of metrics) {
    const s = series(events, m.type, m.key);
    if (!s.length) continue;
    let best = s[0]!;
    for (const p of s) if (m.better === "higher" ? p.value > best.value : p.value < best.value) best = p;
    const earlier = s.filter((p) => p.date < best.date);
    const beatsEarlier = earlier.length > 0 && earlier.every((p) => (m.better === "higher" ? p.value < best.value : p.value > best.value));
    out.push({ metric: m, value: best.value, date: best.date, measurements: s.length, first: s.length === 1, isNew: beatsEarlier && best.date >= addDays(today, -recentDays) });
  }
  return out.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.date.localeCompare(a.date));
}

/* ------------------------------ odżywianie ------------------------------ */

export interface NutritionDay { date: string; logged: boolean; carb: number; protein: number; waterMl: number; target: { carb: number; protein: number; waterMl: number } }
export const NUTRITION_OK = 0.85;

/** Dni z wpisami: ile razy osiągnięto ≥ 85% celu węglowodanów / białka / wody. Dni bez wpisów nie są „porażką” – są liczone osobno. */
export function nutritionSummary(days: NutritionDay[]) {
  const logged = days.filter((d) => d.logged);
  const ok = (f: (d: NutritionDay) => boolean) => logged.filter(f).length;
  const avg = (f: (d: NutritionDay) => number) => (logged.length ? Math.round((logged.reduce((s, d) => s + f(d), 0) / logged.length) * 100) : null);
  return {
    total: days.length,
    logged: logged.length,
    carbOk: ok((d) => d.carb >= NUTRITION_OK * d.target.carb),
    proteinOk: ok((d) => d.protein >= NUTRITION_OK * d.target.protein),
    waterOk: ok((d) => d.waterMl >= NUTRITION_OK * d.target.waterMl),
    avgCarbPct: avg((d) => d.carb / d.target.carb),
    avgProteinPct: avg((d) => d.protein / d.target.protein),
  };
}

/* ------------------------------ wnioski ------------------------------ */

const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const pl = (n: number, dec = 1) => (Math.round(n * 10 ** dec) / 10 ** dec).toFixed(dec).replace(/\.?0+$/, "").replace(".", ",");
export const fmtValue = (m: Metric, v: number) => pl(v, m.dec ?? 1);

/** Do 3 zdań opisujących liczby z danych zawodnika (bez zgadywania przyczyn). */
export function insights(input: {
  events: HistoryEvent[]; metrics: Metric[]; today: string;
  adherence: { pct: number; planned: number; done: number } | null;
  kinds: Array<{ kind: string; planned: number; done: number }>;
  nutrition: ReturnType<typeof nutritionSummary> | null;
}): string[] {
  const out: string[] = [];
  const { events, metrics, today } = input;
  const recs = records(events, metrics, today);

  const fresh = recs.find((r) => r.isNew);
  if (fresh) out.push(`Nowy rekord: ${fresh.metric.title} ${fmtValue(fresh.metric, fresh.value)}${fresh.metric.unit} (${fmtDate(fresh.date)}).`);

  // największa zmiana w ostatnich 8 tygodniach (pierwszy vs ostatni pomiar w oknie)
  let best: { m: Metric; pct: number; weeks: number } | null = null;
  for (const m of metrics) {
    const s = inRange(series(events, m.type, m.key), "12w", today).filter((p) => p.date >= addDays(today, -56));
    if (s.length < 2) continue;
    const a = s[0]!, b = s[s.length - 1]!;
    if (!(a.value > 0)) continue;
    let pct = ((b.value - a.value) / a.value) * 100;
    if (m.better === "lower") pct = -pct;
    if (Math.abs(pct) < 2) continue;
    const weeks = Math.max(1, Math.round((Date.parse(b.date) - Date.parse(a.date)) / (7 * 86_400_000)));
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { m, pct, weeks };
  }
  if (best && !(fresh && fresh.metric.key === best.m.key)) {
    out.push(`${best.m.title}: ${best.pct > 0 ? "+" : "−"}${pl(Math.abs(best.pct))}% w ${best.weeks} tyg.`);
  }

  if (input.adherence) {
    const a = input.adherence;
    const skipped = input.kinds.filter((k) => k.planned - k.done >= 2).sort((x, y) => y.planned - y.done - (x.planned - x.done))[0];
    out.push(`Zrealizowane ${a.done} z ${a.planned} zaplanowanych sesji (${a.pct}%) w ostatnich 4 tygodniach${skipped ? `; najczęściej pomijane: ${(KIND_PL[skipped.kind] ?? skipped.kind).toLowerCase()} (${skipped.planned - skipped.done} z ${skipped.planned})` : ""}.`);
  }

  const n = input.nutrition;
  if (n && n.logged >= 3 && out.length < 3) out.push(`Cel węglowodanów osiągnięty w ${n.carbOk} z ${n.logged} dni z wpisami (ostatnie ${n.total} dni).`);
  return out.slice(0, 3);
}
