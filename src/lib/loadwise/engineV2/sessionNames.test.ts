import { expect, it } from "vitest";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";
import { MAIN_VARIANTS } from "./sprintCatalog";
import { fitSprintToBudget } from "./sprintRecipe";
import { buildRunning } from "./exercises";
import { sessionName } from "./sessionNames";
import type { Profile } from "../types";
import { canonicalExerciseName } from "../sessionPresentation";
import { unifiedSessionTitle } from "../sessionTitles";
import { hydrateTrainingExerciseFromDefinition } from "../exerciseLibrary";
it("new strength, sprint and support session names and exercise names are English; instructions remain Polish", () => {
  for (const goal of ["strength", "speed", "endurance", "general", "mobility"] as const) {
    const p = { ...gymAthlete, goal, equipment: [...gymAthlete.equipment, "football"] };
    const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
    const plan = generateTrainingPlan(p, options).plan;
    expect(validateTrainingPlan(plan, p, options)).toEqual([]);
    for (const s of plan.flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])) {
      expect(s.title).not.toMatch(/[ąćęłńóśźż]|\b(?:Siła|Trening|Bieg|Wolne|Technika)\b/i);
      expect(unifiedSessionTitle(s.title)).toBe(s.title);
      for (const e of s.structuredSections?.flatMap((x) => x.blocks.flatMap((b) => b.exercises)) ??
        []) {
        expect(e.name).not.toMatch(/[ąćęłńóśźż]/i);
        expect(e.instructionSteps?.length).toBeGreaterThan(0);
        // Saving/reloading and opening a technique sheet must retain the same English name.
        const reloaded = hydrateTrainingExerciseFromDefinition(JSON.parse(JSON.stringify(e)));
        expect(reloaded.name).toBe(e.name);
        expect(canonicalExerciseName(reloaded)).toBe(e.name);
        expect(reloaded.engineDose).toEqual(e.engineDose);
      }
    }
  }
});
it("flying work gets full recovery even when the session is fitted to a smaller time budget", () => {
  const p = {
    ...gymAthlete,
    goal: "speed",
    trainingMethodPreferences: { spaceLengthM: 60, sprintFocus: "max_velocity" },
  } as Profile;
  const normal = buildRunning(p, "speed", "development")!;
  expect(sessionName(normal)).toBe("Flying Sprint Development");
  for (const budget of [30, 45, 60]) {
    const fitted = fitSprintToBudget(normal, budget);
    if (fitted)
      expect(
        fitted.exercises
          .filter((e) => e.dose.speedStage === "main")
          .every((e) => e.dose.restSeconds >= 240),
      ).toBe(true);
  }
  expect(
    MAIN_VARIANTS.filter((v) => v.goal === "max_velocity").every(
      (v) => v.dose({} as never).restSeconds >= 240,
    ),
  ).toBe(true);
});
