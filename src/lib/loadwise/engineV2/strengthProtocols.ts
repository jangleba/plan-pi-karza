import { resolveEquipmentId } from "../exerciseLibrary";
import type { Profile } from "../types";
import type { Dose, EngineSession } from "./model";
import { resolveGoalPolicy } from "./goalPolicy";
import { hasVerifiedAdvancedStrength, preparationProfile } from "./preparation";

/** Qualification is a product gate; studies do not establish a birthday threshold. */
export function clusterEligible(p: Profile, phase: EngineSession["phase"]): boolean {
  const prep = preparationProfile(p);
  return (
    p.trainingMethodPreferences?.strength === "M08" &&
    !prep.provisional &&
    prep.tier !== "foundation" &&
    !p.painInjury &&
    !resolveGoalPolicy(p).reduced &&
    p.seasonPhase !== "transition" &&
    p.seasonPhase !== "return_injury" &&
    phase !== "deload" &&
    phase !== "adaptation" &&
    (p.age < 18
      ? p.supervisionLevel === "full"
      : ["some", "full"].includes(p.supervisionLevel ?? ""))
  );
}

/** Evidence identifies an optional conditioning activity, not guaranteed potentiation. */
export const COACHED_ISOMETRIC_PRIMER = {
  id: "coached-pin-squat-3x3-v1",
  exerciseId: "overcoming_pin_squat_primer",
  source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC13551340/",
  doi: "10.5114/jhk/208832",
  population:
    "12 trained male collegiate sprinters; mean age 20.3 years, mean training experience 5 years",
  protocol:
    "3 maximal 3-second isometric squat efforts, 60 seconds between efforts, then 5 minutes before jumping; knee internal angle 90 degrees",
  boundary:
    "Some squat-jump velocity measures improved; peak force and peak power did not. Heavy-lift enhancement was not tested. Use before lifting is an explicitly coached programming choice, not an evidence-based promise of improved lifting.",
} as const;

export function coachedPrimerEligible(p: Profile, phase: EngineSession["phase"]): boolean {
  const declared = [...p.equipment, ...(p.trainingMethodPreferences?.declaredEquipment ?? [])].map(
    (value) => resolveEquipmentId(value) ?? value,
  );
  const unavailable = (p.unavailableEquipmentIds ?? []).map(
    (value) => resolveEquipmentId(value) ?? value,
  );
  return (
    p.trainingMethodPreferences?.strength === "M14" &&
    p.trainingMethodPreferences.coachedIsometricPrimer === true &&
    hasVerifiedAdvancedStrength(p) &&
    p.supervisionLevel === "full" &&
    p.hasGym &&
    !p.painInjury &&
    !resolveGoalPolicy(p).reduced &&
    p.goal !== "return" &&
    p.secondaryLimiter !== "fatigue" &&
    p.seasonPhase !== "return_injury" &&
    p.seasonPhase !== "transition" &&
    phase !== "deload" &&
    declared.includes("fixed_pins") &&
    !unavailable.includes("fixed_pins")
  );
}

export function coachedPrimerDose(): Dose {
  return {
    sets: 3,
    seconds: 3,
    restSeconds: 60,
    postRestSeconds: 300,
    jointAngleDegrees: 90,
    intent: "explosive",
  };
}

/** Modest holding exposure; a product starting dose, not a claim of therapeutic effect. */
export function quadricepsHoldingDose(deload: boolean): Dose {
  return {
    sets: deload ? 1 : 2,
    seconds: deload ? 12 : 15,
    perSide: true,
    restSeconds: 60,
    intent: "hold",
  };
}

export function controlledKneeFlexionDose(
  id: string,
  sets: number,
  tier: EngineSession["tier"],
): Dose {
  if (/nordic/.test(id)) {
    return {
      sets,
      reps: tier === "performance" ? 4 : 3,
      rir: 3,
      restSeconds: 120,
      assistance: id === "full_nordic_hamstring" ? "none" : "return_with_hands_or_band",
      intent: "controlled",
    };
  }
  return {
    sets,
    reps: tier === "foundation" ? 6 : 8,
    rir: 3,
    restSeconds: 90,
    intent: "controlled",
  };
}
