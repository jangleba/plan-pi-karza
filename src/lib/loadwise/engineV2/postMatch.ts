import type { Profile } from "../types";
import type { EngineSession, Role } from "./model";
import { plusDays } from "./model";
import { strengthLandingCount } from "./gymPower";

/** Roles an upper-body + trunk session keeps on the day after a match (with its warm-up). */
export const POST_MATCH_UPPER_ROLES: ReadonlySet<Role> = new Set<Role>([
  "warmup",
  "push",
  "pull",
  "trunk",
  "upper_power",
]);

/**
 * Product rule (athlete's coaching notes): a gym day after a match is acceptable when the week
 * has no other date for it. Advanced and elite players keep the full session; everyone else
 * trains only the upper body and trunk.
 */
export const postMatchMode = (p: Profile): "full" | "upper" =>
  p.level === "advanced" || p.level === "elite" ? "full" : "upper";

/** MD+1: the day after a match, with no other match on that day or within the next two days
 * (in a congested week MD+1 is also MD-2 or MD-1 and stays free of gym work). */
export const isPostMatchDate = (date: string, matches: ReadonlySet<string>) =>
  matches.has(plusDays(date, -1)) &&
  [0, 1, 2].every((offset) => !matches.has(plusDays(date, offset)));

/** Keeps only upper-body and trunk work; null when no push or pull task remains. The caller
 * recomputes minutes and load class with the validator's own arithmetic. */
export function upperBodyOnly(r: EngineSession): EngineSession | null {
  const keep = (role: Role) => POST_MATCH_UPPER_ROLES.has(role);
  const exercises = r.exercises.filter((e) => keep(e.role));
  if (!exercises.some((e) => e.role === "push" || e.role === "pull")) return null;
  const ids = new Set(exercises.map((e) => e.exerciseId));
  const out: EngineSession = {
    ...structuredClone(r),
    postMatch: "upper",
    exercises: structuredClone(exercises).map((row) =>
      r.strengthStructure === "athletic_ab" && row.role !== "warmup"
        ? { ...row, strengthStage: "main" as const }
        : row,
    ),
    missing: r.missing.filter(keep),
    strengthPairs: r.strengthPairs?.filter((pair) => pair.roles.every(keep)),
    upperContrast:
      r.upperContrast && r.upperContrast.exerciseIds.every((id) => ids.has(id))
        ? structuredClone(r.upperContrast)
        : undefined,
    complexPairs: undefined,
    skipNearMatch: r.skipNearMatch?.filter((id) => ids.has(id)),
    optionalExercises: r.optionalExercises?.filter((id) => ids.has(id)),
    gymProgressionDecisions: r.gymProgressionDecisions?.filter((d) => ids.has(d.exerciseId)),
  };
  if (!out.strengthPairs?.length) delete out.strengthPairs;
  if (!out.upperContrast) delete out.upperContrast;
  delete out.complexPairs;
  out.plyometricContacts = strengthLandingCount(out.exercises);
  return out;
}
