import { hasProtectedExecution } from "./dailyPlanCheckin";
import { ownTrainingAllowed } from "./availability";
import { addIsoDays } from "@/lib/isoDate";
import { automationCategory } from "./adaptiveWeek";
import type { Profile, SessionDay, SessionCompletion } from "./types";
import { assessDaySpeedLoad } from "./speedLoad";
import { dayHasGym, gymChangeBlockReason } from "./strengthScheduling";

export type RemovedSessionDecision =
  | { action: "already_covered" | "drop"; reason: string }
  | { action: "move"; target: SessionDay; reason: string }
  | {
      action: "ask";
      recommended: SessionDay;
      alternative: SessionDay;
      reason: string;
    };

function endOfIsoWeek(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  const day = parsed.getUTCDay() || 7;
  return addIsoDays(date, 7 - day);
}

function protectedDay(day: SessionDay): boolean {
  return Boolean(
    day.executionProtected ||
    day.isUnavailable ||
    day.externalCommitment ||
    day.dayType === "club" ||
    day.dayType === "match" ||
    ["MD", "MD-1", "MD+1"].includes(day.mdLabel ?? ""),
  );
}

function slots(plan: SessionDay[]): SessionDay[] {
  return plan.flatMap((day) => [day, day.secondSession].filter(Boolean) as SessionDay[]);
}

function candidateScore(
  target: SessionDay,
  plan: SessionDay[],
  profile: Pick<Profile, "age" | "level">,
): number {
  const previous = plan.find((day) => day.date === addIsoDays(target.date, -1));
  const next = plan.find((day) => day.date === addIsoDays(target.date, 1));
  const adjacentHard = [previous, next].some((day) =>
    Boolean(day && (day.intensity === "wysoka" || protectedDay(day))),
  );
  const cautious = profile.age < 16 || profile.level === "beginner";
  return (target.dayType === "rest" ? 5 : 3) - (adjacentHard ? (cautious ? 8 : 3) : 0);
}

/**
 * Propozycja po pominięciu jednostki. Najpierw pokrycie bodźca, potem terminy
 * zgodne z kalendarzem. UI wymaga akceptacji także pojedynczej propozycji.
 */
export function decideRemovedSession(input: {
  effectivePlan: SessionDay[];
  removed: SessionDay;
  todayIso: string;
  profile: Pick<Profile, "age" | "level"> &
    Partial<Pick<Profile, "individualTrainingDays" | "unavailableDays">>;
  completions?: Record<string, SessionCompletion>;
}): RemovedSessionDecision {
  const category = automationCategory(input.removed);
  const executed = (day: SessionDay) => hasProtectedExecution(day, input.completions);
  if (executed(input.removed))
    return { action: "drop", reason: "Rozpoczęta lub wykonana sesja nie jest przenoszona." };
  const demanding =
    category === "gym" || category === "speed" || input.removed.intensity === "wysoka";
  const eligible = (day: SessionDay) => {
    if (
      input.removed.blockPhaseLabel &&
      day.blockPhaseLabel &&
      input.removed.blockPhaseLabel !== day.blockPhaseLabel
    )
      return false;
    const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay() || 7;
    if (executed(day) || !ownTrainingAllowed(input.profile, weekday)) return false;
    if (!demanding) return true;
    // A conservative scheduling rule, not a numerical estimate of recovery or injury risk.
    return !input.effectivePlan.some(
      (neighbor) =>
        Math.abs(Date.parse(neighbor.date) - Date.parse(day.date)) <= 86400000 &&
        neighbor.date !== day.date &&
        [neighbor, neighbor.secondSession].some(
          (slot) =>
            slot &&
            (slot.intensity === "wysoka" ||
              slot.dayType === "club" ||
              slot.dayType === "match" ||
              dayHasGym(slot) ||
              assessDaySpeedLoad(slot).blocksAdjacentSpeedDay),
        ),
    );
  };
  if (!["gym", "speed", "endurance", "ball"].includes(category)) {
    return {
      action: "drop",
      reason: "Ta jednostka nie jest obowiązkowym bodźcem do odrabiania.",
    };
  }

  const weekEnd = endOfIsoWeek(input.todayIso);
  const future = input.effectivePlan.filter(
    (day) => day.date > input.todayIso && day.date <= weekEnd,
  );
  if (slots(future).some((session) => automationCategory(session) === category)) {
    return {
      action: "already_covered",
      reason: "Ten sam bodziec jest już później w tym tygodniu.",
    };
  }

  const ranked = future
    .filter(
      (day) =>
        !protectedDay(day) &&
        eligible(day) &&
        (category !== "gym" ||
          !gymChangeBlockReason(
            input.effectivePlan,
            day.date,
            moveSessionToDay(input.removed, day),
          )) &&
        day.secondSession == null &&
        (day.dayType === "rest" || day.dayType === "recovery" || day.intensity === "niska"),
    )
    .map((day) => ({
      day,
      score: candidateScore(day, input.effectivePlan, input.profile),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.day.date.localeCompare(b.day.date));

  if (ranked.length === 0) {
    return {
      action: "drop",
      reason: "Nie ma bezpiecznego miejsca; sesja nie jest nadrabiana na siłę.",
    };
  }
  if (ranked.length === 1 || ranked[0].score > ranked[1].score) {
    return {
      action: "move",
      target: ranked[0].day,
      reason: "To jedyne wyraźnie najbezpieczniejsze wolne miejsce w tygodniu.",
    };
  }
  return {
    action: "ask",
    recommended: ranked[0].day,
    alternative: ranked[1].day,
    reason: "Dwa terminy są podobnie bezpieczne; potrzebna jest jedna decyzja zawodnika.",
  };
}

export function moveSessionToDay(source: SessionDay, target: SessionDay): SessionDay {
  return {
    ...source,
    dbId: undefined,
    sessionId: undefined,
    dayDbId: target.dayDbId,
    date: target.date,
    dayName: target.dayName,
    dayOfWeek: target.dayOfWeek,
    mdLabel: target.mdLabel,
    mdRelation: target.mdRelation,
    blockWeekNumber: target.blockWeekNumber,
    blockPhaseLabel: target.blockPhaseLabel,
    weekMeta: target.weekMeta,
    slotLabel: null,
    secondSession: null,
    reason: "Zawodnik zaakceptował przeniesienie sesji do terminu sprawdzonego w kalendarzu.",
    whyToday: "To wolne, niechronione miejsce w bieżącym tygodniu.",
  };
}
