import type {
  Profile,
  SessionDay,
} from "./types";
import {
  addDays,
  isoDate,
  isoDayOfWeek,
  parseIso,
} from "./labels";
import { assessDaySpeedLoad } from "./speedLoad";
import { validatePlanExerciseContract } from "./planExerciseContract";
import {
  classifySession,
  isBallTechnicalSession,
  isEnduranceSession,
  isMainGymSession,
  isMatchSession,
  isSpeedSession,
} from "./sessionClassification";
import { calculateWeeklyMinimumRequirements } from "./weeklyRequirements";

export type PersistedPlanIssueCode =
  | "missing-plan"
  | "stale-generator"
  | "club-day-mismatch"
  | "duplicate-speed-same-day"
  | "adjacent-speed-days"
  | "duplicate-dominant-stimulus"
  | "invalid-beginner-double"
  | "missing-weekly-minimum"
  | "match-date-mismatch"
  | "invalid-exercise-contract";

export interface PersistedPlanIssue {
  code: PersistedPlanIssueCode;
  date?: string;
  message: string;
}

export interface PersistedPlanValidation {
  valid: boolean;
  issues: PersistedPlanIssue[];
}

export function validatePersistedPlan(
  plan: SessionDay[],
  profile: Profile,
  engineVersion: string,
): PersistedPlanValidation {
  const issues: PersistedPlanIssue[] = [];

  if (plan.length === 0) {
    return {
      valid: false,
      issues: [
        {
          code: "missing-plan",
          message: "Brak aktywnego planu.",
        },
      ],
    };
  }

  if (
    plan.some(
      (day) =>
        day.generatorVersion !== engineVersion,
    )
  ) {
    issues.push({
      code: "stale-generator",
      message:
        "Plan został utworzony przez starszą wersję generatora.",
    });
  }

  // Only plans stamped by the canonical generator carry this numeric marker.
  if (plan.some((day) => typeof day.canonicalSchemaVersion === "number")) {
    for (const issue of validatePlanExerciseContract(plan)) {
      issues.push({
        code: "invalid-exercise-contract",
        date: issue.date,
        message: issue.message,
      });
    }
  }

  for (
    let index = 0;
    index < plan.length;
    index += 1
  ) {
    const day = plan[index];

    if (
      day.dayType === "club" &&
      !profile.clubTrainingDays.includes(
        isoDayOfWeek(parseIso(day.date)),
      )
    ) {
      issues.push({
        code: "club-day-mismatch",
        date: day.date,
        message:
          "Trening klubowy znajduje się w nieprawidłowym dniu.",
      });
    }

    const speed = assessDaySpeedLoad(day);

    if (day.secondSession) {
      const firstCategory = (day.classification ?? classifySession(day)).category;
      const secondCategory =
        (day.secondSession.classification ?? classifySession(day.secondSession)).category;
      if (firstCategory === secondCategory) {
        issues.push({
          code: "duplicate-dominant-stimulus",
          date: day.date,
          message: "Dwie sesje tego dnia mają ten sam główny bodziec.",
        });
      }
      if (
        (profile.level === "beginner" || profile.age < 16) &&
        day.secondSession.intensity !== "niska"
      ) {
        issues.push({
          code: "invalid-beginner-double",
          date: day.date,
          message: "Początkujący lub młodszy zawodnik ma drugą mocną sesję.",
        });
      }
    }

    if (speed.hasDuplicateRealSpeedExposures) {
      issues.push({
        code: "duplicate-speed-same-day",
        date: day.date,
        message:
          "Dzień zawiera więcej niż jedną realną ekspozycję szybkościową.",
      });
    }

    if (index === 0) continue;

    const previous = plan[index - 1];

    const consecutive =
      isoDate(
        addDays(parseIso(previous.date), 1),
      ) === day.date;

    if (!consecutive) continue;

    const previousSpeed =
      assessDaySpeedLoad(previous);

    if (
      previousSpeed.blocksAdjacentSpeedDay &&
      speed.realExposureCount > 0
    ) {
      issues.push({
        code: "adjacent-speed-days",
        date: day.date,
        message:
          "Realne ekspozycje szybkościowe występują dzień po dniu.",
      });
    }
  }

  const planDates = plan.map((day) => day.date).sort();
  if (
    profile.matchDate &&
    profile.matchDate >= planDates[0] &&
    profile.matchDate <= planDates[planDates.length - 1] &&
    !plan.some((day) => day.date === profile.matchDate && isMatchSession(day))
  ) {
    issues.push({
      code: "match-date-mismatch",
      date: profile.matchDate,
      message: "Stały termin meczu nie występuje w aktywnym planie.",
    });
  }

  const calendarWeeks = new Map<string, SessionDay[]>();
  for (const day of plan) {
    const date = parseIso(day.date);
    const monday = isoDate(addDays(date, 1 - isoDayOfWeek(date)));
    const week = calendarWeeks.get(monday) ?? [];
    week.push(day);
    calendarWeeks.set(monday, week);
  }
  for (const [monday, week] of calendarWeeks) {
    if (week.length !== 7) continue;
    const sessions = week.flatMap((day) =>
      [day, day.secondSession].filter(Boolean) as SessionDay[],
    );
    const matchCount = sessions.filter(isMatchSession).length;
    const requirements = calculateWeeklyMinimumRequirements(
      {
        seasonPhase: profile.seasonPhase,
        clubTrainingCount: sessions.filter((session) => session.dayType === "club").length,
        matchCount,
        isFullWeek: matchCount < 2,
      },
      { hasGym: profile.hasGym },
      profile.goal,
      {
        gymExperienceLevel: profile.gymExperienceLevel,
        hasActivePain:
          profile.painInjury || (profile.painLocations?.length ?? 0) > 0,
      },
    );
    const counts = {
      gym: sessions.filter(isMainGymSession).length,
      endurance: sessions.filter(isEnduranceSession).length,
      speed: sessions.filter(isSpeedSession).length,
      ball: sessions.filter(isBallTechnicalSession).length,
    };
    const missing = [
      counts.gym < requirements.requiredGymSessions ? "siła" : null,
      counts.endurance < requirements.requiredEnduranceSessions ? "wydolność" : null,
      counts.speed < requirements.requiredSpeedSessions ? "sprint" : null,
      counts.ball < requirements.requiredBallSessions ? "piłka" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      issues.push({
        code: "missing-weekly-minimum",
        date: monday,
        message: `Pełny tydzień nie realizuje minimum: ${missing.join(", ")}.`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function persistedPlanNeedsRegeneration(
  plan: SessionDay[],
  profile: Profile,
  engineVersion: string,
): boolean {
  return !validatePersistedPlan(
    plan,
    profile,
    engineVersion,
  ).valid;
}
