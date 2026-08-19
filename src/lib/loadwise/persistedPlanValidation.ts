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

export type PersistedPlanIssueCode =
  | "missing-plan"
  | "stale-generator"
  | "club-day-mismatch"
  | "duplicate-speed-same-day"
  | "adjacent-speed-days"
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

  if (plan.some((day) => day.canonicalSchemaVersion !== undefined)) {
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
