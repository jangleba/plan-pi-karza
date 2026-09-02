import type { SessionDay, SessionCompletion, Profile } from "@/lib/loadwise/types";
import {
  changeOf,
  type CompletedSessionEntry,
  type MetricChange,
  type MetricSeries,
  type TrainingCategoryKey,
} from "@/lib/progress/progress";

/** Dzień mikrocyklu — realne dane z planu i logów, bez syntetycznych wyników. */
export interface MicrocycleDay {
  date: string;
  weekdayLabel: string;
  planned: boolean;
  completed: boolean;
  category: TrainingCategoryKey | null;
  durationMin: number;
  rpe: number | null;
  isToday: boolean;
}

export interface MicrocycleReport {
  days: MicrocycleDay[];
  plannedCount: number;
  completedCount: number;
  executionPct: number | null;
  totalMinutes: number;
  avgRpe: number | null;
  testsCount: number;
  byCategory: Record<TrainingCategoryKey, number>;
  /** Kierunek na kolejny tydzień, wyprowadzony z wykonania i RPE. */
  nextWeekDirection: string;
}

const WEEKDAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildMicrocycle(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  history: CompletedSessionEntry[],
  testDates: string[],
  todayIso: string,
): MicrocycleReport {
  const dates = Array.from({ length: 7 }, (_, i) => isoMinus(todayIso, 6 - i));
  const historyByDate = new Map(history.map((h) => [h.date, h]));
  const byCategory: Record<TrainingCategoryKey, number> = {
    gym: 0,
    speed: 0,
    endurance: 0,
    club: 0,
    match: 0,
    recovery: 0,
  };

  const days: MicrocycleDay[] = dates.map((date) => {
    const day = plan.find((p) => p.date === date) ?? null;
    const id = day ? (day.dbId ?? day.sessionId) : null;
    const completion = id ? completions[id] : undefined;
    const h = historyByDate.get(date) ?? null;
    if (h) byCategory[h.category] += 1;
    return {
      date,
      weekdayLabel: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      planned: !!day && day.dayType !== "rest" && !day.isUnavailable,
      completed: !!completion?.completed,
      category: h?.category ?? null,
      durationMin: h?.durationMin ?? day?.durationMin ?? 0,
      rpe: completion?.rpe ?? null,
      isToday: date === todayIso,
    };
  });

  const plannedCount = days.filter((d) => d.planned).length;
  const completedCount = days.filter((d) => d.completed).length;
  const rpes = days.map((d) => d.rpe).filter((r): r is number => r != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const executionPct =
    plannedCount > 0
      ? Math.min(100, Math.round((completedCount / plannedCount) * 100))
      : null;
  const totalMinutes = days
    .filter((d) => d.completed)
    .reduce((a, b) => a + (b.durationMin || 0), 0);

  let nextWeekDirection: string;
  if (plannedCount === 0) {
    nextWeekDirection = "Brak zaplanowanych jednostek w tym mikrocyklu.";
  } else if (executionPct != null && executionPct < 60) {
    nextWeekDirection =
      "Wykonanie poniżej planu — kolejny tydzień utrzymaj bez zwiększania objętości.";
  } else if (avgRpe != null && avgRpe >= 8) {
    nextWeekDirection =
      "Wysokie odczuwane obciążenie — kolejny tydzień bez wzrostu intensywności.";
  } else if (executionPct === 100 && (avgRpe == null || avgRpe <= 7)) {
    nextWeekDirection =
      "Pełne wykonanie przy kontrolowanym obciążeniu — możliwa progresja jednej zmiennej.";
  } else {
    nextWeekDirection = "Utrzymaj obecną strukturę tygodnia.";
  }

  return {
    days,
    plannedCount,
    completedCount,
    executionPct,
    totalMinutes,
    avgRpe,
    testsCount: testDates.filter((d) => d >= dates[0]! && d <= todayIso).length,
    byCategory,
    nextWeekDirection,
  };
}

// ---------------- Kierunek zawodnika ----------------

export interface DirectionCard {
  stage: string;
  execution: string;
  detectedChange: string;
  limiter: string;
  nextStep: string;
  cta: { label: string; to: "test" | "session"; date?: string };
}

const LIMITER_LABELS: Record<string, string> = {
  speed: "Szybkość",
  strength: "Siła",
  endurance: "Wydolność",
  cod: "Zmiana kierunku",
  power: "Moc",
  ball: "Technika z piłką",
  fatigue: "Zmęczenie i regeneracja",
  return: "Powrót po przerwie",
};

export function developmentStage(age: number | null): string {
  if (age == null) return "Etap nieokreślony";
  if (age <= 12) return "Etap koordynacji i techniki";
  if (age <= 14) return "Etap jakości ruchu (okołoskokowy)";
  if (age <= 16) return "Etap budowy siły strukturalnej";
  if (age <= 18) return "Etap rozwoju mocy i szybkości";
  return "Etap wydajności seniorskiej";
}

export function buildDirection(
  profile: Profile | null,
  micro: MicrocycleReport,
  improvement: MetricChange | null,
  series: MetricSeries[],
  nextSession: SessionDay | null,
): DirectionCard {
  const limiterKey = profile?.secondaryLimiter ?? null;
  const limiter = limiterKey
    ? LIMITER_LABELS[limiterKey] ?? "Nieokreślony"
    : micro.avgRpe != null && micro.avgRpe >= 8
      ? "Wysokie obciążenie w mikrocyklu"
      : micro.executionPct != null && micro.executionPct < 60
        ? "Regularność wykonania"
        : "Brak wskazanego ogranicznika";

  const detectedChange =
    improvement && improvement.changePct != null
      ? `${improvement.series.label}: ${improvement.latest.value} ${improvement.series.unit} (${Math.abs(improvement.changePct).toFixed(1)}% lepiej)`
      : series.length > 0
        ? "Za mało powtórzonych pomiarów, aby wykryć zmianę."
        : "Brak pomiarów kontrolnych.";

  const needsTest = series.length === 0 || improvement == null;
  const nextStep = needsTest
    ? series.length === 0
      ? "Wykonaj pierwszy test kontrolny, aby uzyskać punkt odniesienia."
      : `Powtórz test ${series[0]!.label}, aby porównać wynik.`
    : `Utrzymaj wynik w teście ${improvement!.series.label} przy kolejnym pomiarze.`;

  return {
    stage: developmentStage(profile?.age ?? null),
    execution:
      micro.executionPct != null
        ? `${micro.completedCount}/${micro.plannedCount} jednostek (${micro.executionPct}%)`
        : "Brak zaplanowanych jednostek",
    detectedChange,
    limiter,
    nextStep,
    cta:
      needsTest || !nextSession
        ? { label: "Przejdź do testów", to: "test" }
        : { label: "Otwórz następną jednostkę", to: "session", date: nextSession.date },
  };
}

// ---------------- Podsumowanie testów ----------------

export interface TestSummaryRow {
  series: MetricSeries;
  change: MetricChange;
  best: number;
  isPersonalBest: boolean;
  /** Zalecany termin powtórzenia (28 dni od ostatniego pomiaru). */
  retestDueIso: string;
  daysToRetest: number;
  conditions: string | null;
}

const RETEST_INTERVAL_DAYS = 28;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000,
  );
}

export function buildTestSummaries(
  series: MetricSeries[],
  todayIso: string,
): TestSummaryRow[] {
  return series.map((s) => {
    const c = changeOf(s);
    const values = s.points.map((p) => p.value);
    const best = s.lowerIsBetter ? Math.min(...values) : Math.max(...values);
    const conditionParts: string[] = [];
    const retestDueIso = addDays(c.latest.date, RETEST_INTERVAL_DAYS);
    return {
      series: s,
      change: c,
      best,
      isPersonalBest: c.latest.value === best,
      retestDueIso,
      daysToRetest: diffDays(todayIso, retestDueIso),
      conditions: conditionParts.length ? conditionParts.join(" · ") : null,
    };
  });
}
