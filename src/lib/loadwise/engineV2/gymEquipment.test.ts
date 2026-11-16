import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { buildAthleteTrainingProfile, getGymEquipmentMode } from "../athleteProfile";
import { getExerciseDefinition, resolveEquipmentId } from "../exerciseLibrary";
import { decodeStrengthExperience, encodeStrengthExperience } from "../strengthExperience";
import { buildStrength, eligibleExercise } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";

const athlete: Profile = { ...gymAthlete, age: 27, goal: "strength", equipment: [] };
const slots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const reload = (p: Profile): Profile => ({
  ...p,
  ...decodeStrengthExperience(encodeStrengthExperience(p)),
});

describe("declared gym equipment reaches prescription and final validation", () => {
  it("carries the selected/full mode into the canonical athlete profile", () => {
    for (const gymEquipmentMode of ["selected", "full"] as const) {
      const p = { ...athlete, trainingMethodPreferences: { gymEquipmentMode } };
      expect(getGymEquipmentMode(p)).toBe(gymEquipmentMode);
      expect(buildAthleteTrainingProfile(p).gymEquipmentMode).toBe(gymEquipmentMode);
      expect(buildAthleteTrainingProfile(reload(p)).gymEquipmentMode).toBe(gymEquipmentMode);
    }
    expect(getGymEquipmentMode(athlete)).toBe("full");
    expect(getGymEquipmentMode({ ...athlete, equipment: ["Hantle"] })).toBe("selected");
  });

  it.each(["profile", "extra declaration"] as const)(
    "only dumbbells in %s never become a barbell, rack or bench, including after reload",
    (source) => {
      const p = reload({
        ...athlete,
        equipment: source === "profile" ? ["Hantle"] : [],
        trainingMethodPreferences: {
          gymEquipmentMode: "selected",
          declaredEquipment: source === "extra declaration" ? ["dumbbell"] : [],
          gymExercises: {
            squat: "heavy_back_squat",
            hinge: "trap_bar_deadlift",
            pushA: "barbell_bench_press",
          },
        },
      });
      const raw = [buildStrength(p, "A", "development"), buildStrength(p, "B", "development")];
      for (const r of raw) {
        expect(r.exercises.length).toBeGreaterThan(0);
        for (const e of r.exercises)
          expect(
            getExerciseDefinition(e.exerciseId)!.equipmentRequired.every(
              (id) => id === "dumbbell" || id === "none",
            ),
            e.exerciseId,
          ).toBe(true);
      }
      const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
      const result = generateTrainingPlan(p, options);
      expect(validateTrainingPlan(result.plan, p, options)).toEqual([]);
      const sessions = result.plan
        .flatMap(slots)
        .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
      expect(sessions).toHaveLength(2);
      for (const session of sessions)
        for (const e of session.engineV2!.exercises)
          expect(
            getExerciseDefinition(e.exerciseId)!.equipmentRequired.some((id) =>
              ["barbell", "rack", "bench"].includes(id),
            ),
            e.exerciseId,
          ).toBe(false);
      expect(raw.flatMap((r) => r.exercises).some((e) => e.exerciseId === "goblet_squat")).toBe(
        true,
      );
    },
  );

  it("preserves explicitly declared profile equipment alongside additional stations", () => {
    const p = reload({
      ...athlete,
      equipment: ["Hantle", "Ławka", "Guma oporowa"],
      trainingMethodPreferences: {
        gymEquipmentMode: "selected",
        declaredEquipment: ["trap_bar", "nordic_setup"],
      },
    });
    const canonical = buildAthleteTrainingProfile(p);
    expect(canonical.gymEquipmentMode).toBe("selected");
    expect(canonical.equipmentAccess.map((v) => resolveEquipmentId(v) ?? v)).toEqual([
      "dumbbell",
      "bench",
      "band",
      "trap_bar",
      "nordic_setup",
    ]);
    const a = buildStrength(p, "A", "development"),
      b = buildStrength(p, "B", "development");
    expect(a.exercises.some((e) => e.exerciseId === "full_nordic_hamstring")).toBe(true);
    expect(b.exercises.some((e) => e.exerciseId === "trap_bar_deadlift")).toBe(true);
    expect(b.exercises.some((e) => e.exerciseId === "bulgarian_split_squat")).toBe(true);
  });

  it("basic gym mode allows ordinary barbell work but does not invent specialist stations", () => {
    const p = reload({ ...athlete, trainingMethodPreferences: { gymEquipmentMode: "full" } });
    expect(eligibleExercise("heavy_back_squat", p)).toBe(true);
    expect(eligibleExercise("barbell_bench_press", p)).toBe(true);
    expect(eligibleExercise("trap_bar_deadlift", p)).toBe(false);
    expect(eligibleExercise("full_nordic_hamstring", p)).toBe(false);
    expect(eligibleExercise("med_ball_throw", p, "upper_power")).toBe(false);
    const b = buildStrength(p, "B", "development");
    expect(b.exercises.some((e) => e.exerciseId === "barbell_deadlift")).toBe(true);
    expect(b.exercises.some((e) => e.exerciseId === "trap_bar_deadlift")).toBe(false);
  });

  it("keeps the basic-gym legacy default when only an additional jump zone was declared", () => {
    const p = reload({
      ...athlete,
      equipment: [],
      trainingMethodPreferences: { declaredEquipment: ["gym_jump_lane"] },
    });
    expect(getGymEquipmentMode(p)).toBe("full");
    expect(buildAthleteTrainingProfile(p).gymEquipmentMode).toBe("full");
    const a = buildStrength(p, "A", "development");
    expect(a.exercises.some((e) => e.exerciseId === "heavy_back_squat")).toBe(true);
    expect(a.exercises.some((e) => e.exerciseId === "barbell_bench_press")).toBe(true);
    expect(eligibleExercise("trap_bar_deadlift", p)).toBe(false);
    const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
    const result = generateTrainingPlan(p, options);
    expect(validateTrainingPlan(result.plan, p, options)).toEqual([]);
  });

  it("an explicit unavailable bench remains unavailable in basic gym mode", () => {
    const p = {
      ...athlete,
      unavailableEquipmentIds: ["bench"],
      trainingMethodPreferences: { gymEquipmentMode: "full" as const },
    };
    expect(eligibleExercise("barbell_bench_press", p)).toBe(false);
    expect(eligibleExercise("dumbbell_bench_press", p)).toBe(false);
  });
});
