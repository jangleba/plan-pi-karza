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

function hasValidMonths(p: PreparationInput, minimum: number): boolean {
  return (
    typeof p.strengthTrainingMonths === "number" &&
    Number.isFinite(p.strengthTrainingMonths) &&
    p.strengthTrainingMonths >= minimum &&
    p.strengthTrainingMonths <= 720
  );
}

function explicitAdvancedStrength(p: PreparationInput): boolean {
  return (
    p.gymExperienceLevel === "advanced" && hasValidMonths(p, 24) && p.movementCompetence === "high"
  );
}

/** Advanced methods require actual adult strength declarations, never a provisional tier. */
export function hasVerifiedAdvancedStrength(p: PreparationInput): boolean {
  return Number.isFinite(p.age) && p.age >= 18 && explicitAdvancedStrength(p);
}

export function preparationProfile(p: PreparationInput): ProgrammingPreparation {
  const explicit = [
    p.gymExperienceLevel,
    p.strengthTrainingMonths,
    p.movementCompetence,
    p.supervisionLevel,
  ].some((value) => value !== undefined && value !== null);
  if (explicit) {
    const tier: Tier = explicitAdvancedStrength(p)
      ? "performance"
      : ["intermediate", "advanced"].includes(p.gymExperienceLevel ?? "") &&
          hasValidMonths(p, 6) &&
          (p.movementCompetence === "medium" || p.movementCompetence === "high")
        ? "development"
        : "foundation";
    return { tier, source: "explicit_strength", provisional: false };
  }
  // Existing onboarding asks about training experience, including strength/sprint.
  // This categorises programming volume only; canonical eligibility still receives p unchanged.
  const tier: Tier =
    p.level === "elite" || p.level === "advanced"
      ? "performance"
      : p.level === "intermediate"
        ? "development"
        : "foundation";
  return { tier, source: "onboarding", provisional: true };
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
