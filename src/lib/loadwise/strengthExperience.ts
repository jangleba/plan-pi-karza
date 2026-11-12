import type { Profile } from "./types";
import { normalizeMethodPreferences } from "./methods/eligibility";

export type StrengthExperience = Pick<
  Profile,
  | "gymExperienceLevel"
  | "strengthTrainingMonths"
  | "movementCompetence"
  | "supervisionLevel"
  | "trainingMethodPreferences"
  | "clubStrengthDays"
>;

/** Explicit declarations only. Football level and age never fill in missing gym history. */
export function normalizeStrengthExperience(value: StrengthExperience): StrengthExperience {
  const result: StrengthExperience = {};
  if (["none", "beginner", "intermediate", "advanced"].includes(value.gymExperienceLevel ?? ""))
    result.gymExperienceLevel = value.gymExperienceLevel;
  if (
    typeof value.strengthTrainingMonths === "number" &&
    Number.isFinite(value.strengthTrainingMonths) &&
    value.strengthTrainingMonths >= 0 &&
    value.strengthTrainingMonths <= 720
  )
    result.strengthTrainingMonths = Math.floor(value.strengthTrainingMonths);
  if (["low", "medium", "high"].includes(value.movementCompetence ?? ""))
    result.movementCompetence = value.movementCompetence;
  if (["none", "some", "full"].includes(value.supervisionLevel ?? ""))
    result.supervisionLevel = value.supervisionLevel;
  if (result.gymExperienceLevel === "none") result.strengthTrainingMonths = 0;
  if (Array.isArray(value.clubStrengthDays)) {
    const days = [...new Set(value.clubStrengthDays)]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      .sort((a, b) => a - b);
    if (days.length) result.clubStrengthDays = days;
  }
  if (value.trainingMethodPreferences) {
    const preferences = normalizeMethodPreferences(value.trainingMethodPreferences);
    result.trainingMethodPreferences = preferences;
  }
  return result;
}

/** Versioned payload in the existing training_experience TEXT column; no schema migration. */
export function encodeStrengthExperience(value: StrengthExperience): string | null {
  const clean = normalizeStrengthExperience(value);
  return Object.keys(clean).length
    ? JSON.stringify({ schema: "ballwise-strength-v1", ...clean })
    : null;
}

export function decodeStrengthExperience(raw: unknown): StrengthExperience {
  if (typeof raw !== "string" || raw.length > 1000) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || value.schema !== "ballwise-strength-v1") return {};
    return normalizeStrengthExperience(value);
  } catch {
    return {};
  }
}

export function hasStrengthExperience(value: StrengthExperience): boolean {
  const clean = normalizeStrengthExperience(value);
  return (
    clean.gymExperienceLevel !== undefined &&
    clean.strengthTrainingMonths !== undefined &&
    clean.movementCompetence !== undefined &&
    clean.supervisionLevel !== undefined
  );
}
