import type { Profile } from "../types";
import type { Dose, EngineSession, ExerciseDecision } from "./model";
import { trainingTier } from "./model";
import { resolveGoalPolicy } from "./goalPolicy";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { APP_MINIMUM_AGE, hasValidStrengthMonths } from "./preparation";

/**
 * Specialist jump/band work keeps the explicit bar of the exercise library: declared intermediate or
 * advanced gym experience, 12+ months, high technique and a coach running the session. 16+ being
 * "advanced by default" never assumes a coach that was not declared.
 */
function qualifiedByDeclaration(p: Profile): boolean {
  return (
    ["intermediate", "advanced"].includes(p.gymExperienceLevel ?? "") &&
    hasValidStrengthMonths(p, 12) &&
    p.movementCompetence === "high" &&
    p.supervisionLevel === "full"
  );
}

/** Small starting prescriptions are product choices, not universal optimal doses. */
export function gymSpecialWorkAllowed(p: Profile, phase: EngineSession["phase"]): boolean {
  return (
    p.hasGym &&
    p.age >= APP_MINIMUM_AGE &&
    qualifiedByDeclaration(p) &&
    !p.painInjury &&
    !resolveGoalPolicy(p).reduced &&
    !["adaptation", "deload"].includes(phase) &&
    !["transition", "return_injury"].includes(p.seasonPhase)
  );
}

export function gymPowerCandidates(
  p: Profile,
  variant: "A" | "B",
  phase: EngineSession["phase"],
): string[] {
  if (!p.hasGym) return [];
  const goal = resolveGoalPolicy(p).strengthGoal;
  const special = gymSpecialWorkAllowed(p, phase);
  const bands =
    special && ["power", "speed"].includes(goal)
      ? goal === "speed" || phase === "peak"
        ? ["gym_cmj_assisted", "gym_cmj_resisted"]
        : ["gym_cmj_resisted", "gym_cmj_assisted"]
      : [];
  if (variant === "B")
    return [
      ...(goal === "agility"
        ? [...(special ? ["gym_lateral_bound"] : []), "gym_lateral_jump"]
        : []),
      "gym_broad_jump",
      "gym_lateral_jump",
      ...bands,
      "gym_cmj",
    ];
  return [...bands, "gym_cmj"];
}

export function gymPowerDose(id: string, p: Profile, phase: EngineSession["phase"]): Dose {
  const reduced =
    phase === "deload" || resolveGoalPolicy(p).reduced || p.seasonPhase === "transition";
  return {
    sets: reduced ? 1 : phase === "peak" || trainingTier(p) === "foundation" ? 2 : 3,
    reps: reduced ? 2 : 3,
    perSide: id === "gym_lateral_jump" || id === "gym_lateral_bound" || undefined,
    contactsPerRep: 1,
    restSeconds: ["gym_cmj_assisted", "gym_cmj_resisted", "gym_lateral_bound"].includes(id)
      ? 120
      : 90,
    intent: "explosive",
  };
}

export function gymHamstringSupportCandidates(p: Profile, phase: EngineSession["phase"]): string[] {
  if (!gymSpecialWorkAllowed(p, phase) || p.trainingMethodPreferences?.strength === "M13")
    return [];
  const goal = resolveGoalPolicy(p).strengthGoal;
  if (!["power", "speed", "agility"].includes(goal)) return [];
  return [
    ...(p.age >= 18 && goal !== "agility" && phase !== "peak" ? ["gym_fast_band_curl"] : []),
    "gym_bridge_pulses",
  ];
}

export function gymHamstringSupportDose(id: string, phase: EngineSession["phase"]): Dose {
  return id === "gym_fast_band_curl"
    ? { sets: 2, seconds: 4, restSeconds: 300, intent: "controlled" }
    : { sets: phase === "peak" ? 1 : 2, seconds: 8, restSeconds: 60, intent: "controlled" };
}

/** Count prescribed landing events, not individual feet or equivalent impact load. */
export function strengthLandingCount(rows: readonly ExerciseDecision[]): number {
  return rows.reduce(
    (total, row) =>
      total +
      (FUNCTIONAL_CATALOGUE[row.exerciseId]?.actions.includes("jump") ||
      ["drop_landing", "single_leg_drop_landing"].includes(row.exerciseId)
        ? row.dose.sets *
          (row.dose.reps ?? 0) *
          (row.dose.perSide ? 2 : 1) *
          (["depth_jump", "drop_jump"].includes(row.exerciseId)
            ? 2
            : (row.dose.contactsPerRep ?? 1))
        : 0),
    0,
  );
}
