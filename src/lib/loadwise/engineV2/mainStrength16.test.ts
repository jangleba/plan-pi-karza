import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildStrength, eligibleExercise } from "./exercises";
import { gymAthlete } from "./testFixtures";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import { getExerciseRegression, selectEquipmentAwareReplacement } from "../exerciseLibrary";
import {
  MAIN_STRENGTH_ROLES,
  TRIVIAL_MAIN_STRENGTH,
  excludedAsReplacement,
} from "../mainStrengthExclusions";

/** 16+ main strength: no trivial bodyweight movement as main work, by any path. */
const TRIVIAL = [...TRIVIAL_MAIN_STRENGTH];
const START = "2026-11-16";
const options = { startDate: START, weeks: 2, minutesPerSession: 75 };
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const mainRows = (plan: SessionDay[]) =>
  plan
    .flatMap(slots)
    .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")))
    .flatMap((s) => s.engineV2!.exercises)
    .filter((e) => MAIN_STRENGTH_ROLES.has(e.role));

const profiles: Array<[string, Profile]> = [
  [
    "16, beginner, dumbbells",
    {
      ...gymAthlete,
      age: 16,
      level: "beginner",
      gymExperienceLevel: "beginner",
      strengthTrainingMonths: 3,
      movementCompetence: "low",
      supervisionLevel: "some",
      equipment: ["dumbbell", "bench"],
    } as Profile,
  ],
  [
    "17, intermediate, full gym",
    {
      ...gymAthlete,
      age: 17,
      level: "intermediate",
      gymExperienceLevel: "intermediate",
      strengthTrainingMonths: 12,
      movementCompetence: "medium",
      supervisionLevel: "some",
    } as Profile,
  ],
  ["21, advanced, full gym", { ...gymAthlete, age: 21 } as Profile],
];

describe("16+ main strength selection", () => {
  it.each(profiles)("%s: loaded main lifts, valid plan, no trivial main work", (_label, p) => {
    const r = generateTrainingPlan(p, options);
    const rows = mainRows(r.plan);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(TRIVIAL).not.toContain(row.exerciseId);
    // Every session still has its loaded knee and hip pattern.
    for (const s of r.plan
      .flatMap(slots)
      .filter(
        (d) =>
          d.engineV2?.roles.some((x) => x.startsWith("strength")) &&
          d.engineV2.postMatch !== "upper",
      )) {
      const roles = new Set(s.engineV2!.exercises.map((e) => e.role));
      expect(roles.has("knee_strength") || roles.has("unilateral_strength")).toBe(true);
    }
    expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
  });

  it("keeps the bodyweight squat and bridge in the warm-up", () => {
    const s = buildStrength(profiles[0][1], "A", "development");
    const warmup = s.exercises.filter((e) => e.role === "warmup").map((e) => e.exerciseId);
    expect(warmup).toEqual(expect.arrayContaining(["bodyweight_squat", "glute_bridge"]));
    expect(eligibleExercise("bodyweight_squat", profiles[0][1], "warmup")).toBe(true);
  });

  it("a manual choice of a trivial variant is ignored for main work", () => {
    const p = {
      ...profiles[2][1],
      trainingMethodPreferences: { gymExercises: { unilateral: "bodyweight_split_squat" } },
    } as unknown as Profile;
    for (const id of TRIVIAL)
      for (const role of ["knee_strength", "hip_strength", "unilateral_strength", "push"] as const)
        expect(eligibleExercise(id, p, role)).toBe(false);
    const b = buildStrength(p, "B", "development");
    expect(b.exercises.find((e) => e.role === "unilateral_strength")?.exerciseId).not.toBe(
      "bodyweight_split_squat",
    );
  });

  it("regressions and equipment replacements never return a trivial variant for main work", () => {
    const novice = buildAthleteTrainingProfile({
      ...gymAthlete,
      age: 16,
      gymExperienceLevel: "none",
      movementCompetence: "low",
      supervisionLevel: "none",
      equipment: [],
      hasGym: false,
    } as Profile);
    for (const source of [
      "goblet_squat",
      "hip_thrust",
      "reverse_lunge",
      "push_up",
      "romanian_deadlift_db",
    ]) {
      const regression = getExerciseRegression(source, novice);
      expect(TRIVIAL).not.toContain(regression?.id);
      const replacement = selectEquipmentAwareReplacement(source, novice);
      expect(TRIVIAL).not.toContain(replacement.exercise?.id);
    }
    // A warm-up source may still fall back to its own trivial family.
    expect(excludedAsReplacement("bodyweight_squat", "glute_bridge")).toBe(false);
    expect(excludedAsReplacement("goblet_squat", "bodyweight_squat")).toBe(true);
  });

  it("without any equipment the missing loaded variant is reported clearly", () => {
    const p = { ...profiles[0][1], hasGym: false, equipment: [] } as Profile;
    const r = generateTrainingPlan(p, options);
    for (const row of mainRows(r.plan)) expect(TRIVIAL).not.toContain(row.exerciseId);
    expect(
      r.issues.some(
        (i) => i.code === "UNMET_STIMULUS" && i.message.startsWith("Brak wariantu z obciążeniem"),
      ),
    ).toBe(true);
  });

  it("valuable bodyweight work stays available", () => {
    const p = profiles[2][1];
    for (const id of [
      "pull_up",
      "full_nordic_hamstring",
      "copenhagen_plank",
      "plank",
      "countermovement_jump",
    ])
      expect(TRIVIAL_MAIN_STRENGTH.has(id)).toBe(false);
    expect(eligibleExercise("copenhagen_plank", p, "adductor")).toBe(true);
    expect(eligibleExercise("plank", p, "trunk")).toBe(true);
  });
});
