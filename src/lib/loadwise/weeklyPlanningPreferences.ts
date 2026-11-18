import type { PlanInputsSnapshot, Profile } from "./types";
import type { WeeklyTargets } from "./engineV2/model";
import { resolveGoalPolicy } from "./engineV2/goalPolicy";

export interface WeeklyPlanningPreferences {
  weeklyTargets: WeeklyTargets;
  fillRestDays: boolean;
  minFullRestDays: 0 | 1 | 2;
}

export function defaultWeeklyTargets(profile: Profile): WeeklyTargets {
  return {
    strength: 2,
    speed: "auto",
    endurance: resolveGoalPolicy(profile).extraEndurance ? 2 : 1,
  };
}

/** A new automatic choice never revives the fixed sprint count of an older plan. */
export function automaticWeeklyTargets(targets: WeeklyTargets): WeeklyTargets {
  return { ...targets, speed: "auto" };
}

export function isAutomaticSprintTarget(target: WeeklyTargets["speed"] | undefined): boolean {
  return target === undefined || target === "auto";
}

/** An extra exposure is an opportunity for a speed goal, never an automatic quota. */
export function shouldTryExtraSprint(
  profile: Profile,
  target: WeeklyTargets["speed"] | undefined,
): boolean {
  if (!isAutomaticSprintTarget(target)) return target === 2;
  const policy = resolveGoalPolicy(profile);
  return !policy.reduced && ["speed", "agility"].includes(policy.speedGoal);
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
    !["auto", 1, 2].includes(targets.speed) ||
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
    weeklyTargets: automaticWeeklyTargets(targets),
    fillRestDays: saved.fillRestDays ?? false,
    minFullRestDays: rest,
  };
}
