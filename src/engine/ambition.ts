/**
 * Cel zawodnika: „ambicja” (liga jako jego własne słowa) i cele treningowe na cykl, droga do celu (regularność, kamienie milowe)
 * oraz podsumowanie zakończonego cyklu. Wszystko liczone z danych treningu: nic nie zależy od awansu ani wyniku meczu.
 * Zapis tylko na urządzeniu (klucz `ambition`), bez synchronizacji.
 */
import { scoped } from "../lib/store";
import { LEAGUES, type League } from "./profile";
import { addDays, weekStartOf } from "./week";
import { adherence, type Metric, type PlannedDay, type WeekAdherence } from "./progress2";
import { series, type HistoryEvent } from "./history";

export const FOCUS = ["regularity", "jump", "sprint", "strength", "endurance"] as const;
export type Focus = (typeof FOCUS)[number];
export const FOCUS_LABEL: Record<Focus, string> = { regularity: "Regularność", jump: "Skok", sprint: "Sprint", strength: "Siła", endurance: "Wytrzymałość" };
export const MAX_FOCUS = 2;

/** Pytania „psychologiczne” kreatora celu: gdzie widzisz się za rok i gdzie chciałbyś być. Zapisujemy tylko identyfikator odpowiedzi. */
export const VISION: Array<[string, string]> = [
  ["higher", "W wyższej lidze"], ["starter", "Z pewnym miejscem w podstawowym składzie"], ["leader", "Jako lider drużyny"], ["fit", "Zdrowy i w życiowej formie"], ["same", "Tu, gdzie jestem – ale lepszy"],
];
export const DREAM: Array<[string, string]> = [
  ["pro", "W zawodowym klubie"], ["top", "W najlepszym klubie w regionie"], ["fun", "Gram dla frajdy na dobrym poziomie"], ["coach", "Przy piłce także po karierze – jako trener"], ["abroad", "Za granicą"],
];
export const visionLabel = (id?: string) => VISION.find(([k]) => k === id)?.[1];
export const dreamLabel = (id?: string) => DREAM.find(([k]) => k === id)?.[1];

export interface Ambition {
  /** Liga, w której zawodnik chce grać (jego własna ambicja; bez „nie wiem” pole zostaje puste). */
  league?: League;
  /** Dawne pole (kreator już o to nie pyta); stare zapisy nadal się odczytują. */
  focus: Focus[];
  /** Gdzie zawodnik widzi się za rok i gdzie chciałby być (identyfikatory z VISION i DREAM). */
  vision?: string;
  dream?: string;
  setAt: string;
}

/** Bezpieczny odczyt zapisu: nieznane ligi i cele są odrzucane, cele ograniczone do dwóch. */
export function parseAmbition(raw: unknown): Ambition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const focus = Array.isArray(r.focus) ? [...new Set(r.focus.filter((f): f is Focus => (FOCUS as readonly unknown[]).includes(f)))].slice(0, MAX_FOCUS) : [];
  const league = (LEAGUES as readonly unknown[]).includes(r.league) ? (r.league as League) : undefined;
  const vision = VISION.some(([k]) => k === r.vision) ? (r.vision as string) : undefined;
  const dream = DREAM.some(([k]) => k === r.dream) ? (r.dream as string) : undefined;
  if (!league && !focus.length && !vision && !dream) return null;
  return { ...(league ? { league } : {}), focus, ...(vision ? { vision } : {}), ...(dream ? { dream } : {}), setAt: typeof r.setAt === "string" ? r.setAt : "" };
}

const KEY = "ambition";
const DISMISS_KEY = "ambitionDismissed";

export function loadAmbition(): Ambition | null {
  try { return parseAmbition(JSON.parse(scoped.getItem(KEY) ?? "null")); } catch { return null; }
}
export function saveAmbition(a: Ambition): void { scoped.setItem(KEY, JSON.stringify(a)); }
export function clearAmbition(): void { scoped.removeItem(KEY); }
/** „Nie teraz” na karcie Startu: karta wraca po 14 dniach. */
export function dismissAmbitionCard(today: string): void { scoped.setItem(DISMISS_KEY, today); }
export function ambitionCardHidden(today: string): boolean {
  const d = scoped.getItem(DISMISS_KEY);
  return !!d && d > addDays(today, -14);
}

/* ------------------------------ cykl 5 tygodni ------------------------------ */

export interface Cycle {
  /** 0 = pierwszy cykl od startu planu. */
  index: number;
  /** Poniedziałek pierwszego i niedziela ostatniego tygodnia cyklu. */
  start: string;
  end: string;
  /** Tydzień w cyklu (1–5) dla podanej daty. */
  weekNo: number;
  /** Dni do końca cyklu (0 = ostatni dzień). */
  daysLeft: number;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Cykl (5 tygodni: 2× objętość, 2× intensywność, rozładowanie) liczony od poniedziałku tygodnia startu planu. */
export function cycleAt(startDate: string | undefined, date: string): Cycle {
  const startMonday = weekStartOf(startDate ?? date);
  const weeks = Math.max(0, Math.floor(daysBetween(startMonday, weekStartOf(date)) / 7));
  const index = Math.floor(weeks / 5);
  const start = addDays(startMonday, index * 35);
  const end = addDays(start, 34);
  return { index, start, end, weekNo: (weeks % 5) + 1, daysLeft: Math.max(0, daysBetween(date, end)) };
}

export function previousCycle(c: Cycle): Cycle | null {
  if (c.index <= 0) return null;
  const start = addDays(c.start, -35);
  return { index: c.index - 1, start, end: addDays(start, 34), weekNo: 5, daysLeft: 0 };
}

/* ------------------------------ regularność ------------------------------ */

export interface Regularity { planned: number; done: number; viaRest: number; pct: number | null }

/** Zaplanowane sesje cyklu: wykonane vs zaplanowane do dziś (dzisiejsza niewykonana i przyszłe nie są „pominięte”). */
export function cycleRegularity(planned: PlannedDay[], events: HistoryEvent[], cycle: Pick<Cycle, "start" | "end">, today: string): Regularity {
  const days = planned.filter((p) => p.date >= cycle.start && p.date <= cycle.end);
  const { cells } = adherence(days, events, today);
  let n = 0, done = 0, viaRest = 0;
  for (const c of cells.values()) {
    if (c.state === "done") { n++; done++; if (c.viaRest) viaRest++; }
    else if (c.state === "missed") n++;
  }
  return { planned: n, done, viaRest, pct: n ? Math.round((done / n) * 100) : null };
}

/* ------------------------------ kamienie milowe ------------------------------ */

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  /** Postęp do celu (np. 2 z 4); brak dla prostych kamieni. */
  value?: number;
  target?: number;
  /** Data pierwszego spełnienia. */
  achievedOn?: string;
}

const LAB_CORE = ["cmj", "broad-jump", "sprint-10"];
const earliest = (dates: string[]) => dates.sort()[0];

/** Kamienie milowe z danych treningu (bez awansu, bez zależności od wyników meczów). `weeks` z `adherence`. */
export function milestones(events: HistoryEvent[], weeks: WeekAdherence[], today: string): Milestone[] {
  const sessions = events.filter((e) => e.type === "session");
  const sessionDates = [...new Set(sessions.map((e) => `${e.date}|${e.key}`))].map((k) => k.split("|")[0]!).sort();
  const lab = events.filter((e) => e.type === "lab");
  const current = weekStartOf(today);
  const past = [...weeks].filter((w) => w.week < current && w.planned > 0).sort((a, b) => a.week.localeCompare(b.week));
  const good = (w: WeekAdherence) => w.planned >= 2 && w.done / w.planned >= 0.8;
  const firstGood = past.find(good);
  // najdłuższa seria tygodni z realizacją ≥ 80% i tydzień, w którym osiągnęła 4
  let run = 0, best = 0, reached4: string | undefined;
  for (const w of past) { run = good(w) ? run + 1 : 0; best = Math.max(best, run); if (run === 4 && !reached4) reached4 = addDays(w.week, 6); }
  const firstDates = LAB_CORE.map((k) => earliest(lab.filter((e) => e.key === k).map((e) => e.date)));
  const labDone = firstDates.filter(Boolean) as string[];
  const secondDates = LAB_CORE.concat("sprint-20", "sprint-30").map((k) => [...new Set(lab.filter((e) => e.key === k).map((e) => e.date))].sort()[1]).filter(Boolean) as string[];
  return [
    { id: "first-session", title: "Pierwsza sesja", done: sessionDates.length > 0, achievedOn: sessionDates[0] },
    { id: "week-80", title: "Tydzień z realizacją 80%+", done: !!firstGood, achievedOn: firstGood ? addDays(firstGood.week, 6) : undefined },
    { id: "streak-4", title: "4 tygodnie z rzędu 80%+", done: best >= 4, value: Math.min(best, 4), target: 4, achievedOn: reached4 },
    { id: "lab-first", title: "Pierwszy test w Labie", done: lab.length > 0, achievedOn: earliest(lab.map((e) => e.date)) },
    { id: "lab-all", title: "Wszystkie trzy testy Laba", done: labDone.length === 3, value: labDone.length, target: 3, achievedOn: labDone.length === 3 ? [...labDone].sort().at(-1) : undefined },
    { id: "lab-repeat", title: "Powtórka testu w Labie", done: secondDates.length > 0, achievedOn: earliest(secondDates) },
    { id: "sessions-20", title: "20 sesji", done: sessionDates.length >= 20, value: Math.min(sessionDates.length, 20), target: 20, achievedOn: sessionDates[19] },
  ];
}

/** Najbliższy niespełniony kamień milowy (z postępem, jeśli ma) albo null, gdy wszystkie zdobyte. */
export function nextMilestone(list: Milestone[]): Milestone | null {
  return list.find((m) => !m.done) ?? null;
}

/* ------------------------------ podsumowanie cyklu ------------------------------ */

export interface LabChange { metric: Metric; from?: number; to: number; delta?: number; improved: boolean | null }
export interface CycleRecord { metric: Metric; value: number; date: string }
export interface CycleSummary {
  cycle: Cycle;
  regularity: Regularity;
  lab: LabChange[];
  records: CycleRecord[];
  milestones: Milestone[];
}

/**
 * Podsumowanie zakończonego cyklu: regularność, zmiany w Labie (ostatni wynik w cyklu vs ostatni wcześniejszy),
 * rekordy ustanowione w cyklu (lepsze niż wszystkie wcześniejsze wyniki) i kamienie milowe zdobyte w cyklu.
 */
export function summarizeCycle(cycle: Cycle, planned: PlannedDay[], events: HistoryEvent[], metrics: Metric[], weeks: WeekAdherence[], today: string): CycleSummary {
  const inCycle = (d: string) => d >= cycle.start && d <= cycle.end;
  const lab: LabChange[] = [];
  const recs: CycleRecord[] = [];
  for (const m of metrics) {
    const s = series(events, m.type, m.key);
    const mine = s.filter((p) => inCycle(p.date));
    if (!mine.length) continue;
    const before = s.filter((p) => p.date < cycle.start);
    const better = (a: number, b: number) => (m.better === "higher" ? a > b : a < b);
    if (m.type === "lab") {
      const to = mine.at(-1)!.value;
      const from = before.at(-1)?.value;
      const delta = from === undefined ? undefined : to - from;
      lab.push({ metric: m, from, to, delta, improved: delta === undefined || Math.abs(delta) < 1e-9 ? null : better(to, from!) });
    }
    if (before.length) {
      const top = mine.reduce((a, b) => (better(b.value, a.value) ? b : a));
      if (before.every((p) => better(top.value, p.value))) recs.push({ metric: m, value: top.value, date: top.date });
    }
  }
  const all = milestones(events, weeks, today);
  return { cycle, regularity: cycleRegularity(planned, events, cycle, today), lab, records: recs, milestones: all.filter((m) => m.done && m.achievedOn && inCycle(m.achievedOn)) };
}
