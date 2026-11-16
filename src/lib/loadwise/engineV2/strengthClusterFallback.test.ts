import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { CLUSTER_INSTRUCTION } from "./strengthProtocols";
import { gymAthlete } from "./testFixtures";
import { applyStrengthFocus } from "./strengthPolicy";

const baseAthlete: Profile = {
  ...gymAthlete,
  age: 21,
  goal: "strength",
  strengthTrainingMonths: 48,
  equipment: ["barbell", "rack", "dumbbell", "trap_bar", "band", "bench", "gym_jump_lane"],
  trainingMethodPreferences: { strength: "M08", gymTemplate: "balanced" },
};
const strength = (plan: SessionDay[]) =>
  plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .filter((day) => day.engineV2?.roles.some((role) => role.startsWith("strength")));
const primary = (session: SessionDay) => {
  const recipe = session.engineV2!;
  return recipe.exercises.find(
    (row) => row.role === (recipe.roles.includes("strengthA") ? "knee_strength" : "hip_strength"),
  )!;
};
const renderedPrimary = (session: SessionDay) =>
  session
    .structuredSections!.flatMap((section) => section.blocks.flatMap((block) => block.exercises))
    .find((exercise) => exercise.exerciseId === primary(session).exerciseId)!;
const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };

describe.each(["balanced", "athletic_ab"] as const)(
  "cluster instructions follow the final %s prescription",
  (gymTemplate) => {
    const athlete: Profile = {
      ...baseAthlete,
      trainingMethodPreferences: { strength: "M08", gymTemplate },
    };
    it("keeps cluster guidance and its execution tool when the full session fits", () => {
      const result = generateTrainingPlan(athlete, options);
      const sessions = strength(result.plan);
      expect(sessions).toHaveLength(2);
      for (const session of sessions) {
        expect(primary(session).dose.cluster).toBeDefined();
        expect(renderedPrimary(session).methodExecution?.mode).toBe("cluster");
        expect(renderedPrimary(session).purpose).toContain(CLUSTER_INSTRUCTION);
        expect(renderedPrimary(session).purpose).not.toContain("Zwykłe serie:");
      }
      expect(validateTrainingPlan(result.plan, athlete, options)).toEqual([]);
    });

    it.each(gymTemplate === "balanced" ? [30, 45] : [35, 45])(
      "keeps method, tool and guidance consistent in a %i-minute compact session",
      (minutesPerSession) => {
        const request = { ...options, minutesPerSession };
        const result = generateTrainingPlan(athlete, request);
        const sessions = strength(result.plan);
        expect(sessions).toHaveLength(2);
        for (const session of sessions) {
          expect(session.engineV2!.variant).toBe("compact");
          const exercise = renderedPrimary(session);
          if (gymTemplate === "balanced" || minutesPerSession === 35)
            expect(primary(session).dose.cluster).toBeUndefined();
          if (primary(session).dose.cluster) {
            expect(exercise.methodExecution?.mode).toBe("cluster");
            expect(exercise.purpose).toContain(CLUSTER_INSTRUCTION);
            expect(exercise.purpose).not.toContain("Zwykłe serie:");
          } else {
            expect(exercise.methodExecution).toBeUndefined();
            expect(exercise.purpose).not.toContain(CLUSTER_INSTRUCTION);
            expect(exercise.purpose).not.toContain("Klaster:");
            expect(exercise.purpose).toContain("Zwykłe serie:");
          }
        }
        expect(validateTrainingPlan(result.plan, athlete, request)).toEqual([]);
      },
    );

    it("removes cluster guidance when a confirmed gap reduces an existing recipe, without duplicating instructions", () => {
      const original = strength(generateTrainingPlan(athlete, options).plan)[0];
      const previous = { ...original, date: "2026-11-01", dbId: "completed-gym" };
      const request = {
        ...options,
        completions: {
          "completed-gym": {
            completed: true,
            status: "completed" as const,
            rpe: 6,
            notes: "",
            executionSnapshot: previous,
          },
        },
      };
      const reduced = applyStrengthFocus(original.engineV2!, athlete, original.date, request, []);
      expect(reduced.strengthFocus?.mode).toBe("reentry");
      const row = reduced.exercises.find((exercise) => exercise.role === "knee_strength")!;
      expect(row.dose.cluster).toBeUndefined();
      expect(row.reason).not.toContain("Klaster:");
      expect(row.reason.match(/Zwykłe serie:/g)).toHaveLength(1);
      const repeated = applyStrengthFocus(reduced, athlete, original.date, request, []);
      expect(repeated.exercises).toEqual(reduced.exercises);
      expect(primary(original).dose.cluster).toBeDefined();
      expect(primary(original).reason).toContain(CLUSTER_INSTRUCTION);
    });
  },
);
