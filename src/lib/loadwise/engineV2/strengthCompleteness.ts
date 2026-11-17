import type { EngineSession, LimitationCause, Role } from "./model";

/**
 * One definition of "the strength stimulus is complete", shared by the generator, validation,
 * weekly coverage and the summaries. The label strengthA/strengthB only says which slot of the
 * week a session fills; it does not prove that the session carries a main loaded leg pattern.
 * A leg curl, a Nordic or a plank are valuable support work and stay in the session, but they do
 * not stand in for the squat-led A lift (squat or single-leg); B keeps its established hinge /
 * hamstring-curl counterpart.
 */
export const MAIN_LEG_ROLES: readonly Role[] = [
  "knee_strength",
  "hip_strength",
  "unilateral_strength",
];
const UPPER_ROLES: readonly Role[] = ["push", "pull"];

export type StrengthCoverage =
  /** Carries the main loaded leg pattern (and, in a coaching-note session, the upper task). */
  | "full"
  /** The existing MD+1 exception: upper body and trunk only, by design. */
  | "post_match_upper"
  /** Support work only; counts as work done, not as the slot's strength stimulus. */
  | "partial";

export interface StrengthCompleteness {
  coverage: StrengthCoverage;
  complete: boolean;
  /** Main patterns the session does not carry (empty when complete). */
  absent: Role[];
}

type RecipeLike = Pick<EngineSession, "roles" | "exercises" | "postMatch" | "organization">;

export function isStrengthRecipeLike(recipe: Pick<EngineSession, "roles">): boolean {
  return recipe.roles.some((role) => role === "strengthA" || role === "strengthB");
}

export function strengthCompleteness(recipe: RecipeLike): StrengthCompleteness {
  // Only a strength recipe has a strength stimulus to be complete or not.
  if (!isStrengthRecipeLike(recipe)) return { coverage: "full", complete: true, absent: [] };
  const present = new Set(recipe.exercises.map((row) => row.role));
  const has = (roles: readonly Role[]) => roles.some((role) => present.has(role));
  if (recipe.postMatch === "upper") {
    const complete = has(UPPER_ROLES);
    return {
      coverage: complete ? "post_match_upper" : "partial",
      complete,
      absent: complete ? [] : ["push"],
    };
  }
  const absent: Role[] = [];
  const variantA = recipe.roles.includes("strengthA");
  // A coaching-note session may stand on any of the three main lifts of its template; the usual
  // A/B sessions keep their squat-led / hinge-led meaning (single-leg work serves both).
  const lower: readonly Role[] =
    recipe.organization === "complex"
      ? MAIN_LEG_ROLES
      : variantA
        ? ["knee_strength", "unilateral_strength"]
        : // Hinge-led B: its established loaded counterpart is the knee-flexion (hamstring) lift.
          ["hip_strength", "unilateral_strength", "knee_flexion"];
  if (!has(lower)) absent.push(recipe.organization === "complex" ? "knee_strength" : lower[0]);
  if (recipe.organization === "complex" && !has(UPPER_ROLES)) absent.push("push");
  return { coverage: absent.length ? "partial" : "full", complete: !absent.length, absent };
}

/** Counts of strength sessions by coverage, for weekly targets and summaries. */
export function strengthCoverageOf(
  session: { engineV2?: RecipeLike | null } | null | undefined,
): StrengthCoverage | null {
  const recipe = session?.engineV2;
  if (!recipe || !isStrengthRecipeLike(recipe)) return null;
  return strengthCompleteness(recipe).coverage;
}

/**
 * Block codes of the placement gates → structural cause. Only a real calendar problem may say
 * that no date was found; the time budget is its own cause.
 */
export function placementCause(code: string): LimitationCause {
  return ["TIME_LIMIT", "TIME_BUDGET", "INVALID_BUDGET"].includes(code) ? "time" : "calendar";
}
