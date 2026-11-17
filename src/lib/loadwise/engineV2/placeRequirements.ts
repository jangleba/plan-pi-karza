import { resolveEquipmentId } from "../exerciseLibrary";
import type { ExerciseDefinition } from "../exerciseLibrary";
import { INDIVIDUAL_FOOTBALL_DRILLS } from "../individualFootballDrills";
import type { Profile } from "../types";
import type { Role } from "./model";

const normal = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
const football = (v: string) =>
  /^(?:pilka(?: noz?na)?|football(?:_ball)?|soccer(?:_ball)?|ball)$/.test(normal(v));
const wall = (v: string) =>
  /^(?:rebounder|wall|sciana|odbojnik|sciana\s*\/\s*odbojnik|wall\s*\/\s*rebounder)$/.test(
    normal(resolveEquipmentId(v) ?? v),
  );

/** Pitch or gym access does not prove ownership of a football. */
export function hasDeclaredFootball(profile: Profile): boolean {
  return (
    [...profile.equipment, ...(profile.homeEquipment ?? [])].some(football) &&
    !(profile.unavailableEquipmentIds ?? []).some(football)
  );
}

/** A partner is real only when the player declared one (the same flag the reactive sprint tasks use). */
export function hasDeclaredPartner(profile: Profile): boolean {
  return (
    (profile.trainingMethodPreferences?.declaredEquipment ?? []).includes("partner") &&
    !(profile.unavailableEquipmentIds ?? []).includes("partner")
  );
}

/** The existing wall checkbox is stored as rebounder; ownership is never inferred from venue. */
export function hasDeclaredWall(profile: Profile): boolean {
  return (
    [...profile.equipment, ...(profile.homeEquipment ?? [])].some(wall) &&
    !(profile.unavailableEquipmentIds ?? []).some(wall)
  );
}

/** Wall requirements live in the canonical solo-drill metadata, including goalkeeper tasks. */
export function requiresDeclaredWall(exerciseId: string): boolean {
  const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((entry) => entry.id === exerciseId);
  return !!drill && "wall" in drill && drill.wall === true;
}

/** Jumps and landings need open floor, not a pitch: the declared gym jump zone (6 × 3 m) is enough. */
const GYM_LANE_ROLES = new Set<string>(["power", "landing"]);
export function hasGymJumpLane(profile: Profile): boolean {
  return (
    profile.hasGym &&
    [...profile.equipment, ...(profile.trainingMethodPreferences?.declaredEquipment ?? [])].some(
      (v) => (resolveEquipmentId(v) ?? v) === "gym_jump_lane",
    ) &&
    !(profile.unavailableEquipmentIds ?? []).includes("gym_jump_lane")
  );
}

export type RequirementIssue =
  | "partner"
  | "ball"
  | "wall"
  | "goalkeeper"
  | "pitch"
  | "open_field"
  | "sprint_lane"
  | "indoor_gym";

/**
 * Where and with whom an exercise can really be done. One definition shared by exercise selection
 * and by the final validation, so the generator never builds a recipe the validator refuses.
 * A gym is not a pitch, a pitch is not a sprint lane, and neither proves ownership of a ball or wall.
 */
export function sessionRequirementIssue(
  def: Pick<
    ExerciseDefinition,
    "id" | "minParticipants" | "requiresPartner" | "requiresBall" | "spaceRequirement"
  >,
  profile: Profile,
  role?: Role,
): RequirementIssue | null {
  // Two-person tasks need a declared partner; larger groups are never assumed.
  if (
    (def.minParticipants > 1 || def.requiresPartner) &&
    !(def.minParticipants <= 2 && hasDeclaredPartner(profile))
  )
    return "partner";
  if (def.requiresBall && !hasDeclaredFootball(profile)) return "ball";
  if (requiresDeclaredWall(def.id) && !hasDeclaredWall(profile)) return "wall";
  if (/^football_gk_/.test(def.id) && profile.position !== "goalkeeper") return "goalkeeper";
  if (def.spaceRequirement === "pitch" && !profile.hasPitch) return "pitch";
  if (
    def.spaceRequirement === "open_field" &&
    !profile.hasPitch &&
    !(role === "warmup" && profile.hasSprintSpace) &&
    !(role !== undefined && GYM_LANE_ROLES.has(role) && hasGymJumpLane(profile))
  )
    return "open_field";
  if (def.spaceRequirement === "sprint_lane" && !profile.hasSprintSpace) return "sprint_lane";
  if (def.spaceRequirement === "indoor_gym" && !profile.hasGym) return "indoor_gym";
  return null;
}
export const meetsSessionRequirements = (
  def: Parameters<typeof sessionRequirementIssue>[0],
  profile: Profile,
  role?: Role,
) => sessionRequirementIssue(def, profile, role) === null;
