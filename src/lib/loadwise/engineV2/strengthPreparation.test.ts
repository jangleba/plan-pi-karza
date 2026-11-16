import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { buildRunnerSteps, occurrenceLogKey } from "../sessionRunner/steps";
import { exerciseKey } from "../setLogs";
import { preparationVisualFor } from "../preparation/protocols";
import { generateTrainingPlan, refreshStrengthSession, validateTrainingPlan } from "./planner";
import { buildStrength, eligibleExercise, estimateSessionSeconds } from "./exercises";
import { deriveEngineSessionLoad, validateEngineSession } from "./validation";
import { strengthPreparationOverhead } from "./strengthPreparation";
import { gymAthlete } from "./testFixtures";
import type { EngineSession } from "./model";
import { getExerciseDefinition } from "../exerciseLibrary";

const athlete: Profile = {
  ...gymAthlete,
  age: 21,
  goal: "endurance",
  strengthTrainingMonths: 48,
  equipment: ["barbell", "rack", "dumbbell", "trap_bar", "band", "bench", "gym_jump_lane"],
};
const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
const strength = (plan: SessionDay[]) =>
  plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .filter((day) => day.engineV2?.roles.some((role) => role.startsWith("strength")));
const preparationIds = [
  "warmup_walk",
  "ankle_rock_forward",
  "adductor_rockback",
  "bodyweight_squat",
  "glute_bridge",
];

describe("explicit strength preparation", () => {
  it.each([45, 75])(
    "shows the existing five-movement preparation before work within %i minutes",
    (minutesPerSession) => {
      const request = { ...options, minutesPerSession };
      const result = generateTrainingPlan(athlete, request);
      const sessions = strength(result.plan);
      expect(sessions).toHaveLength(2);
      for (const session of sessions) {
        expect(session.engineV2!.strengthPreparationVersion).toBe(1);
        expect(session.durationMin).toBeLessThanOrEqual(minutesPerSession);
        const steps = buildRunnerSteps(session.structuredSections!);
        expect(steps.slice(0, 5).map((step) => step.rows[0].exercise.exerciseId)).toEqual(
          preparationIds,
        );
        expect(steps.slice(0, 5).every((step) => step.section.type === "warmup")).toBe(true);
        expect(steps[5].section.type).not.toBe("warmup");
        for (const row of session.engineV2!.exercises.filter((row) => row.role === "warmup"))
          expect(eligibleExercise(row.exerciseId, athlete, "warmup")).toBe(true);
        const firstMain = steps
          .flatMap((step) => step.rows)
          .find((row) => /serie wprowadzające/.test(row.exercise.cue ?? ""));
        expect(firstMain).toBeDefined();
        expect(preparationVisualFor(steps[0].rows[0].exercise)).toBe("walk");
        expect(session.engineV2!.minutes).toBe(
          deriveEngineSessionLoad(session.engineV2!, athlete).minutes,
        );
      }
      expect(validateTrainingPlan(result.plan, athlete, request)).toEqual([]);
    },
  );

  it("keeps the existing movement doses and removes the hidden new-recipe eight-minute allowance", () => {
    const recipe = buildStrength(athlete, "A", "development");
    const rows = recipe.exercises.filter((row) => row.role === "warmup");
    expect(rows.map((row) => [row.exerciseId, row.dose])).toEqual([
      ["warmup_walk", { sets: 1, seconds: 180, restSeconds: 10, intent: "easy" }],
      ["ankle_rock_forward", { sets: 1, reps: 8, perSide: true, restSeconds: 10, intent: "easy" }],
      ["adductor_rockback", { sets: 1, reps: 6, perSide: true, restSeconds: 10, intent: "easy" }],
      ["bodyweight_squat", { sets: 1, reps: 6, restSeconds: 10, intent: "easy" }],
      ["glute_bridge", { sets: 1, reps: 8, restSeconds: 10, intent: "easy" }],
    ]);
    expect(strengthPreparationOverhead(recipe)).toBe(0);
    expect(recipe.minutes).toBe(Math.ceil(estimateSessionSeconds(recipe.exercises) / 60));
    const legacy: EngineSession = {
      ...structuredClone(recipe),
      strengthPreparationVersion: undefined,
      exercises: [
        {
          exerciseId: "hip_mobility_flow",
          role: "warmup",
          dose: { sets: 1, seconds: 60, perSide: true, restSeconds: 0, intent: "easy" },
          reason: "Legacy preparation",
        },
        ...recipe.exercises.filter((row) => row.role !== "warmup"),
      ],
    };
    legacy.minutes = Math.ceil(estimateSessionSeconds(legacy.exercises) / 60) + 8;
    expect(strengthPreparationOverhead(legacy)).toBe(8);
    expect(deriveEngineSessionLoad(legacy, athlete).minutes).toBe(legacy.minutes);
    // The allowance is replaced by real preparation, not added to the new session again.
    expect(Math.abs(recipe.minutes - legacy.minutes)).toBeLessThanOrEqual(1);
  });

  it("keeps loaded work distinct from the same warm-up pattern and preserves its history key", () => {
    // 16+: the main lift is a loaded variant (dumbbells); the bodyweight squat stays in the warm-up.
    const beginner: Profile = {
      ...athlete,
      level: "beginner",
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 3,
      movementCompetence: "low",
      supervisionLevel: "some",
      hasGym: true,
      hasPitch: false,
      hasSprintSpace: false,
      equipment: ["dumbbell"],
    };
    const result = generateTrainingPlan(beginner, options);
    const sessions = strength(result.plan);
    expect(sessions).toHaveLength(2);
    for (const session of sessions) {
      const rows = buildRunnerSteps(session.structuredSections!).flatMap((step) => step.rows);
      const main = rows.filter((row) => row.section.type === "main");
      for (const row of main)
        expect([
          "bodyweight_squat",
          "glute_bridge",
          "bodyweight_split_squat",
          "incline_push_up",
        ]).not.toContain(row.exercise.exerciseId);
      const work = main.find((row) =>
        ["goblet_squat", "romanian_deadlift_db", "hip_thrust"].includes(
          row.exercise.exerciseId ?? "",
        ),
      )!;
      expect(work).toBeDefined();
      const warmup = rows.find(
        (row) =>
          row.section.type === "warmup" &&
          ["bodyweight_squat", "glute_bridge"].includes(row.exercise.exerciseId ?? ""),
      )!;
      expect(warmup).toBeDefined();
      expect(warmup.key).not.toBe(work.key);
      expect(occurrenceLogKey(warmup)).not.toBe(occurrenceLogKey(work));
      expect(occurrenceLogKey(work)).toBe(exerciseKey(work.exercise));
      expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    }
    expect(validateTrainingPlan(result.plan, beginner, options)).toEqual([]);
  });

  it("still rejects repeated work rows and repeated warm-up rows", () => {
    const session = strength(generateTrainingPlan(athlete, options).plan)[0];
    for (const role of ["warmup", "knee_strength"] as const) {
      const bad = structuredClone(session);
      const repeated = bad.engineV2!.exercises.find((row) => row.role === role)!;
      bad.engineV2!.exercises.push(structuredClone(repeated));
      expect(
        validateEngineSession(bad, athlete).some((issue) => issue.code === "DUPLICATE_EXERCISE"),
      ).toBe(true);
    }
  });

  it("refreshes a saved session without duplicating its preparation", () => {
    const result = generateTrainingPlan(athlete, options);
    const saved = strength(result.plan)[0];
    const first = refreshStrengthSession(saved, athlete, options, result.plan)!;
    const second = refreshStrengthSession(first, athlete, options, result.plan)!;
    expect(second.engineV2!.strengthPreparationVersion).toBe(1);
    expect(
      second
        .engineV2!.exercises.filter((row) => row.role === "warmup")
        .map((row) => row.exerciseId),
    ).toEqual(preparationIds);
    expect(second.engineV2!.exercises).toEqual(first.engineV2!.exercises);
    expect(second.durationMin).toBe(first.durationMin);
  });

  it("retains the introducing-set cue before the first loaded upper-body task on MD+1", () => {
    const profile: Profile = {
      ...athlete,
      age: 17,
      goal: "speed",
      level: "intermediate",
      gymExperienceLevel: "intermediate",
      strengthTrainingMonths: 12,
      movementCompetence: "medium",
      supervisionLevel: "some",
      clubTrainingDays: [2, 4],
      usualMatchDay: 6,
      weeklyMatches: true,
      doubleSessionsAllowed: "light_only",
      seasonPhase: "inseason",
    };
    const result = generateTrainingPlan(profile, {
      ...options,
      minutesPerSession: 60,
    });
    const upper = strength(result.plan).find((session) => session.engineV2!.postMatch === "upper")!;
    expect(upper).toBeDefined();
    const rows = buildRunnerSteps(upper.structuredSections!).flatMap((step) => step.rows);
    const loaded = rows.find((row) =>
      ["external", "axial"].includes(
        getExerciseDefinition(row.exercise.exerciseId!)?.loadingType ?? "",
      ),
    )!;
    expect(loaded.exercise.cue).toContain("serie wprowadzające");
    expect(rows.filter((row) => /serie wprowadzające/.test(row.exercise.cue ?? ""))).toHaveLength(
      1,
    );
    expect(upper.engineV2!.highLower).toBe(false);
  });
});
