import type {
  DoubleSessions,
  Goal,
  Level,
  SeasonPhase,
  SecondaryLimiter,
  SessionDay,
} from "./types";

/**
 * Product rule (not a physiological law): two heavy units on one day are
 * possible only from 17 years AND with a training qualification. Age alone
 * never qualifies an athlete.
 */
export const DOUBLE_HEAVY_MIN_AGE = 17;

export interface DoubleHeavyProfile {
  age: number;
  level: Level;
  doubleSessionsAllowed?: DoubleSessions;
  gymExperienceLevel?: "none" | "beginner" | "intermediate" | "advanced";
  painInjury?: boolean;
  painLocations?: string[];
  goal?: Goal;
  secondaryLimiter?: SecondaryLimiter | null;
  seasonPhase?: SeasonPhase;
}

export function qualifiesForDoubleHeavy(profile: DoubleHeavyProfile | null | undefined): boolean {
  if (!profile || !(profile.age >= DOUBLE_HEAVY_MIN_AGE)) return false;
  if (!["intermediate", "advanced", "elite"].includes(profile.level)) return false;
  if (profile.doubleSessionsAllowed === "no" || profile.doubleSessionsAllowed === "light_only")
    return false;
  // A declared lack of strength-training history is a disqualifier; unknown is not.
  if (profile.gymExperienceLevel === "none" || profile.gymExperienceLevel === "beginner")
    return false;
  if (profile.painInjury || (profile.painLocations?.length ?? 0) > 0) return false;
  return !(
    profile.goal === "return" ||
    profile.secondaryLimiter === "return" ||
    profile.secondaryLimiter === "fatigue" ||
    profile.seasonPhase === "return_injury"
  );
}

/** Heavy for this rule: match, or any session explicitly planned at high intensity. */
export function isHeavyUnit(session: SessionDay | null | undefined): boolean {
  if (!session || session.isUnavailable || session.dayType === "rest") return false;
  if (session.dayType === "match") return true;
  return session.durationMin > 0 && session.intensity === "wysoka";
}

export function isDoubleHeavyDay(day: SessionDay): boolean {
  return isHeavyUnit(day) && isHeavyUnit(day.secondSession);
}
