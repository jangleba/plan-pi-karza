import type { Goal, Profile } from "../types";
import {
  CURRENT_FEELING_QUALITY,
  DESIRED_FEELING_QUALITY,
  type DirectionQuality,
} from "../playerDirection";

export interface GoalPolicy {
  primary: Goal;
  firstAccent: DirectionQuality | null;
  reduced: boolean;
  strengthGoal: Goal;
  speedGoal: Goal;
  enduranceGoal: Goal;
  extraEndurance: boolean;
  support: "skills" | "mobility" | null;
  priorities: [number, number, number, number];
}

/** Preserve the meaning and order of existing onboarding answers. The second
 * answer cannot silently overrule the first, and an accent does not replace the primary goal. */
export function resolveGoalPolicy(p: Profile): GoalPolicy {
  const desired = p.desiredPitchFeelings?.[0];
  const current = p.currentPitchFeelings?.[0];
  const firstAccent =
    (desired ? DESIRED_FEELING_QUALITY[desired] : null) ??
    (current ? CURRENT_FEELING_QUALITY[current] : null) ??
    null;
  // "Fading late in a match" means an endurance limitation, not proof of today's fatigue.
  const reduced =
    p.goal === "return" ||
    p.secondaryLimiter === "return" ||
    p.secondaryLimiter === "fatigue" ||
    current === "returning_after_break";
  const strengthGoal: Goal =
    p.goal === "power" || p.goal === "agility"
      ? p.goal
      : p.secondaryLimiter === "power"
        ? "power"
        : p.goal;
  const speedGoal: Goal =
    p.goal === "speed" || p.goal === "agility"
      ? p.goal
      : p.secondaryLimiter === "cod"
        ? "agility"
        : p.secondaryLimiter === "speed"
          ? "speed"
          : firstAccent === "agility" || firstAccent === "speed"
            ? firstAccent
            : p.goal;
  const wantsEndurance =
    p.goal === "endurance" || p.secondaryLimiter === "endurance" || firstAccent === "endurance";
  const support =
    p.goal === "return" || reduced
      ? "mobility"
      : p.goal === "general"
        ? "skills"
        : p.goal === "mobility"
          ? "mobility"
          : p.secondaryLimiter === "ball"
            ? "skills"
            : firstAccent === "ball"
              ? "skills"
              : firstAccent === "mobility"
                ? "mobility"
                : null;
  const priorities: [number, number, number, number] =
    p.goal === "speed" || p.goal === "agility"
      ? [25, 25, 35, 15]
      : p.goal === "endurance"
        ? [25, 25, 15, 35]
        : [30, 30, 25, 15];
  const strengthBoost = p.secondaryLimiter === "strength" ? 4 : firstAccent === "strength" ? 2 : 0;
  const speedBoost = ["speed", "cod"].includes(p.secondaryLimiter ?? "")
    ? 4
    : ["speed", "agility"].includes(firstAccent ?? "")
      ? 2
      : 0;
  const enduranceBoost =
    p.secondaryLimiter === "endurance" ? 4 : firstAccent === "endurance" ? 2 : 0;
  priorities[0] += strengthBoost;
  priorities[1] += strengthBoost;
  priorities[2] += speedBoost;
  priorities[3] += enduranceBoost;
  return {
    primary: p.goal,
    firstAccent,
    reduced,
    strengthGoal,
    speedGoal,
    enduranceGoal: wantsEndurance ? "endurance" : p.goal,
    extraEndurance: wantsEndurance && p.goal !== "return",
    support,
    priorities,
  };
}

/** A reduced-load route is a programming choice from explicit answers, not a diagnosis. */
export function routedProfile(p: Profile, goal: Goal): Profile {
  return resolveGoalPolicy(p).reduced
    ? { ...p, goal: "return", secondaryLimiter: "fatigue" }
    : { ...p, goal };
}

export type WeeklyTaskId = "strengthA" | "strengthB" | "speed" | "endurance";

/**
 * Weekly targets that realise the main goal; the scheduler ranks these first in a week too
 * tight for everything. Explicit mapping of the existing goals, no new goal is invented:
 * speed/agility → sprint, endurance → endurance, strength/power → both strength days.
 * Any other goal follows the highest-weighted targets of the existing priority table.
 */
export function mainGoalTasks(p: Profile): WeeklyTaskId[] {
  const ids: WeeklyTaskId[] = ["strengthA", "strengthB", "speed", "endurance"];
  if (p.goal === "speed" || p.goal === "agility") return ["speed"];
  if (p.goal === "endurance") return ["endurance"];
  if (p.goal === "strength" || p.goal === "power") return ["strengthA", "strengthB"];
  const { priorities } = resolveGoalPolicy(p);
  const top = Math.max(...priorities);
  return ids.filter((_, i) => priorities[i] === top);
}
