import type { EngineSession, ExerciseDecision, Role } from "./model";
import { strengthLandingCount } from "./gymPower";
import { strengthPreparationOverhead } from "./strengthPreparation";
import { withoutUpperContrast } from "./upperContrast";
import { removeClusterProtocol } from "./strengthProtocols";

/** Fit the selected structure, never replace it with another A/B programme. */
export function fitAthleticStrengthToBudget(
  recipe: EngineSession,
  budget: number,
  estimateSeconds: (rows: readonly ExerciseDecision[]) => number,
): EngineSession {
  if (recipe.minutes <= budget) return recipe;
  let compact = structuredClone(recipe);
  const removed: NonNullable<EngineSession["strengthTimeOmissions"]> = [];
  const minutes = () =>
    Math.ceil(estimateSeconds(compact.exercises) / 60) + strengthPreparationOverhead(compact);
  const finish = () => {
    compact.variant = "compact";
    compact.minutes = minutes();
    compact.plyometricContacts = strengthLandingCount(compact.exercises);
    if (removed.length)
      compact.strengthTimeOmissions = [
        ...new Map(
          [...(compact.strengthTimeOmissions ?? []), ...removed].map(
            (row) => [`${row.exerciseId}:${row.role}`, row] as const,
          ),
        ).values(),
      ];
    return compact;
  };
  if (compact.upperContrast) {
    const before = compact.exercises;
    compact = withoutUpperContrast(
      compact,
      "Krótszy wariant zachowuje zwykłe wyciskanie; pełny opcjonalny kontrast nie mieści się w czasie.",
    );
    removed.push(
      ...before
        .filter((row) => row.role === "upper_power")
        .map(({ exerciseId, role }) => ({ exerciseId, role })),
    );
    if (minutes() <= budget) return finish();
  }
  // This structure has no automatic pairs. A linked specialist prescription must
  // remain whole rather than be cut one exercise or one round at a time.
  if (compact.complexPairs?.length || compact.strengthPairs?.length) return finish();

  const a = compact.roles.includes("strengthA");
  const primary = compact.exercises.find(
    (row) => row.role === (a ? "knee_strength" : "hip_strength"),
  );
  const complement = compact.exercises.find((row) =>
    (a ? ["knee_flexion", "hip_strength"] : ["unilateral_strength", "knee_strength"]).includes(
      row.role,
    ),
  );
  const upper = compact.exercises.find((row) => row.role === "push" || row.role === "pull");
  const protectedRows = new Set([
    ...compact.exercises.filter((row) => ["warmup", "power", "landing"].includes(row.role)),
    ...[primary, complement, upper].filter((row): row is ExerciseDecision => !!row),
  ]);
  const optionalOrder: readonly Role[] = [
    "upper_power",
    "hip_strength",
    "hamstring_dynamic_support",
    "hamstring_iso",
    "calf_straight",
    "calf_bent",
    "quad_iso",
    "adductor",
    "trunk",
    "mobility",
    "pull",
    "push",
  ];
  for (const role of optionalOrder) {
    for (const row of [...compact.exercises]) {
      if (row.role !== role || protectedRows.has(row)) continue;
      compact.exercises = compact.exercises.filter((candidate) => candidate !== row);
      removed.push({ exerciseId: row.exerciseId, role });
      if (minutes() <= budget) return finish();
    }
  }
  // Keep a complete selected contrast when possible; otherwise restore the
  // existing independent power-first variant with full ordinary recovery.
  if (compact.organization === "contrast") {
    compact.organization = "power_first";
    if (primary) {
      primary.dose.restSeconds = Math.max(180, primary.dose.restSeconds);
      primary.reason += " Krótszy wariant: moc i siła w osobnych seriach z pełnymi przerwami.";
    }
    const powerIndex = compact.exercises.findIndex((row) => row.role === "power");
    const primaryIndex = primary ? compact.exercises.indexOf(primary) : -1;
    if (powerIndex > primaryIndex && primaryIndex >= 0) {
      const [power] = compact.exercises.splice(powerIndex, 1);
      compact.exercises.splice(primaryIndex, 0, power);
    }
    if (minutes() <= budget) return finish();
  }
  // Keep the existing compact fallback for a selected cluster method, including
  // its execution text. Ordinary between-set recovery is never shortened.
  for (const row of compact.exercises) removeClusterProtocol(row);
  if (minutes() <= budget) return finish();
  for (const row of compact.exercises) {
    if (row.role === "warmup" || row.role === "iso_primer" || row.dose.cluster) continue;
    row.dose.sets = Math.min(2, row.dose.sets);
  }
  if (compact.strengthFocus?.mode === "max_strength" && primary && primary.dose.sets < 3) {
    const previousReason = compact.strengthFocus.reason;
    compact.strengthFocus = {
      ...compact.strengthFocus,
      mode: "strength_build",
      label: "Siła w wybranym wariancie",
      reason:
        "Krótszy wariant zachowuje główne wzorce i pełne przerwy przy mniejszej liczbie serii; nie oznaczamy go jako pełnego akcentu siły maksymalnej.",
    };
    primary.reason = `${primary.reason.replace(previousReason, "").trim()} ${compact.strengthFocus.reason}`;
  }
  // An over-budget minimum remains over budget. The planner reports the missing
  // session instead of silently cutting a required function or its recovery.
  return finish();
}
