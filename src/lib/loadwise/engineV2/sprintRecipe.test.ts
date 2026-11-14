import { describe, expect, it } from "vitest";
import { buildRunning } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { sprintChronology, fitSprintToBudget, sprintDistance } from "./sprintRecipe";
import { buildRunnerSteps, occurrenceLogKey } from "../sessionRunner/steps";
import { resolveHowTo } from "../sessionRunner/howTo";
import { validateCanonicalReplacementChains, getExerciseDefinition } from "../exerciseLibrary";
import type { Profile } from "../types";
const p: Profile = {
  name: "Sprint",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  movementCompetence: "high",
  supervisionLevel: "full",
  gymExperienceLevel: "none",
  strengthTrainingMonths: 0,
  trainingMethodPreferences: { spaceLengthM: 50 },
};
describe("executable sprint recipe", () => {
  it("runs the same three drills in round-major order with nine distinct progress keys", () => {
    const options = { startDate: "2026-11-02", weeks: 1 };
    const result = generateTrainingPlan(p, options);
    expect(validateTrainingPlan(result.plan, p, options)).toEqual([]);
    const session = result.plan
      .flatMap((d) => [d, d.secondSession])
      .find((s) => s?.engineV2?.roles.includes("speed"))!;
    const rows = buildRunnerSteps(session.structuredSections!)
      .flatMap((s) => s.rows)
      .filter((r) => r.exercise.engineDose?.circuit);
    expect(rows).toHaveLength(9);
    const ids = rows.slice(0, 3).map((r) => r.exercise.exerciseId);
    expect(new Set(ids).size).toBe(3);
    expect(rows.map((r) => r.exercise.exerciseId)).toEqual([...ids, ...ids, ...ids]);
    expect(new Set(rows.map(occurrenceLogKey)).size).toBe(9);
    expect(rows.map((r) => r.exercise.engineDose?.postRestSeconds)).toEqual([
      30, 30, 60, 30, 30, 60, 30, 30, 60,
    ]);
  });
  it("reduces rounds and optional work before main runs; never shortens recovery", () => {
    const normal = buildRunning(p, "speed", "development")!;
    expect(sprintChronology(normal.exercises).filter((e) => e.dose.circuit)).toHaveLength(9);
    const fitted = fitSprintToBudget(normal, normal.minutes - 5)!;
    expect(fitted.minutes).toBeLessThanOrEqual(normal.minutes - 5);
    expect(fitted.exercises.find((e) => e.dose.speedStage === "main")!.dose.restSeconds).toBe(150);
    expect(fitSprintToBudget(normal, 5)).toBeNull();
  });
  it("counts build-ups and run-ins and allows no imaginary resistance", () => {
    const normal = buildRunning(
      { ...p, trainingMethodPreferences: { spaceLengthM: 40 } },
      "speed",
      "development",
    )!;
    expect(normal.sprintMetres).toBe(180);
    expect(normal.plyometricContacts).toBeUndefined();
    expect(normal.exercises.some((e) => e.dose.speedStage === "resisted")).toBe(false);
    const sled = buildRunning(
      { ...p, equipment: ["sled"], trainingMethodPreferences: { spaceLengthM: 40 } },
      "speed",
      "development",
    )!;
    expect(sled.exercises.find((e) => e.dose.speedStage === "resisted")?.exerciseId).toBe(
      "resisted_sled_acceleration",
    );
    expect(sprintDistance(sled.exercises)).toBe(200);
  });
  it.each(["curve", "braking", "planned_cod"] as const)(
    "selects %s only with sufficient declared conditions",
    (sprintFocus) => {
      expect(
        buildRunning(
          { ...p, trainingMethodPreferences: { spaceLengthM: 50, sprintFocus } },
          "speed",
          "development",
        )?.sprintGoal,
      ).toBe(sprintFocus);
      expect(
        buildRunning(
          { ...p, trainingMethodPreferences: { spaceLengthM: 20, sprintFocus } },
          "speed",
          "development",
        )?.sprintGoal,
      ).toBe("acceleration");
    },
  );
  it("adds genuinely distinct drill definitions with instructions and no substitute animation", () => {
    expect(validateCanonicalReplacementChains().issues).toEqual([]);
    for (const id of ["wicket_run", "resisted_a_march"]) {
      expect(getExerciseDefinition(id)?.instructionsPl?.length).toBe(3);
      expect(resolveHowTo({ id, exerciseId: id, name: id }).animation).toBeNull();
    }
  });
});
