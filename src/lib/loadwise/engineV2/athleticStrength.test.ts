import { describe, expect, it } from "vitest";
import { buildStrength } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";
import type { Profile } from "../types";
import { isAthleticStrengthSelected } from "./athleticStrength";

const profile: Profile = {
  ...gymAthlete,
  age: 21,
  goal: "endurance",
  strengthTrainingMonths: 48,
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "trap_bar",
    "bench",
    "band",
    "nordic_setup",
    "gym_jump_lane",
  ],
};

describe("adaptive athletic strength days", () => {
  it("defaults to two independently executed athletic days without requiring a power goal", () => {
    expect(isAthleticStrengthSelected(profile)).toBe(true);
    for (const variant of ["A", "B"] as const) {
      const recipe = buildStrength(profile, variant, "development");
      expect(recipe.strengthStructure).toBe("athletic_ab");
      expect(recipe.strengthPairs).toBeUndefined();
      expect(recipe.complexPairs).toBeUndefined();
      expect(recipe.organization).not.toBe("contrast");
      expect(recipe.exercises.every((row) => !!row.strengthStage)).toBe(true);
      expect(
        recipe.exercises.find(
          (row) => row.role === (variant === "A" ? "knee_strength" : "hip_strength"),
        )?.strengthStage,
      ).toBe("main");
    }
    const a = buildStrength(profile, "A", "development");
    const b = buildStrength(profile, "B", "development");
    expect(a.exercises.find((row) => row.role === "power")?.exerciseId).toBe("gym_cmj");
    expect(a.exercises.some((row) => row.role === "knee_flexion")).toBe(true);
    expect(a.exercises.some((row) => row.role === "hip_strength")).toBe(false);
    expect(b.exercises.find((row) => row.role === "hamstring_iso")?.strengthStage).toBe(
      "accessory",
    );
    expect(b.exercises.some((row) => row.exerciseId === "single_leg_pogo")).toBe(true);
  });

  it("keeps an explicit balanced layout and does not invent gym access", () => {
    const balanced: Profile = {
      ...profile,
      trainingMethodPreferences: { gymTemplate: "balanced" },
    };
    expect(isAthleticStrengthSelected(balanced)).toBe(false);
    expect(buildStrength(balanced, "A", "development").strengthStructure).toBeUndefined();
    expect(buildStrength(balanced, "A", "development").strengthPairs?.length).toBeGreaterThan(0);
    const home = { ...profile, hasGym: false, equipment: [] };
    expect(isAthleticStrengthSelected(home)).toBe(false);
    expect(buildStrength(home, "A", "development").strengthStructure).toBeUndefined();
  });

  it("regresses technical reactive work without claiming missing stations or copying notebook kilograms", () => {
    const provisional: Profile = {
      ...profile,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: 48,
      movementCompetence: undefined,
      supervisionLevel: undefined,
      equipment: ["dumbbell", "bench"],
      hasPitch: false,
    };
    for (const variant of ["A", "B"] as const) {
      const recipe = buildStrength(provisional, variant, "development");
      expect(recipe.strengthStructure).toBe("athletic_ab");
      expect(
        recipe.exercises.some((row) =>
          [
            "single_leg_pogo",
            "gym_cmj_assisted",
            "gym_cmj_resisted",
            "full_nordic_hamstring",
            "resisted_sled_acceleration",
          ].includes(row.exerciseId),
        ),
      ).toBe(false);
      expect(recipe.exercises.every((row) => !JSON.stringify(row.dose).includes("weightKg"))).toBe(
        true,
      );
    }
  });

  it("preserves recognizable independent days through the actual endurance plan", () => {
    const request = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 90 };
    const result = generateTrainingPlan(profile, request);
    const sessions = result.plan
      .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
      .filter((day) => day.engineV2?.roles.some((role) => role.startsWith("strength")));
    expect(sessions).toHaveLength(2);
    for (const session of sessions) {
      expect(session.engineV2!.strengthStructure).toBe("athletic_ab");
      expect(
        session
          .structuredSections!.flatMap((section) => section.blocks)
          .every((block) => block.blockType !== "superset"),
      ).toBe(true);
      expect(session.durationMin).toBeLessThanOrEqual(request.minutesPerSession);
    }
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
  });

  it.each(["adaptation", "peak", "deload"] as const)(
    "retains its structure with the existing lighter neural options in %s",
    (phase) => {
      for (const variant of ["A", "B"] as const) {
        const recipe = buildStrength(profile, variant, phase);
        expect(recipe.strengthStructure).toBe("athletic_ab");
        expect(recipe.phase).toBe(phase);
        expect(recipe.strengthPairs).toBeUndefined();
        expect(recipe.exercises.every((row) => !!row.strengthStage)).toBe(true);
        expect(recipe.exercises.some((row) => row.exerciseId === "single_leg_pogo")).toBe(false);
        expect(recipe.exercises.some((row) => row.exerciseId === "gym_fast_band_curl")).toBe(false);
        expect(recipe.exercises.find((row) => row.role === "power")?.exerciseId).toBe("gym_cmj");
      }
    },
  );
});
