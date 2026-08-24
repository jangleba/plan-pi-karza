import type {
  SessionDay,
  SessionCompletion,
  TestResult,
} from "@/lib/loadwise/types";
import type { VisionTestResult } from "@/lib/vision/types";

/** Kategorie treningu używane w historii i filtrach zakładki Postęp. */
export type TrainingCategoryKey =
  | "gym"
  | "speed"
  | "endurance"
  | "club"
  | "match"
  | "recovery";

export const TRAINING_CATEGORY_LABELS: Record<TrainingCategoryKey, string> = {
  gym: "Siła",
  speed: "Szybkość",
  endurance: "Wydolność",
  club: "Klub",
  match: "Mecz",
  recovery: "Regeneracja",
};

export interface CompletedSessionEntry {
  key: string;
  date: string;
  title: string;
  category: TrainingCategoryKey;
  durationMin: number;
  rpe: number | null;
  notes: string;
}

function categoryOf(day: SessionDay): TrainingCategoryKey {
  const t = day.type ?? "";
  if (day.dayType === "match" || t === "match") return "match";
  if (day.isClubSession || t === "club_training") return "club";
  if (t === "strength_power") return "gym";
  if (t === "sprint_acceleration" || t === "cod_agility") return "speed";
  if (t === "endurance_running") return "endurance";
  if (t === "recovery" || t === "prehab_mobility" || t === "activation")
    return "recovery";
  if (day.isRecoveryOrPrehab) return "recovery";
  return "gym";
}

export function daysAgoIso(days: number, today = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Wszystkie ukończone sesje z zapisanego planu, najnowsze pierwsze. */
export function buildTrainingHistory(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
): CompletedSessionEntry[] {
  const out: CompletedSessionEntry[] = [];
  for (const day of plan) {
    const id = day.dbId ?? day.sessionId;
    if (!id) continue;
    const c = completions[id];
    if (!c?.completed) continue;
    if (day.dayType === "rest") continue;
    out.push({
      key: id,
      date: day.date,
      title: day.title,
      category: categoryOf(day),
      durationMin: day.durationMin ?? 0,
      rpe: c.rpe,
      notes: c.notes ?? "",
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface WindowSummary {
  completedCount: number;
  plannedCount: number;
  regularityPct: number | null;
  totalMinutes: number;
  avgRpe: number | null;
  testsCount: number;
}

export function summarizeWindow(
  plan: SessionDay[],
  history: CompletedSessionEntry[],
  testDates: string[],
  fromIso: string,
  toIso: string,
): WindowSummary {
  const inWindow = (d: string) => d >= fromIso && d <= toIso;
  const planned = plan.filter(
    (d) => inWindow(d.date) && d.dayType !== "rest" && !d.isUnavailable,
  ).length;
  const done = history.filter((h) => inWindow(h.date));
  const rpes = done.map((d) => d.rpe).filter((r): r is number => r != null);
  return {
    completedCount: done.length,
    plannedCount: planned,
    regularityPct:
      planned > 0 ? Math.min(100, Math.round((done.length / planned) * 100)) : null,
    totalMinutes: done.reduce((a, b) => a + (b.durationMin || 0), 0),
    avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
    testsCount: testDates.filter(inWindow).length,
  };
}

// ---------------- Wyniki testów ----------------

export type MetricCategoryKey = "speed" | "strength" | "endurance" | "vision";

export const METRIC_CATEGORY_LABELS: Record<MetricCategoryKey, string> = {
  speed: "Szybkość",
  strength: "Siła i moc",
  endurance: "Wydolność",
  vision: "Vision Lab",
};

export interface MetricPoint {
  date: string;
  value: number;
}

export interface MetricSeries {
  id: string;
  label: string;
  unit: string;
  category: MetricCategoryKey;
  lowerIsBetter: boolean;
  points: MetricPoint[]; // rosnąco po dacie
}

export interface MetricChange {
  series: MetricSeries;
  latest: MetricPoint;
  previous: MetricPoint | null;
  changePct: number | null;
  improved: boolean | null;
}

function lowerIsBetterTest(testType: string): boolean {
  return /sprint|five_ten_five|505|braking|sprint_to_stop|cod/.test(testType);
}

function visionCategory(result: VisionTestResult): MetricCategoryKey {
  if (result.testCategory === "sprint") return "speed";
  if (result.testCategory === "jump") return "strength";
  return "vision";
}

/** Buduje serie pomiarowe z lokalnych testów i wyników Vision Lab. */
export function buildMetricSeries(
  tests: TestResult[],
  vision: VisionTestResult[],
): MetricSeries[] {
  const map = new Map<string, MetricSeries>();

  const localMeta: Record<
    TestResult["type"],
    { label: string; unit: string; category: MetricCategoryKey; lower: boolean }
  > = {
    sprint: { label: "Sprint", unit: "s", category: "speed", lower: true },
    vertical: { label: "Wyskok pionowy", unit: "cm", category: "strength", lower: false },
    broad: { label: "Skok w dal z miejsca", unit: "cm", category: "strength", lower: false },
    technique: { label: "Technika", unit: "pkt", category: "vision", lower: false },
  };

  for (const t of tests) {
    const value = Number.parseFloat(String(t.value).replace(",", "."));
    if (!Number.isFinite(value)) continue;
    const meta = localMeta[t.type];
    const id = `local:${t.type}`;
    const s =
      map.get(id) ??
      ({
        id,
        label: meta.label,
        unit: meta.unit,
        category: meta.category,
        lowerIsBetter: meta.lower,
        points: [],
      } as MetricSeries);
    s.points.push({ date: t.date, value });
    map.set(id, s);
  }

  for (const r of vision) {
    if (r.mainResultValue == null) continue;
    if (r.validityStatus === "invalid") continue;
    const id = `vision:${r.testType}`;
    const s =
      map.get(id) ??
      ({
        id,
        label: r.testName,
        unit: r.mainResultUnit ?? "",
        category: visionCategory(r),
        lowerIsBetter: lowerIsBetterTest(r.testType),
        points: [],
      } as MetricSeries);
    s.points.push({ date: r.createdAt.slice(0, 10), value: r.mainResultValue });
    map.set(id, s);
  }

  return Array.from(map.values())
    .map((s) => ({
      ...s,
      points: [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .filter((s) => s.points.length > 0);
}

export function changeOf(series: MetricSeries): MetricChange {
  const points = series.points;
  const latest = points[points.length - 1]!;
  const previous = points.length > 1 ? points[points.length - 2]! : null;
  let changePct: number | null = null;
  let improved: boolean | null = null;
  if (previous && previous.value !== 0) {
    changePct = ((latest.value - previous.value) / Math.abs(previous.value)) * 100;
    improved = series.lowerIsBetter ? changePct < 0 : changePct > 0;
  }
  return { series, latest, previous, changePct, improved };
}

/** Największa realna poprawa (wymaga min. 2 pomiarów w tej samej serii). */
export function bestImprovement(series: MetricSeries[]): MetricChange | null {
  const changes = series
    .map(changeOf)
    .filter((c) => c.improved === true && c.changePct != null);
  if (!changes.length) return null;
  return changes.sort(
    (a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!),
  )[0]!;
}
