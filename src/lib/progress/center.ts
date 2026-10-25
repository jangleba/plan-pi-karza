import { addIsoDays } from "@/lib/isoDate";
import type { Profile, SessionDay, SessionCompletion } from "@/lib/loadwise/types";
import { categoryOf } from "@/lib/progress/progress";
import type { CompletedSessionEntry, TrainingCategoryKey } from "@/lib/progress/progress";

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

function planSessions(day: SessionDay): SessionDay[] {
  if (day.isUnavailable) return [];
  return (day.secondSession ? [day, day.secondSession] : [day]).filter(
    (session) =>
      session.dayType !== "rest" && !session.isUnavailable && categoryOf(session) !== null,
  );
}

export function buildMicrocycle(
  plan: SessionDay[],
  history: CompletedSessionEntry[],
  todayIso: string,
): MicrocycleReport {
  const dates = Array.from({ length: 7 }, (_, index) => addIsoDays(todayIso, index - 6));
  const fromIso = dates[0]!;
  const recentHistory = history.filter((item) => item.date >= fromIso && item.date <= todayIso);
  const recentPlan = plan.filter((day) => day.date >= fromIso && day.date <= todayIso);
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
    const dayRpes = completed.map((item) => item.rpe).filter((rpe): rpe is number => rpe != null);
    return {
      date,
      weekdayLabel: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      planned: planned.length > 0,
      completed: completed.length > 0,
      category: completed[0]?.category ?? null,
      durationMin: completed.reduce((sum, item) => sum + item.durationMin, 0),
      rpe: dayRpes.length ? dayRpes.reduce((sum, value) => sum + value, 0) / dayRpes.length : null,
      isToday: date === todayIso,
    };
  });

  const plannedSessions = recentPlan.flatMap(planSessions);
  const plannedKeys = new Set(
    plannedSessions.map((session) => session.dbId ?? session.sessionId).filter(Boolean),
  );
  const matched = recentHistory.filter((item) => plannedKeys.has(item.key));
  const plannedCount = plannedSessions.length;
  const completedCount = new Set(matched.map((item) => item.key)).size;
  const rpes = recentHistory.map((item) => item.rpe).filter((rpe): rpe is number => rpe != null);
  const avgRpe = rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : null;
  const executionPct =
    plannedCount > 0 ? Math.min(100, Math.round((completedCount / plannedCount) * 100)) : null;
  const totalMinutes = recentHistory.reduce((sum, item) => sum + item.durationMin, 0);

  let nextWeekDirection: string;
  if (plannedCount === 0) {
    nextWeekDirection = "Uzupełnij plan, aby rozpocząć kolejny mikrocykl.";
  } else if (executionPct != null && executionPct < 60) {
    nextWeekDirection = "Utrzymaj objętość i najpierw popraw regularność wykonania.";
  } else if (avgRpe != null && avgRpe >= 8) {
    nextWeekDirection = "Nie zwiększaj intensywności — ostatnie odczuwane obciążenie było wysokie.";
  } else if (executionPct === 100 && matched.some((item) => item.rpe == null)) {
    nextWeekDirection =
      "Uzupełnij RPE po wykonanych jednostkach. Brak oceny nie jest podstawą do zwiększania obciążenia.";
  } else if (executionPct === 100 && avgRpe != null && avgRpe <= 7) {
    nextWeekDirection =
      "Trzymaj się dawki zapisanej w kolejnej jednostce planu. Sama realizacja nie jest podstawą do dokładania obciążenia.";
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
  cta: { label: string; to: "plan" | "session"; date?: string; slot?: 1 | 2 };
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
  nextSession: (SessionDay & { slot?: 1 | 2 }) | null,
): DirectionCard {
  const limiterKey = profile?.secondaryLimiter ?? null;
  const limiter =
    micro.avgRpe != null && micro.avgRpe >= 8
      ? "Wysokie obciążenie w mikrocyklu"
      : micro.executionPct != null && micro.executionPct < 60
        ? "Regularność wykonania"
        : limiterKey
          ? (LIMITER_LABELS[limiterKey] ?? "Nieokreślony")
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
          slot: nextSession.slot ?? 1,
        }
      : { label: "Otwórz plan", to: "plan" },
  };
}

/** Return the exact actionable slot; additional historical work cannot complete it. */
export function nextActionableSession(
  plan: SessionDay[],
  completions: Record<string, SessionCompletion>,
  todayIso: string,
): (SessionDay & { slot: 1 | 2 }) | null {
  return (
    plan
      .flatMap((day) =>
        day.isUnavailable
          ? []
          : [
              { ...day, slot: 1 as const },
              ...(day.secondSession
                ? [{ ...day.secondSession, date: day.date, slot: 2 as const }]
                : []),
            ],
      )
      .filter((session) => {
        const key = session.dbId ?? session.sessionId;
        const completion = key ? completions[key] : undefined;
        return (
          session.date >= todayIso &&
          session.dayType !== "rest" &&
          !session.isUnavailable &&
          !completion?.completed &&
          completion?.status !== "missed"
        );
      })
      .sort((a, b) => {
        const dateOrder = a.date.localeCompare(b.date);
        if (dateOrder) return dateOrder;
        const started = (session: SessionDay) => {
          const key = session.dbId ?? session.sessionId;
          return key && completions[key]?.status === "started" ? 0 : 1;
        };
        return started(a) - started(b) || a.slot - b.slot;
      })[0] ?? null
  );
}
