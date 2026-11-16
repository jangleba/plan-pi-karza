import type { Profile } from "../types";
import type { EngineSession, Role } from "./model";
import { gymSpecialWorkAllowed } from "./gymPower";
import { hasVerifiedAdvancedStrength } from "./preparation";

/** A layout choice never changes the athlete's primary goal or proves preparation. */
export function isAthleticStrengthSelected(profile: Profile): boolean {
  return (
    profile.hasGym &&
    (profile.trainingMethodPreferences?.gymTemplate === undefined ||
      profile.trainingMethodPreferences.gymTemplate === "athletic_ab")
  );
}

/** Existing qualified exercises keep their own dose factories and station requirements. */
export function athleticPowerCandidates(
  profile: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
): string[] {
  const special = gymSpecialWorkAllowed(profile, phase);
  if (variant === "A")
    return [...(special ? ["gym_cmj_assisted", "gym_cmj_resisted"] : []), "gym_cmj"];
  const singleLeg =
    phase === "development" &&
    special &&
    hasVerifiedAdvancedStrength(profile) &&
    profile.supervisionLevel === "full";
  return [
    ...(singleLeg ? ["single_leg_pogo"] : []),
    ...(phase === "development" ? ["bilateral_pogo"] : []),
    "gym_cmj",
  ];
}

export function athleticHamstringSupportCandidates(
  profile: Profile,
  phase: EngineSession["phase"],
): string[] {
  if (
    !gymSpecialWorkAllowed(profile, phase) ||
    profile.trainingMethodPreferences?.strength === "M13"
  )
    return [];
  return [
    ...(profile.age >= 18 && phase !== "peak" ? ["gym_fast_band_curl"] : []),
    "gym_bridge_pulses",
  ];
}

const MAIN_ROLES = new Set<Role>([
  "power",
  "landing",
  "knee_strength",
  "hip_strength",
  "unilateral_strength",
  "knee_flexion",
  "iso_primer",
]);

/** Two independent athletic days: A is squat-led, B hinge-led; numbers never imply a pair. */
export function applyAthleticStrengthLayout(recipe: EngineSession): EngineSession {
  recipe.strengthStructure = "athletic_ab";
  for (const row of recipe.exercises)
    row.strengthStage =
      row.role === "warmup" || row.role === "quad_iso"
        ? "prep"
        : MAIN_ROLES.has(row.role)
          ? "main"
          : "accessory";
  const order = { prep: 1, main: 2, accessory: 3, cooldown: 4 };
  recipe.exercises.sort(
    (a, b) =>
      (a.role === "warmup" ? 0 : order[a.strengthStage!]) -
      (b.role === "warmup" ? 0 : order[b.strengthStage!]),
  );
  return recipe;
}
