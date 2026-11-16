import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { GYM_DECLARED_EQUIPMENT } from "../gymProgramming";
import { buildStrength, fitStrengthToBudget } from "./exercises";
import { finalizeStrengthRecipe, generateTrainingPlan, validateTrainingPlan } from "./planner";
import { validateEngineSession } from "./validation";
import { coachedPrimerDose } from "./strengthProtocols";
import { weeklyTargetCoverage } from "./weeklyTargets";
import { gymAthlete } from "./testFixtures";

const athlete: Profile = {
  ...gymAthlete,
  age: 21,
  strengthTrainingMonths: 48,
  goal: "endurance",
  equipment: [...GYM_DECLARED_EQUIPMENT],
  doubleSessionsAllowed: "yes_if_safe",
  trainingMethodPreferences: { gymTemplate: "athletic_ab" },
};
const options = {
  startDate: "2026-11-16",
  asOfDate: "2026-11-16",
  weeks: 1,
  minutesPerSession: 75,
};
const strength = (plan: SessionDay[]) =>
  plan
    .flatMap((day) => [day, ...(day.secondSession ? [day.secondSession] : [])])
    .filter((session) => session.engineV2?.roles.some((role) => role.startsWith("strength")));

describe("athletic A/B integration with calendar, focus and time fitting", () => {
  it("preserves the selected structure during maintenance in four recurring Sunday match weeks", () => {
    const profile: Profile = {
      ...athlete,
      clubTrainingDays: [3, 5],
      weeklyMatches: true,
      usualMatchDay: 7,
      seasonPhase: "inseason",
    };
    const targets = { strength: 2, speed: 2, endurance: 1 } as const;
    const request = {
      ...options,
      weeks: 4,
      weeklyTargets: targets,
      fillRestDays: true,
      minFullRestDays: 1 as const,
    };
    const result = generateTrainingPlan(profile, request);
    expect(weeklyTargetCoverage(result.plan, targets).map((week) => week.planned)).toEqual(
      Array.from({ length: 4 }, () => ({ strength: 2, speed: 1, endurance: 1 })),
    );
    expect(weeklyTargetCoverage(result.plan, targets).every((week) => week.fullRestDays >= 1)).toBe(
      true,
    );
    for (const session of strength(result.plan)) {
      const recipe = session.engineV2!;
      expect(recipe.strengthStructure).toBe("athletic_ab");
      expect(recipe.strengthPairs).toBeUndefined();
      expect(recipe.complexPairs).toBeUndefined();
      expect(recipe.exercises.every((row) => !!row.strengthStage)).toBe(true);
      if (recipe.postMatch === "full") {
        expect(recipe.strengthFocus?.mode).toBe("maintenance");
        const primary = recipe.exercises.find(
          (row) =>
            row.role === (recipe.roles.includes("strengthA") ? "knee_strength" : "hip_strength"),
        )!;
        expect(primary.dose.sets).toBeLessThanOrEqual(2);
        expect(primary.strengthStage).toBe("main");
      }
    }
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
  });

  it("fits a loaded 35-minute strength day without a contradictory max-focus instruction", () => {
    const profile: Profile = { ...athlete, goal: "strength" };
    const base = buildStrength(profile, "A", "development");
    const roomy = finalizeStrengthRecipe(base, profile, options.startDate, options, [], 120)!;
    const tight = finalizeStrengthRecipe(base, profile, options.startDate, options, [], 35)!;
    expect(tight).not.toBeNull();
    expect(tight.minutes).toBeLessThanOrEqual(35);
    expect(tight.strengthStructure).toBe("athletic_ab");
    expect(tight.variant).toBe("compact");
    expect(tight.exercises.filter((row) => row.role === "warmup")).toHaveLength(5);
    for (const role of ["knee_strength", "knee_flexion", "power"])
      expect(tight.exercises.some((row) => row.role === role)).toBe(true);
    expect(tight.exercises.some((row) => row.role === "push" || row.role === "pull")).toBe(true);
    const primary = tight.exercises.find((row) => row.role === "knee_strength")!;
    if (primary.dose.sets < 3) {
      expect(tight.strengthFocus?.mode).toBe("strength_build");
      expect(primary.reason).toContain(tight.strengthFocus!.reason);
      expect(primary.reason).not.toContain(roomy.strengthFocus!.reason);
    }
    expect(tight.strengthTimeOmissions?.length).toBeGreaterThan(0);
    expect(tight.missing).toEqual(base.missing);
    expect(finalizeStrengthRecipe(base, profile, options.startDate, options, [], 10)).toBeNull();
  });

  it("distinguishes time omissions from unavailable equipment in the final plan diagnostics", () => {
    const request = { ...options, minutesPerSession: 35 };
    const result = generateTrainingPlan(athlete, request);
    expect(strength(result.plan)).toHaveLength(2);
    expect(result.issues.some((issue) => issue.code === "REDUCED_STRENGTH_TIME")).toBe(true);
    expect(result.issues.filter((issue) => issue.code === "UNMET_STIMULUS")).toEqual([]);
    expect(validateTrainingPlan(result.plan, athlete, request)).toEqual([]);
  });

  it("restores the existing independent M09 fallback when a complete contrast does not fit", () => {
    const profile: Profile = {
      ...athlete,
      goal: "strength",
      trainingMethodPreferences: { gymTemplate: "athletic_ab", strength: "M09" },
    };
    const request = { ...options, minutesPerSession: 35 };
    const result = generateTrainingPlan(profile, request);
    const sessions = strength(result.plan);
    expect(sessions).toHaveLength(2);
    const ordinary = sessions.filter((session) => session.engineV2!.organization !== "contrast");
    expect(ordinary.length).toBeGreaterThan(0);
    for (const session of ordinary) {
      const recipe = session.engineV2!;
      const primary = recipe.exercises.find(
        (row) =>
          row.role === (recipe.roles.includes("strengthA") ? "knee_strength" : "hip_strength"),
      )!;
      expect(primary.dose.restSeconds).toBeGreaterThanOrEqual(180);
      expect(recipe.exercises.findIndex((row) => row.role === "power")).toBeLessThan(
        recipe.exercises.indexOf(primary),
      );
    }
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
  });

  it("renders a roomy explicitly selected upper contrast in the press's actual stage", () => {
    const profile: Profile = {
      ...athlete,
      goal: "strength",
      trainingMethodPreferences: {
        gymTemplate: "athletic_ab",
        upperBodyContrast: true,
        gymExercises: { upperPower: "med_ball_throw" },
      },
    };
    const request = { ...options, minutesPerSession: 120 };
    const result = generateTrainingPlan(profile, request);
    const linked = strength(result.plan).filter((session) => session.engineV2!.upperContrast);
    expect(linked.length).toBeGreaterThan(0);
    for (const session of linked) {
      const pair = session.engineV2!.upperContrast!;
      const rows = pair.exerciseIds.map((id) =>
        session.engineV2!.exercises.find((row) => row.exerciseId === id)!,
      );
      expect(rows[1].strengthStage).toBe(rows[0].strengthStage);
      expect(validateEngineSession(session, profile, request)).toEqual([]);
    }
    expect(validateTrainingPlan(result.plan, profile, request)).toEqual([]);
  });

  it("keeps the supervised M14 primer and its post-block recovery whole in a short variant", () => {
    const profile: Profile = {
      ...athlete,
      goal: "strength",
      trainingMethodPreferences: {
        gymTemplate: "athletic_ab",
        strength: "M14",
        coachedIsometricPrimer: true,
      },
    };
    const recipe = buildStrength(profile, "A", "development");
    const primer = recipe.exercises.find((row) => row.role === "iso_primer")!;
    expect(primer).toBeDefined();
    expect(primer.dose).toEqual(coachedPrimerDose());
    const short = fitStrengthToBudget(recipe, 35);
    expect(short.exercises.find((row) => row.role === "iso_primer")?.dose).toEqual(primer.dose);
  });

  it("rejects missing stages, a misplaced primary lift and inferred accessory pairs", () => {
    const saved = strength(generateTrainingPlan(athlete, options).plan)[0];
    const missing = structuredClone(saved);
    delete missing.engineV2!.exercises[0].strengthStage;
    expect(
      validateEngineSession(missing, athlete).some(
        (issue) => issue.code === "ATHLETIC_STAGE_ORDER",
      ),
    ).toBe(true);
    const moved = structuredClone(saved);
    const primaryRole = moved.engineV2!.roles.includes("strengthA")
      ? "knee_strength"
      : "hip_strength";
    moved.engineV2!.exercises.find((row) => row.role === primaryRole)!.strengthStage = "accessory";
    expect(
      validateEngineSession(moved, athlete).some(
        (issue) => issue.code === "ATHLETIC_PRIMARY_STAGE",
      ),
    ).toBe(true);
    const paired = structuredClone(saved);
    paired.engineV2!.strengthPairs = [
      { roles: ["push", "pull"], label: "B", transitionSeconds: 30, roundRestSeconds: 180 },
    ];
    expect(
      validateEngineSession(paired, athlete).some(
        (issue) => issue.code === "ATHLETIC_AUTOMATIC_PAIRS",
      ),
    ).toBe(true);
  });
});
