import type { PlanInputsSnapshot, Profile } from "./types";
import type { WeeklyTargets } from "./engineV2/model";
import { resolveGoalPolicy } from "./engineV2/goalPolicy";

export interface WeeklyPlanningPreferences {
  weeklyTargets: WeeklyTargets;
  fillRestDays: boolean;
  minFullRestDays: 0 | 1 | 2;
}

export function defaultWeeklyTargets(profile: Profile): WeeklyTargets {
  return { strength: 2, speed: 1, endurance: resolveGoalPolicy(profile).extraEndurance ? 2 : 1 };
}

/** Only persisted, explicit choices enable custom planning after a reload. */
export function savedWeeklyPlanningPreferences(
  saved: PlanInputsSnapshot | undefined,
  profile: Profile,
): WeeklyPlanningPreferences | null {
  if (
    !saved ||
    (saved.weeklyTargets === undefined &&
      saved.fillRestDays === undefined &&
      saved.minFullRestDays === undefined)
  )
    return null;
  const targets =
    saved.weeklyTargets === undefined ? defaultWeeklyTargets(profile) : saved.weeklyTargets;
  if (
    !targets ||
    typeof targets !== "object" ||
    targets.strength !== 2 ||
    ![1, 2].includes(targets.speed) ||
    ![1, 2].includes(targets.endurance)
  )
    return null;
  const rest =
    saved.minFullRestDays === undefined ? (saved.fillRestDays ? 1 : 0) : saved.minFullRestDays;
  if (
    ![0, 1, 2].includes(rest) ||
    (saved.fillRestDays !== undefined && typeof saved.fillRestDays !== "boolean")
  )
    return null;
  return {
    weeklyTargets: { ...targets },
    fillRestDays: saved.fillRestDays ?? false,
    minFullRestDays: rest,
  };
}
