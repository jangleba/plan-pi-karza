import { describe, expect, it } from "vitest";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildStrength, buildRunning, CANDIDATES } from "./exercises";
import { trainingTier } from "./model";
import { getExerciseDefinition } from "../exerciseLibrary";
import { assertPlanExerciseContract } from "../planExerciseContract";
import { exercisePrescriptionKey } from "../setLogHistory";
import { recipeTotalSeconds } from "@/lib/running/recipe";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { getAllExerciseDefinitions } from "../exerciseLibrary";
import type { Profile } from "../types";

export const athlete: Profile = {
  name: "Test",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  matchDates: [],
  equipment: [
    "barbell",
    "rack",
    "dumbbell",
    "trap_bar",
    "machine",
    "band",
    "bench",
    "med_ball",
    "nordic_setup",
  ],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
};
const options = { startDate: "2026-11-02" };
const recipes = (r: ReturnType<typeof generateTrainingPlan>) =>
  r.plan.flatMap((d) => [d, d.secondSession].filter((s) => s?.engineV2).map((s) => s!.engineV2!));

describe("V2 final training contracts", () => {
  it("has functional metadata for the entire retained strength, power, plyometric, isometric and trunk inventory", () => {
    const cards = getAllExerciseDefinitions().filter((e) =>
      ["strength", "power", "plyometric", "tendon_isometric", "trunk"].includes(e.family ?? ""),
    );
    expect(cards).toHaveLength(104);
    expect(cards.filter((e) => !FUNCTIONAL_CATALOGUE[e.id]).map((e) => e.id)).toEqual([]);
  });
  it("keeps run counter seconds consistent with the planned duration", () => {
    const r = generateTrainingPlan(athlete, options);
    const runs = r.plan.flatMap((d) => [d, d.secondSession]).filter((s) => s?.runningRecipe);
    expect(runs.length).toBe(4);
    for (const s of runs) expect(recipeTotalSeconds(s!.runningRecipe!)).toBe(s!.durationMin * 60);
  });
  it("detects a rendered dose changed independently of the engine decision", () => {
    const r = generateTrainingPlan(athlete, options);
    const slot = r.plan.flatMap((d) => [d, d.secondSession]).find((s) => s?.engineV2)!;
    slot.structuredSections![0].blocks[0].exercises[0].sets = "999";
    expect(
      validateTrainingPlan(r.plan, athlete, options).some((i) => i.code === "DOSE_MISMATCH"),
    ).toBe(true);
  });
  it("preserves locked execution snapshots while replanning the rest of a week", () => {
    const r = generateTrainingPlan(athlete, options);
    const locked = structuredClone(r.plan.find((d) => d.engineV2)!);
    locked.executionProtected = true;
    const next = generateTrainingPlan(athlete, { ...options, lockedDays: [locked] });
    const stored = next.plan.find((d) => d.date === locked.date)!;
    expect(stored.structuredSections).toEqual(locked.structuredSections);
    expect(stored.engineV2).toEqual(locked.engineV2);
    expect(validateTrainingPlan(next.plan, athlete, options)).toEqual([]);
  });
  it("covers all four weekly targets when feasible and persists valid, instructed exercises", () => {
    const r = generateTrainingPlan(athlete, options);
    expect(r.issues.filter((i) => i.code !== "UNMET_STIMULUS")).toEqual([]);
    for (let w = 0; w < 4; w++) {
      const roles = r.plan
        .slice(w * 7, w * 7 + 7)
        .flatMap((d) => [d, d.secondSession].flatMap((s) => s?.engineV2?.roles ?? []));
      expect(
        roles.filter((r) => ["endurance", "speed", "strengthA", "strengthB"].includes(r)).sort(),
      ).toEqual(["endurance", "speed", "strengthA", "strengthB"]);
    }
    expect(() => assertPlanExerciseContract(r.plan)).not.toThrow();
    expect(r.plan).toHaveLength(28);
  });
  it("does not infer gym preparation from elite football level", () => {
    expect(
      trainingTier({
        ...athlete,
        level: "elite",
        gymExperienceLevel: undefined,
        strengthTrainingMonths: undefined,
        movementCompetence: undefined,
      }),
    ).toBe("foundation");
  });
  it("keeps hamstring knee flexion, hip extension and isometric tasks distinct", () => {
    expect(CANDIDATES.knee_flexion).not.toContain("romanian_deadlift_db");
    expect(CANDIDATES.hamstring_iso).not.toContain("full_nordic_hamstring");
    const a = buildStrength(athlete, "A", "development"),
      b = buildStrength(athlete, "B", "development");
    expect(a.exercises.some((e) => e.role === "knee_flexion")).toBe(true);
    expect(b.exercises.some((e) => e.role === "unilateral_strength")).toBe(true);
    expect(a.exercises.some((e) => e.role === "adductor")).toBe(true);
    expect(b.exercises.some((e) => e.role === "trunk")).toBe(true);
  });
  it("uses loaded power only for eligible prepared athletes with explicitly declared equipment", () => {
    const p = { ...athlete, goal: "power" as const };
    expect(
      buildStrength(p, "A", "development").exercises.some(
        (e) => getExerciseDefinition(e.exerciseId)?.family === "power",
      ),
    ).toBe(true);
    expect(
      buildStrength({ ...p, equipment: [] }, "A", "development").exercises.some(
        (e) => getExerciseDefinition(e.exerciseId)?.family === "power",
      ),
    ).toBe(false);
  });
  it("reduces the actual dose on deload, without randomising the main lift", () => {
    const normal = buildStrength(athlete, "A", "development"),
      light = buildStrength(athlete, "A", "deload");
    const a = normal.exercises.find((e) => e.role === "knee_strength")!,
      b = light.exercises.find((e) => e.role === "knee_strength")!;
    expect(a.exerciseId).toBe(b.exerciseId);
    expect(b.dose.sets).toBeLessThan(a.dose.sets);
    expect(light.minutes).toBeLessThan(normal.minutes);
    const novice = {
      ...athlete,
      gymExperienceLevel: "beginner" as const,
      strengthTrainingMonths: 2,
      movementCompetence: "low" as const,
    };
    expect(buildRunning(novice, "speed", "deload")!.sprintMetres).toBeLessThan(
      buildRunning(novice, "speed", "development")!.sprintMetres,
    );
  });
  it("reports impossible targets rather than creating unavailable days or phantom sessions", () => {
    const r = generateTrainingPlan({ ...athlete, unavailableDays: [1, 2, 3, 4, 5, 6, 7] }, options);
    expect(recipes(r)).toHaveLength(0);
    expect(r.issues.filter((i) => i.code === "UNMET_WEEKLY_TARGET")).toHaveLength(16);
  });
  it("does not rewrite its inputs and is deterministic", () => {
    const p = structuredClone(athlete),
      before = JSON.stringify(p);
    expect(generateTrainingPlan(p, options)).toEqual(generateTrainingPlan(p, options));
    expect(JSON.stringify(p)).toBe(before);
  });
  it("keeps separate isometric durations in history", () => {
    expect(exercisePrescriptionKey({ sets: "3", duration: "10 s" })).not.toBe(
      exercisePrescriptionKey({ sets: "3", duration: "30 s" }),
    );
  });
  it.each(["2026-02-30", "not-a-date"])("rejects invalid date %s", (startDate) => {
    expect(() => generateTrainingPlan(athlete, { startDate })).toThrow();
  });
  for (const age of [13, 16, 17, 27])
    for (const clubTrainingDays of [[], [2, 4], [1, 2, 3, 4, 5]])
      for (const doubles of ["no", "yes_if_safe"] as const) {
        it(`validates 28 days: age=${age}, club=${clubTrainingDays.length}, doubles=${doubles}`, () => {
          const p = {
            ...athlete,
            age,
            clubTrainingDays,
            doubleSessionsAllowed: doubles,
            weeklyMatches: true,
            usualMatchDay: 7,
            gymExperienceLevel: age === 13 ? ("beginner" as const) : athlete.gymExperienceLevel,
            strengthTrainingMonths: age === 13 ? 2 : 36,
            movementCompetence: age === 13 ? ("low" as const) : ("high" as const),
          };
          const r = generateTrainingPlan(p, options);
          expect(validateTrainingPlan(r.plan, p, options)).toEqual([]);
          expect(() => assertPlanExerciseContract(r.plan)).not.toThrow();
          expect(recipes(r).every((x) => x.sprintMetres <= 240)).toBe(true);
          for (const d of r.plan) expect(d.secondSession?.secondSession).toBeFalsy();
        });
      }
});
