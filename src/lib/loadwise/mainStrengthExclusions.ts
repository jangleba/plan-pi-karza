/**
 * BallWise is for players from 16. These four movements are too easy to be the main
 * strength exercise of a session: they stay in warm-ups, light activation and saved
 * history, but are never chosen, suggested or substituted as main strength work.
 * Valuable bodyweight work (pull-ups, Nordic, Copenhagen, planks, isometrics, jumps) is
 * not on this list.
 */
export const TRIVIAL_MAIN_STRENGTH: ReadonlySet<string> = new Set([
  "bodyweight_squat",
  "glute_bridge",
  "bodyweight_split_squat",
  "incline_push_up",
]);

/** Roles that carry the session's main strength stimulus. */
export const MAIN_STRENGTH_ROLES: ReadonlySet<string> = new Set([
  "knee_strength",
  "hip_strength",
  "unilateral_strength",
  "push",
]);

/** True when `id` may not fill `role` (or, without a role, may not replace main strength work). */
export function excludedFromMainStrength(id: string, role?: string): boolean {
  if (!TRIVIAL_MAIN_STRENGTH.has(id)) return false;
  return role === undefined || MAIN_STRENGTH_ROLES.has(role);
}

/**
 * A substitute for `sourceId` (regression, alternative, no-equipment replacement): a trivial
 * movement is acceptable only when the source itself is one of them (e.g. in a warm-up).
 */
export function excludedAsReplacement(sourceId: string | undefined, candidateId: string): boolean {
  return TRIVIAL_MAIN_STRENGTH.has(candidateId) && !TRIVIAL_MAIN_STRENGTH.has(sourceId ?? "");
}
