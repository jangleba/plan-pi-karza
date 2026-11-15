import type { Profile } from "../types";
import type { Tier } from "./model";

export interface ProgrammingPreparation {
  tier: Tier;
  source: "explicit_strength" | "onboarding";
  /** A volume category, never proof of months, lifting technique or supervision. */
  provisional: boolean;
}

type PreparationInput = Pick<
  Profile,
  | "age"
  | "level"
  | "gymExperienceLevel"
  | "strengthTrainingMonths"
  | "movementCompetence"
  | "supervisionLevel"
>;

export function hasValidStrengthMonths(p: PreparationInput, minimum = 0): boolean {
  return (
    typeof p.strengthTrainingMonths === "number" &&
    Number.isFinite(p.strengthTrainingMonths) &&
    p.strengthTrainingMonths >= minimum &&
    Number.isInteger(p.strengthTrainingMonths) &&
    Number.isFinite(p.age) &&
    p.strengthTrainingMonths <= Math.min(720, Math.max(0, p.age * 12)) &&
    !(p.gymExperienceLevel === "none" && p.strengthTrainingMonths !== 0)
  );
}

function explicitAdvancedStrength(p: PreparationInput): boolean {
  return (
    p.gymExperienceLevel === "advanced" &&
    hasValidStrengthMonths(p, 24) &&
    p.movementCompetence === "high" &&
    p.supervisionLevel !== undefined
  );
}

/** Advanced methods require actual adult strength declarations, never a provisional tier. */
export function hasVerifiedAdvancedStrength(p: PreparationInput): boolean {
  return Number.isFinite(p.age) && p.age >= 18 && explicitAdvancedStrength(p);
}

/** BallWise is built for athletes from this age; younger accounts keep their history only. */
export const APP_MINIMUM_AGE = 16;

/** An answer that limits the athlete — unlike a missing answer, it always means simpler work. */
export function declaresLimitedStrength(p: PreparationInput): boolean {
  return (
    p.gymExperienceLevel === "none" ||
    p.gymExperienceLevel === "beginner" ||
    p.movementCompetence === "low" ||
    (hasValidStrengthMonths(p) && (p.strengthTrainingMonths as number) < 6)
  );
}

const levelTier = (level: PreparationInput["level"]): Tier =>
  level === "elite" || level === "advanced"
    ? "performance"
    : level === "intermediate"
      ? "development"
      : "foundation";
const RANK: Record<Tier, number> = { foundation: 0, development: 1, performance: 2 };

/**
 * Programming volume. From 16 the engine is advanced by default: a missing strength answer never
 * lowers the athlete below the football level declared in onboarding. A complete declaration
 * decides on its own, and an answer that limits the athlete (no or beginner gym experience, low
 * technique, under 6 months) always gives the simpler variants. Specialist methods keep their own
 * explicit qualifications (hasVerifiedAdvancedStrength, maximalStrengthEligible, gymSpecialWorkAllowed).
 */
export function preparationProfile(p: PreparationInput): ProgrammingPreparation {
  const explicit = [
    p.gymExperienceLevel,
    p.strengthTrainingMonths,
    p.movementCompetence,
    p.supervisionLevel,
  ].some((value) => value !== undefined && value !== null);
  if (explicit) {
    const complete =
      p.gymExperienceLevel !== undefined &&
      hasValidStrengthMonths(p) &&
      p.movementCompetence !== undefined &&
      p.supervisionLevel !== undefined;
    const developing =
      ["intermediate", "advanced"].includes(p.gymExperienceLevel ?? "") &&
      hasValidStrengthMonths(p, 6) &&
      (p.movementCompetence === "medium" || p.movementCompetence === "high");
    if (complete) {
      const tier: Tier = explicitAdvancedStrength(p)
        ? "performance"
        : developing
          ? "development"
          : "foundation";
      return { tier, source: "explicit_strength", provisional: false };
    }
    if (declaresLimitedStrength(p))
      return { tier: "foundation", source: "explicit_strength", provisional: false };
    // Partial answers that limit nothing.
    const declared: Tier = developing ? "development" : "foundation";
    const tier =
      Number.isFinite(p.age) &&
      p.age >= APP_MINIMUM_AGE &&
      RANK[levelTier(p.level)] > RANK[declared]
        ? levelTier(p.level)
        : declared;
    return { tier, source: "explicit_strength", provisional: true };
  }
  // Existing onboarding asks about training experience, including strength/sprint.
  // This categorises programming volume only; canonical eligibility still receives p unchanged.
  return { tier: levelTier(p.level), source: "onboarding", provisional: true };
}

/** The existing checkbox confirms 30 m of running plus a separate stopping area. */
export function accelerationDistance(
  p: Pick<Profile, "age" | "level" | "hasSprintSpace" | "trainingMethodPreferences">,
): 10 | 20 {
  const prepared = p.age >= 16 && ["intermediate", "advanced", "elite"].includes(p.level);
  const explicit = p.trainingMethodPreferences?.spaceLengthM;
  const hasTwentyMetresWithRunout =
    explicit === undefined ? p.hasSprintSpace : Number.isFinite(explicit) && explicit >= 40;
  return prepared && hasTwentyMetresWithRunout ? 20 : 10;
}
