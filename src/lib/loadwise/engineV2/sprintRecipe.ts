import type { ExerciseDecision, EngineSession } from "./model";

/** Product distance cap includes build-ups, resisted runs, flying run-in and fast additions.
 * Run-out is space, not another maximal effort. Technical marching is not sprint distance. */
export function sprintDistance(exercises: readonly ExerciseDecision[]): number {
  return exercises.reduce(
    (sum, e) =>
      sum +
      (e.dose.fastMetres ??
        (["speed", "landing"].includes(e.role)
          ? (e.dose.distanceM ?? 0) + (e.dose.runInM ?? 0)
          : 0)) *
        e.dose.sets *
        (e.dose.reps ?? 1) *
        (e.dose.perSide ? 2 : 1),
    0,
  );
}

/** Expand a shared circuit in round-major order. Saved legacy decisions are left alone. */
export function sprintChronology(exercises: readonly ExerciseDecision[]): ExerciseDecision[] {
  const output: ExerciseDecision[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    if (!e.dose.circuit) {
      output.push(e);
      continue;
    }
    const group = exercises.filter((x) => x.dose.circuit?.id === e.dose.circuit?.id);
    if (group[0] !== e) continue;
    for (let round = 1; round <= e.dose.sets; round++)
      for (const [task, item] of group.entries())
        output.push({
          ...item,
          dose: {
            ...item.dose,
            sets: 1,
            circuit: { ...e.dose.circuit, round, rounds: e.dose.sets, task: task + 1 },
            postRestSeconds:
              task === group.length - 1 ? e.dose.circuit.roundRestSeconds : item.dose.restSeconds,
          },
        });
  }
  return output;
}

export function sprintSeconds(exercises: readonly ExerciseDecision[]): number {
  return sprintChronology(exercises).reduce((total, e, i, all) => {
    const d = e.dose;
    const work = d.seconds ?? (d.distanceM ? 8 * (d.reps ?? 1) : (d.reps ?? 1) * 3);
    return (
      total +
      d.sets * work * (d.perSide ? 2 : 1) +
      Math.max(0, d.sets * (d.perSide ? 2 : 1) - 1) * d.restSeconds +
      (d.postRestSeconds ?? (i < all.length - 1 ? d.restSeconds : 0)) +
      (d.circuit && (d.circuit.round !== 1 || d.circuit.task !== 1) ? 0 : 45)
    );
  }, 0);
}

export function updateSprintTotals(recipe: EngineSession): EngineSession {
  recipe.sprintMetres = sprintDistance(recipe.exercises);
  recipe.minutes = Math.ceil(sprintSeconds(recipe.exercises) / 60) + 2;
  const countedJumps = recipe.exercises.filter((e) => e.dose.contactsPerRep !== undefined);
  recipe.plyometricContacts = countedJumps.length
    ? countedJumps.reduce(
        (n, e) =>
          n + e.dose.contactsPerRep! * (e.dose.reps ?? 1) * e.dose.sets * (e.dose.perSide ? 2 : 1),
        0,
      )
    : undefined;
  return recipe;
}

export function fitSprintToBudget(
  recipe: EngineSession | null,
  budget: number,
): EngineSession | null {
  if (!recipe) return null;
  const result = structuredClone(recipe);
  updateSprintTotals(result);
  // Remove optional loads before reducing technique rounds or main attempts; never compress rest.
  for (const stage of ["addition", "resisted"])
    if (result.minutes > budget) {
      result.exercises = result.exercises.filter((e) => e.dose.speedStage !== stage);
      updateSprintTotals(result);
    }
  while (
    result.minutes > budget &&
    result.exercises.some((e) => e.dose.circuit && e.dose.sets > 1)
  ) {
    result.exercises.forEach((e) => {
      if (e.dose.circuit) e.dose.sets--;
    });
    updateSprintTotals(result);
  }
  while (
    result.minutes > budget &&
    result.exercises.some((e) => e.dose.speedStage === "main" && e.dose.sets > 2)
  ) {
    result.exercises.forEach((e) => {
      if (e.dose.speedStage === "main" && e.dose.sets > 2) e.dose.sets--;
    });
    updateSprintTotals(result);
  }
  return result.minutes <= budget ? result : null;
}
