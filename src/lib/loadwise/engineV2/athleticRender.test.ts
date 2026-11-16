import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { buildRunnerSteps, occurrenceLogKey } from "../sessionRunner/steps";
import { taskKind } from "../sessionRunner/presentation";
import { exerciseKey } from "../setLogs";
import { athleticSectionType } from "./athleticRender";
import { buildStrength } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";

const athlete: Profile = {
  ...gymAthlete,
  age: 21,
  goal: "endurance",
  strengthTrainingMonths: 48,
  equipment: [...gymAthlete.equipment, "trap_bar", "machine", "nordic_setup"],
  trainingMethodPreferences: { gymTemplate: "athletic_ab" },
};
const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 90 };
const strength = (plan: SessionDay[]) =>
  plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .filter((day) => day.engineV2?.roles.some((role) => role.startsWith("strength")));

describe("sport A/B session presentation", () => {
  it("uses the declared part rather than moving every isometric hold to assistance", () => {
    const recipe = buildStrength(athlete, "A", "development");
    const hold = {
      exerciseId: "long_lever_hamstring_iso",
      role: "hamstring_iso" as const,
      dose: { sets: 2, seconds: 15, restSeconds: 60, intent: "hold" as const },
      reason: "Preparation hold",
      strengthStage: "prep" as const,
    };
    expect(athleticSectionType(recipe, hold)).toBe("prep");
    expect(athleticSectionType(recipe, { ...hold, strengthStage: "accessory" })).toBe("accessory");
    expect(athleticSectionType({ ...recipe, strengthStructure: undefined }, hold)).toBeNull();
  });

  it("renders two separate days in their actual sequence without inferred supersets", () => {
    const result = generateTrainingPlan(athlete, options);
    const sessions = strength(result.plan);
    expect(sessions).toHaveLength(2);
    expect(validateTrainingPlan(result.plan, athlete, options)).toEqual([]);
    expect(sessions.map((day) => day.title?.slice(-1)).sort()).toEqual(["A", "B"]);
    for (const session of sessions) {
      const recipe = session.engineV2!;
      expect(recipe.strengthStructure).toBe("athletic_ab");
      expect(recipe.strengthPairs).toBeUndefined();
      expect(recipe.complexPairs).toBeUndefined();
      const steps = buildRunnerSteps(session.structuredSections!);
      const rows = steps.flatMap((step) => step.rows);
      expect(steps.every((step) => step.kind === "single")).toBe(true);
      expect(rows.map((row) => row.exercise.exerciseId)).toEqual(
        recipe.exercises.map((decision) => decision.exerciseId),
      );
      for (const [index, decision] of recipe.exercises.entries()) {
        expect(rows[index].section.type).toBe(athleticSectionType(recipe, decision));
        expect(rows[index].block.executionProtocol).toBeUndefined();
        expect(rows[index].exercise.engineDose).toEqual(decision.dose);
      }
      expect(session.structuredSections![0].type).toBe("warmup");
      expect(session.structuredSections!.some((part) => part.type === "prep")).toBe(
        recipe.exercises.some(
          (decision) => decision.role !== "warmup" && decision.strengthStage === "prep",
        ),
      );
      expect(session.structuredSections!.some((part) => part.type === "main")).toBe(true);
      expect(session.structuredSections!.some((part) => part.type === "accessory")).toBe(true);
    }
  });

  it("retains ordinary working-set history and the kg/reps or timed-hold recording kinds", () => {
    const sessions = strength(generateTrainingPlan(athlete, options).plan);
    for (const session of sessions) {
      const rows = buildRunnerSteps(session.structuredSections!).flatMap((step) => step.rows);
      expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
      const loaded = rows.filter(
        (row) => taskKind(row.exercise, row.section, "strength") === "load",
      );
      expect(loaded.length).toBeGreaterThan(0);
      for (const row of loaded) {
        expect(["main", "accessory"]).toContain(row.section.type);
        expect(occurrenceLogKey(row)).toBe(exerciseKey(row.exercise));
        expect(row.exercise.engineDose?.reps).toBeGreaterThan(0);
        expect(Number(row.exercise.sets)).toBeGreaterThan(0);
      }
      const workingHolds = rows.filter(
        (row) =>
          ["main", "accessory"].includes(row.section.type) &&
          taskKind(row.exercise, row.section, "strength") === "hold",
      );
      expect(workingHolds.length).toBeGreaterThan(0);
      for (const row of workingHolds) {
        expect(row.exercise.engineDose?.seconds).toBeGreaterThan(0);
        expect(occurrenceLogKey(row)).toBe(exerciseKey(row.exercise));
      }
      for (const row of rows.filter((row) => row.section.type === "warmup")) {
        expect(row.exercise.preparationOnly).toBe(true);
        expect(occurrenceLogKey(row)).toBe(`${exerciseKey(row.exercise)}#warmup`);
      }
    }
  });
});
