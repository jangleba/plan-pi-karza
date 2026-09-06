import type { Profile, SessionDay } from "@/lib/loadwise/types";
import type {
  CompletedSessionEntry,
  TrainingCategoryKey,
} from "@/lib/progress/progress";

/** Dzień mikrocyklu — wyłącznie realny plan i zapisane wykonanie. */
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
  byCategory: Record<TrainingCategoryKey, number>;
  nextWeekDirection: string;
}

const WEEKDAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

function isoMinus(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function planSessions(day: SessionDay): SessionDay[] {
  if (day.dayType === "rest" || day.isUnavailable) return [];
  return day.secondSession ? [day, day.secondSession] : [day];
}

export function buildMicrocycle(
  plan: SessionDay[],
  history: CompletedSessionEntry[],
  todayIso: string,
): MicrocycleReport {
  const dates = Array.from({ length: 7 }, (_, index) => isoMinus(todayIso, 6 - index));
  const fromIso = dates[0]!;
  const recentHistory = history.filter(
    (item) => item.date >= fromIso && item.date <= todayIso,
  );
  const recentPlan = plan.filter(
    (day) => day.date >= fromIso && day.date <= todayIso,
  );
  const byCategory: Record<TrainingCategoryKey, number> = {
    gym: 0,
    speed: 0,
    endurance: 0,
    ball: 0,
    club: 0,
    match: 0,
    recovery: 0,
  };

  for (const item of recentHistory) byCategory[item.category] += 1;

  const days: MicrocycleDay[] = dates.map((date) => {
    const planned = recentPlan.flatMap(planSessions).filter((item) => item.date === date);
    const completed = recentHistory.filter((item) => item.date === date);
    const dayRpes = completed
      .map((item) => item.rpe)
      .filter((rpe): rpe is number => rpe != null);
    return {
      date,
      weekdayLabel: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      planned: planned.length > 0,
      completed: completed.length > 0,
      category: completed[0]?.category ?? null,
      durationMin: completed.reduce((sum, item) => sum + item.durationMin, 0),
      rpe: dayRpes.length
        ? dayRpes.reduce((sum, value) => sum + value, 0) / dayRpes.length
        : null,
      isToday: date === todayIso,
    };
  });

  const plannedCount = recentPlan.flatMap(planSessions).length;
  const completedCount = recentHistory.length;
  const rpes = recentHistory
    .map((item) => item.rpe)
    .filter((rpe): rpe is number => rpe != null);
  const avgRpe = rpes.length
    ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length
    : null;
  const executionPct =
    plannedCount > 0
      ? Math.min(100, Math.round((completedCount / plannedCount) * 100))
      : null;
  const totalMinutes = recentHistory.reduce(
    (sum, item) => sum + item.durationMin,
    0,
  );

  let nextWeekDirection: string;
  if (plannedCount === 0) {
    nextWeekDirection = "Uzupełnij plan, aby rozpocząć kolejny mikrocykl.";
  } else if (executionPct != null && executionPct < 60) {
    nextWeekDirection =
      "Utrzymaj objętość i najpierw popraw regularność wykonania.";
  } else if (avgRpe != null && avgRpe >= 8) {
    nextWeekDirection =
      "Nie zwiększaj intensywności — ostatnie odczuwane obciążenie było wysokie.";
  } else if (executionPct === 100 && (avgRpe == null || avgRpe <= 7)) {
    nextWeekDirection =
      "Możesz progresować jedną zmienną zgodnie z następną jednostką planu.";
  } else {
    nextWeekDirection = "Utrzymaj obecną strukturę i zapisuj RPE po treningu.";
  }

  return {
    days,
    plannedCount,
    completedCount,
    executionPct,
    totalMinutes,
    avgRpe,
    byCategory,
    nextWeekDirection,
  };
}

export interface DirectionCard {
  stage: string;
  execution: string;
  loadSignal: string;
  limiter: string;
  nextStep: string;
  cta: { label: string; to: "plan" | "session"; date?: string };
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
  if (age <= 14) return "Etap jakości ruchu";
  if (age <= 16) return "Etap budowy siły strukturalnej";
  if (age <= 18) return "Etap rozwoju mocy i szybkości";
  return "Etap wydajności seniorskiej";
}

export function buildDirection(
  profile: Profile | null,
  micro: MicrocycleReport,
  nextSession: SessionDay | null,
): DirectionCard {
  const limiterKey = profile?.secondaryLimiter ?? null;
  const limiter =
    micro.avgRpe != null && micro.avgRpe >= 8
      ? "Wysokie obciążenie w mikrocyklu"
      : micro.executionPct != null && micro.executionPct < 60
        ? "Regularność wykonania"
        : limiterKey
          ? LIMITER_LABELS[limiterKey] ?? "Nieokreślony"
          : "Brak wskazanego ogranicznika";

  return {
    stage: developmentStage(profile?.age ?? null),
    execution:
      micro.executionPct != null
        ? `${micro.completedCount}/${micro.plannedCount} jednostek (${micro.executionPct}%)`
        : "Brak zaplanowanych jednostek",
    loadSignal:
      micro.completedCount > 0
        ? `${micro.totalMinutes} min pracy${
            micro.avgRpe != null ? ` · średnie RPE ${micro.avgRpe.toFixed(1)}` : ""
          }`
        : "Brak ukończonych jednostek w ostatnich 7 dniach",
    limiter,
    nextStep: micro.nextWeekDirection,
    cta: nextSession
      ? {
          label: "Otwórz następną jednostkę",
          to: "session",
          date: nextSession.date,
        }
      : { label: "Otwórz plan", to: "plan" },
  };
}
