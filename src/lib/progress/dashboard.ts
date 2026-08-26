import type { SessionDay, SessionCompletion, Profile } from "@/lib/loadwise/types";
import type { VisionTestResult } from "@/lib/vision/types";
import { GOAL_LABELS, SECONDARY_LIMITER_LABELS } from "@/lib/loadwise/labels";
import {
  TRAINING_CATEGORY_LABELS,
  changeOf,
  type CompletedSessionEntry,
  type MetricSeries,
  type TrainingCategoryKey,
} from "@/lib/progress/progress";
import type { MicrocycleReport } from "@/lib/progress/center";

// ---------------------------------------------------------------------------
// Pasek aktualnego cyklu — wyłącznie z zapisanego planu i profilu
// ---------------------------------------------------------------------------

export interface CycleBar {
  goalLabel: string;
  focusLabel: string;
  weekIndex: number; // 1-based
  weekCount: number;
  progressPct: number;
  hasPlan: boolean;
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = poniedziałek
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function weeksBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      (7 * 86400000),
  );
}

export function buildCycleBar(
  profile: Profile | null,
  plan: SessionDay[],
  todayIso: string,
): CycleBar {
  const dates = plan.map((d) => d.date).sort();
  const goalLabel = profile?.goal ? GOAL_LABELS[profile.goal] : "Cel nieustawiony";
  const focusLabel = profile?.secondaryLimiter
    ? SECONDARY_LIMITER_LABELS[profile.secondaryLimiter]
    : profile?.goal
      ? GOAL_LABELS[profile.goal]
      : "Obszar nieokreślony";

  if (dates.length === 0) {
    return {
      goalLabel,
      focusLabel,
      weekIndex: 0,
      weekCount: 0,
      progressPct: 0,
      hasPlan: false,
    };
  }

  const firstMonday = mondayOf(dates[0]!);
  const lastMonday = mondayOf(dates[dates.length - 1]!);
  const weekCount = Math.max(1, weeksBetween(firstMonday, lastMonday) + 1);
  const rawIndex = weeksBetween(firstMonday, mondayOf(todayIso)) + 1;
  const weekIndex = Math.min(weekCount, Math.max(1, rawIndex));

  const total = Date.parse(`${dates[dates.length - 1]!}T00:00:00Z`) -
    Date.parse(`${dates[0]!}T00:00:00Z`);
  const elapsed = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${dates[0]!}T00:00:00Z`);
  const progressPct =
    total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;

  return { goalLabel, focusLabel, weekIndex, weekCount, progressPct, hasPlan: true };
}

// ---------------------------------------------------------------------------
// Obciążenie treningowe: minuty × RPE z zapisanych sesji
// ---------------------------------------------------------------------------

export interface LoadDay {
  date: string;
  weekdayLabel: string;
  load: number;
  byCategory: Partial<Record<TrainingCategoryKey, number>>;
}

export interface LoadReport {
  days: LoadDay[];
  total: number;
  previousTotal: number;
  maxDayLoad: number;
  byCategory: Record<TrainingCategoryKey, number>;
  /** Jeden wniosek generowany regułami — nigdy diagnoza. */
  insight: string | null;
  hasData: boolean;
}

const WEEKDAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildLoadReport(
  history: CompletedSessionEntry[],
  todayIso: string,
): LoadReport {
  const dates = Array.from({ length: 7 }, (_, i) => isoMinus(todayIso, 6 - i));
  const byCategory: Record<TrainingCategoryKey, number> = {
    gym: 0,
    speed: 0,
    endurance: 0,
    club: 0,
    match: 0,
    recovery: 0,
  };

  const loadOf = (h: CompletedSessionEntry) =>
    h.rpe != null && h.durationMin > 0 ? h.durationMin * h.rpe : 0;

  const days: LoadDay[] = dates.map((date) => {
    const items = history.filter((h) => h.date === date);
    const cat: Partial<Record<TrainingCategoryKey, number>> = {};
    let load = 0;
    for (const h of items) {
      const l = loadOf(h);
      if (l <= 0) continue;
      load += l;
      cat[h.category] = (cat[h.category] ?? 0) + l;
      byCategory[h.category] += l;
    }
    return {
      date,
      weekdayLabel: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      load,
      byCategory: cat,
    };
  });

  const total = days.reduce((a, b) => a + b.load, 0);
  const prevFrom = isoMinus(todayIso, 13);
  const prevTo = isoMinus(todayIso, 7);
  const previousTotal = history
    .filter((h) => h.date >= prevFrom && h.date <= prevTo)
    .reduce((a, b) => a + loadOf(b), 0);

  let insight: string | null = null;
  if (total === 0) {
    insight = null;
  } else {
    const ranked = (Object.keys(byCategory) as TrainingCategoryKey[])
      .filter((k) => byCategory[k] > 0)
      .sort((a, b) => byCategory[b] - byCategory[a]);
    const top = ranked[0]!;
    if (byCategory.speed === 0) {
      insight = "Brakuje zapisanego bodźca szybkościowego w ostatnich 7 dniach.";
    } else if (previousTotal > 0 && total > previousTotal * 1.3) {
      insight = "Obciążenie wzrosło wyraźnie względem poprzedniego tygodnia.";
    } else if (previousTotal > 0 && total < previousTotal * 0.7) {
      insight = "Obciążenie spadło względem poprzedniego tygodnia.";
    } else {
      insight = `Najwięcej pracy wykonałeś w obszarze: ${TRAINING_CATEGORY_LABELS[top].toLowerCase()}.`;
    }
  }

  return {
    days,
    total,
    previousTotal,
    maxDayLoad: Math.max(1, ...days.map((d) => d.load)),
    byCategory,
    insight,
    hasData: total > 0,
  };
}

// ---------------------------------------------------------------------------
// Dowody rozwoju — tylko realne zdarzenia
// ---------------------------------------------------------------------------

export type EvidenceKind = "record" | "training" | "vision" | "regularity" | "match";

export interface EvidenceCard {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  value?: number;
  suffix?: string;
  to: "plan" | "vision" | "tests" | "history";
  isRecord?: boolean;
}

export function buildEvidence(
  micro: MicrocycleReport,
  series: MetricSeries[],
  vision: VisionTestResult[],
  history: CompletedSessionEntry[],
  todayIso: string,
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  const weekAgo = isoMinus(todayIso, 6);

  // Rekordy życiowe z serii pomiarowych (min. 2 pomiary, ostatni najlepszy)
  for (const s of series) {
    if (s.points.length < 2) continue;
    const values = s.points.map((p) => p.value);
    const best = s.lowerIsBetter ? Math.min(...values) : Math.max(...values);
    const last = s.points[s.points.length - 1]!;
    if (last.value !== best) continue;
    const c = changeOf(s);
    cards.push({
      id: `record:${s.id}`,
      kind: "record",
      title: `Nowy rekord: ${s.label}`,
      detail:
        c.changePct != null
          ? `${last.value} ${s.unit} · ${Math.abs(c.changePct).toFixed(1)}% lepiej`
          : `${last.value} ${s.unit}`,
      value: last.value,
      suffix: s.unit,
      to: "tests",
      isRecord: true,
    });
  }

  const weekTrainings = history.filter((h) => h.date >= weekAgo && h.date <= todayIso);
  if (weekTrainings.length > 0) {
    cards.push({
      id: "trainings-week",
      kind: "training",
      title: "Treningi w tym tygodniu",
      detail: `${weekTrainings.reduce((a, b) => a + b.durationMin, 0)} min zapisanej pracy`,
      value: weekTrainings.length,
      suffix: "wykonane",
      to: "plan",
    });
  }

  const matches = weekTrainings.filter((h) => h.category === "match");
  if (matches.length > 0) {
    cards.push({
      id: "matches-week",
      kind: "match",
      title: "Zapisane mecze",
      detail: `${matches.length} w ostatnich 7 dniach`,
      value: matches.length,
      to: "history",
    });
  }

  const validVision = vision.filter((v) => v.validityStatus !== "invalid");
  if (validVision.length > 0) {
    const latest = [...validVision].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]!;
    cards.push({
      id: "vision-latest",
      kind: "vision",
      title: `Vision Lab: ${latest.testName}`,
      detail:
        latest.mainResultValue != null
          ? `${latest.mainResultValue} ${latest.mainResultUnit ?? ""}`.trim()
          : "Analiza wykonana",
      value: latest.mainResultValue ?? undefined,
      suffix: latest.mainResultUnit ?? undefined,
      to: "vision",
    });
  }

  if (micro.executionPct != null && micro.plannedCount > 0) {
    cards.push({
      id: "regularity",
      kind: "regularity",
      title: "Realizacja planu",
      detail: `${micro.completedCount}/${micro.plannedCount} jednostek w mikrocyklu`,
      value: micro.executionPct,
      suffix: "%",
      to: "plan",
    });
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Mapa rozwoju — stany bez fikcyjnych ocen
// ---------------------------------------------------------------------------

export type AreaState =
  | "no_data"
  | "baseline"
  | "developing"
  | "improved"
  | "retest_due";

export const AREA_STATE_LABELS: Record<AreaState, string> = {
  no_data: "Brak danych",
  baseline: "Punkt odniesienia",
  developing: "Rozwijany",
  improved: "Poprawa potwierdzona",
  retest_due: "Czas na ponowny test",
};

export type AreaKey =
  | "speed"
  | "strength"
  | "endurance"
  | "perception"
  | "decisions"
  | "consistency";

export const AREA_LABELS: Record<AreaKey, string> = {
  speed: "Szybkość",
  strength: "Siła i moc",
  endurance: "Wydolność",
  perception: "Percepcja i reakcja",
  decisions: "Decyzje boiskowe",
  consistency: "Regularność treningowa",
};

export interface AreaNode {
  key: AreaKey;
  state: AreaState;
  evidence: string | null;
  date: string | null;
  change: string | null;
  nextAction: string;
}

const RETEST_DAYS = 28;

function daysSince(fromIso: string, todayIso: string): number {
  return Math.round(
    (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000,
  );
}

function areaFromSeries(
  key: AreaKey,
  list: MetricSeries[],
  todayIso: string,
  trainedRecently: boolean,
  nextAction: string,
): AreaNode {
  if (list.length === 0) {
    return {
      key,
      state: "no_data",
      evidence: null,
      date: null,
      change: null,
      nextAction,
    };
  }
  const withMost = [...list].sort((a, b) => b.points.length - a.points.length)[0]!;
  const c = changeOf(withMost);
  const age = daysSince(c.latest.date, todayIso);
  const state: AreaState =
    c.previous == null
      ? age > RETEST_DAYS
        ? "retest_due"
        : "baseline"
      : age > RETEST_DAYS
        ? "retest_due"
        : c.improved
          ? "improved"
          : trainedRecently
            ? "developing"
            : "baseline";
  return {
    key,
    state,
    evidence: `${withMost.label}: ${c.latest.value} ${withMost.unit}`,
    date: c.latest.date,
    change:
      c.changePct != null
        ? `${c.changePct > 0 ? "+" : "−"}${Math.abs(c.changePct).toFixed(1)}% względem poprzedniego pomiaru`
        : null,
    nextAction:
      state === "retest_due"
        ? `Powtórz test ${withMost.label}, aby potwierdzić kierunek zmiany.`
        : nextAction,
  };
}

export function buildDevelopmentMap(
  series: MetricSeries[],
  micro: MicrocycleReport,
  history: CompletedSessionEntry[],
  vision: VisionTestResult[],
  todayIso: string,
): AreaNode[] {
  const recent = (cat: TrainingCategoryKey) =>
    history.some((h) => h.category === cat && h.date >= isoMinus(todayIso, 13));

  const nodes: AreaNode[] = [
    areaFromSeries(
      "speed",
      series.filter((s) => s.category === "speed"),
      todayIso,
      recent("speed"),
      "Zaplanuj bodziec szybkościowy i powtórz pomiar sprintu.",
    ),
    areaFromSeries(
      "strength",
      series.filter((s) => s.category === "strength"),
      todayIso,
      recent("gym"),
      "Utrzymaj jednostkę siłową w tygodniu i sprawdź wyskok.",
    ),
    areaFromSeries(
      "endurance",
      series.filter((s) => s.category === "endurance"),
      todayIso,
      recent("endurance"),
      "Zapisz jednostkę wydolnościową, aby uzyskać punkt odniesienia.",
    ),
    areaFromSeries(
      "perception",
      series.filter((s) => s.category === "vision"),
      todayIso,
      vision.length > 0,
      "Wykonaj analizę w Vision Lab, aby zmierzyć jakość wykonania.",
    ),
  ];

  // Decyzje boiskowe — aplikacja nie zapisuje jeszcze wyników Football IQ.
  nodes.push({
    key: "decisions",
    state: "no_data",
    evidence: null,
    date: null,
    change: null,
    nextAction:
      "Wyniki scenariuszy Football IQ nie są jeszcze zapisywane, więc nie pokazujemy tu wartości.",
  });

  const consistencyState: AreaState =
    micro.plannedCount === 0
      ? "no_data"
      : micro.executionPct != null && micro.executionPct >= 80
        ? "improved"
        : micro.completedCount > 0
          ? "developing"
          : "baseline";
  nodes.push({
    key: "consistency",
    state: consistencyState,
    evidence:
      micro.plannedCount > 0
        ? `${micro.completedCount}/${micro.plannedCount} jednostek w mikrocyklu`
        : null,
    date: micro.days[micro.days.length - 1]?.date ?? null,
    change:
      micro.executionPct != null ? `Wykonanie ${micro.executionPct}%` : null,
    nextAction:
      consistencyState === "improved"
        ? "Utrzymaj obecny rytm tygodnia."
        : "Zamknij zaplanowane jednostki i zapisz RPE po treningu.",
  });

  return nodes;
}

// ---------------------------------------------------------------------------
// Historia — wspólna oś zdarzeń
// ---------------------------------------------------------------------------

export type TimelineKind = "training" | "test" | "record" | "vision" | "match";

export const TIMELINE_LABELS: Record<TimelineKind, string> = {
  training: "Trening",
  test: "Test",
  record: "Rekord",
  vision: "Vision Lab",
  match: "Mecz",
};

export interface TimelineEvent {
  id: string;
  date: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  link: { to: "session"; date: string } | { to: "vision" } | { to: "tests" };
}

export function buildTimeline(
  history: CompletedSessionEntry[],
  series: MetricSeries[],
  vision: VisionTestResult[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const h of history) {
    events.push({
      id: `t:${h.key}`,
      date: h.date,
      kind: h.category === "match" ? "match" : "training",
      title: h.title,
      detail: [
        TRAINING_CATEGORY_LABELS[h.category],
        h.durationMin ? `${h.durationMin} min` : null,
        h.rpe != null ? `RPE ${h.rpe}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      link: { to: "session", date: h.date },
    });
  }

  for (const s of series) {
    const values = s.points.map((p) => p.value);
    const best = s.lowerIsBetter ? Math.min(...values) : Math.max(...values);
    s.points.forEach((p, i) => {
      const isRecord = i > 0 && p.value === best;
      events.push({
        id: `m:${s.id}:${p.date}:${i}`,
        date: p.date,
        kind: isRecord ? "record" : s.id.startsWith("vision:") ? "vision" : "test",
        title: isRecord ? `Rekord: ${s.label}` : s.label,
        detail: `${p.value} ${s.unit}`,
        link: s.id.startsWith("vision:") ? { to: "vision" } : { to: "tests" },
      });
    });
  }

  void vision;

  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface TimelineWeek {
  weekStart: string;
  events: TimelineEvent[];
}

export function groupByWeek(events: TimelineEvent[]): TimelineWeek[] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const w = mondayOf(e.date);
    const arr = map.get(w) ?? [];
    arr.push(e);
    map.set(w, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, evs]) => ({ weekStart, events: evs }));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
