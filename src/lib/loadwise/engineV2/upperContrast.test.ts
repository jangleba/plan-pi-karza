import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { GYM_DECLARED_EQUIPMENT } from "../gymProgramming";
import { decodeStrengthExperience, encodeStrengthExperience } from "../strengthExperience";
import { buildRunnerSteps } from "../sessionRunner/steps";
import { restSecondsAfter } from "../sessionRunner/presentation";
import {
  buildStrength,
  eligibleExercise,
  estimateSessionSeconds,
  fitStrengthToBudget,
} from "./exercises";
import {
  finalizeStrengthRecipe,
  generateTrainingPlan,
  placeRecipeOnDate,
  removeOwnSession,
  validateTrainingPlan,
} from "./planner";
import { validateEngineSession } from "./validation";
import { gymAthlete } from "./testFixtures";
import { applyUpperContrast, UPPER_CONTRAST } from "./upperContrast";

const player: Profile = {
  ...gymAthlete,
  age: 27,
  goal: "strength",
  equipment: [...GYM_DECLARED_EQUIPMENT],
  trainingMethodPreferences: {
    upperBodyContrast: true,
    gymExercises: { pushA: "barbell_bench_press", upperPower: "med_ball_throw" },
  },
};
const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 90 };
const slots = (day: SessionDay) => [day, ...(day.secondSession ? [day.secondSession] : [])];
const sessions = (p = player, minutesPerSession = 90) => {
  const opts = { ...options, minutesPerSession };
  const result = generateTrainingPlan(p, opts);
  expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
  return result.plan
    .flatMap(slots)
    .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
};
const pairRecipe = () => {
  const r = applyUpperContrast(buildStrength(player, "A", "development"), player, (id) =>
    eligibleExercise(id, player, "upper_power"),
  );
  r.minutes = Math.ceil(estimateSessionSeconds(r.exercises) / 60) + 8;
  return r;
};

describe("optional coached upper-body contrast reaches prescription and runner", () => {
  it("preserves an explicit choice after profile save/reload, ignoring non-boolean values", () => {
    expect(
      decodeStrengthExperience(encodeStrengthExperience(player)).trainingMethodPreferences
        ?.upperBodyContrast,
    ).toBe(true);
    const invalid = {
      ...player,
      trainingMethodPreferences: { upperBodyContrast: "true" },
    } as unknown as Profile;
    expect(
      decodeStrengthExperience(encodeStrengthExperience(invalid)).trainingMethodPreferences
        ?.upperBodyContrast,
    ).toBeUndefined();
  });

  it("executes two B1/B2 rounds with the full transition and round rest", () => {
    const week = sessions();
    expect(week).toHaveLength(2);
    const a = week.find((s) => s.engineV2!.roles.includes("strengthA"))!;
    expect(a.engineV2!.upperContrast).toBeDefined();
    expect(a.engineV2!.strengthPairs?.map((p) => p.label)).not.toContain("B");
    expect(validateEngineSession(a, player, options)).toEqual([]);
    const linked = buildRunnerSteps(a.structuredSections!).find(
      (s) => s.kind === "linked" && s.rows[0].exercise.label === "B1",
    )!;
    expect(linked.kind).toBe("linked");
    expect(linked.rows.map((r) => r.exercise.exerciseId)).toEqual([
      "barbell_bench_press",
      "med_ball_throw",
    ]);
    expect(linked.rows.map((r) => r.exercise.sets)).toEqual(["2", "2"]);
    expect(linked.rows.map((r) => r.exercise.reps)).toEqual(["5", "3"]);
    expect(restSecondsAfter(linked.rows[0].block, linked.rows[0].exercise, true, true)).toBe(240);
    expect(restSecondsAfter(linked.rows[1].block, linked.rows[1].exercise, true, false)).toBe(180);
    expect(
      week.find((s) => s.engineV2!.roles.includes("strengthB"))!.engineV2!.upperContrast,
    ).toBeUndefined();
  });

  it.each([
    { age: 16 },
    { age: 17 },
    { supervisionLevel: "none" },
    { gymExperienceLevel: "beginner", strengthTrainingMonths: 3 },
    { equipment: ["barbell", "rack", "bench", "dumbbell"] },
    { equipment: GYM_DECLARED_EQUIPMENT.filter((id) => id !== "gym_throw_zone") },
    { seasonPhase: "return_injury" },
  ] as Partial<Profile>[])(
    "keeps ordinary strength when qualifications/stations are missing: %j",
    (patch) => {
      const p = { ...player, ...patch };
      const raw = buildStrength(p, "A", "development");
      const r = applyUpperContrast(raw, p, (id) => eligibleExercise(id, p, "upper_power"));
      expect(r.upperContrast).toBeUndefined();
      expect(r.exercises.some((e) => e.role === "upper_power")).toBe(false);
      expect(r.exercises.find((e) => e.role === "push")!.dose).toEqual(
        raw.exercises.find((e) => e.role === "push")!.dose,
      );
      expect(r.exercises.find((e) => e.role === "push")!.reason).not.toBe(
        raw.exercises.find((e) => e.role === "push")!.reason,
      );
    },
  );

  it.each(["M08", "M09", "M14"] as const)("does not stack the contrast with %s", (strength) => {
    const p = {
      ...player,
      trainingMethodPreferences: {
        ...player.trainingMethodPreferences,
        strength,
        coachedIsometricPrimer: true,
      },
    };
    const week = sessions(p);
    expect(week.every((s) => !s.engineV2!.upperContrast)).toBe(true);
  });

  it("does not attach to deload, maintenance, compact or an unrelated chosen throw", () => {
    const full = buildStrength(player, "A", "development");
    const recipes = [
      buildStrength(player, "A", "deload"),
      { ...full, variant: "compact" as const },
      { ...full, strengthFocus: { mode: "maintenance" } },
    ];
    for (const r of recipes) {
      expect(
        applyUpperContrast(r as typeof full, player, () => true).upperContrast,
      ).toBeUndefined();
    }
    const p = {
      ...player,
      trainingMethodPreferences: {
        ...player.trainingMethodPreferences,
        gymExercises: { upperPower: "medicine_ball_slam" },
      },
    };
    expect(applyUpperContrast(full, p, () => true).upperContrast).toBeUndefined();
  });

  it("removes the entire optional contrast before sacrificing ordinary work and restores recovery", () => {
    const full = pairRecipe();
    expect(full.upperContrast).toBeDefined();
    const fitted = fitStrengthToBudget(full, 55);
    expect(fitted.upperContrast).toBeUndefined();
    expect(fitted.exercises.some((e) => e.role === "upper_power")).toBe(false);
    const press = fitted.exercises.find((e) => e.role === "push")!;
    expect(press.dose.sets).toBeGreaterThanOrEqual(2);
    if (fitted.variant === "compact") expect(press.dose.restSeconds).toBeGreaterThanOrEqual(75);
    else expect(fitted.strengthPairs?.some((p) => p.label === "B")).toBe(true);
    for (const e of fitted.exercises.filter((e) => e.role !== "warmup"))
      expect(e.dose.sets).toBeGreaterThanOrEqual(2);
    const week = sessions(player, 55);
    expect(week.some((s) => !!s.engineV2!.upperContrast)).toBe(false);
  });

  it("drops a free-standing B throw before cutting ordinary sets", () => {
    const full = buildStrength(player, "B", "development");
    expect(full.exercises.some((e) => e.role === "upper_power")).toBe(true);
    const fitted = fitStrengthToBudget(full, full.minutes - 1);
    expect(fitted.exercises.some((e) => e.role === "upper_power")).toBe(false);
    for (const e of full.exercises.filter((e) =>
      ["hip_strength", "unilateral", "push", "pull", "trunk"].includes(e.role),
    ))
      expect(fitted.exercises.find((r) => r.role === e.role)?.dose).toEqual(e.dose);
  });

  it("does not duplicate the throw or overwrite ordinary doses when feedback re-finalizes a session", () => {
    const first = finalizeStrengthRecipe(
      buildStrength(player, "A", "development"),
      player,
      options.startDate,
      options,
      [],
      90,
    )!;
    const again = finalizeStrengthRecipe(first, player, options.startDate, options, [], 90)!;
    expect(again).toEqual(first);
    expect(again.exercises.filter((e) => e.role === "upper_power")).toHaveLength(1);
    const disabled = {
      ...player,
      trainingMethodPreferences: { ...player.trainingMethodPreferences, upperBodyContrast: false },
    };
    const ordinary = finalizeStrengthRecipe(again, disabled, options.startDate, options, [], 90)!;
    expect(ordinary.upperContrast).toBeUndefined();
    expect(ordinary.exercises.some((e) => e.role === "upper_power")).toBe(false);
    expect(ordinary.exercises.find((e) => e.role === "push")!.dose).toEqual(
      first.upperContrast!.originalPushDose,
    );
  });

  it("rejects shortened numeric or rendered recovery and lost qualifications", () => {
    const a = sessions().find((s) => s.engineV2!.roles.includes("strengthA"))!;
    const wrongDose = structuredClone(a);
    wrongDose.engineV2!.exercises.find((e) => e.role === "push")!.dose.restSeconds = 30;
    expect(
      validateEngineSession(wrongDose, player).some((i) => i.code === "UPPER_CONTRAST_DOSE"),
    ).toBe(true);
    const wrongView = structuredClone(a);
    wrongView
      .structuredSections!.flatMap((s) => s.blocks)
      .find((b) => b.exercises[0].label === "B1")!.exercises[0].restAfterExercise = "30 s";
    expect(
      validateEngineSession(wrongView, player).some((i) => i.code === "UPPER_CONTRAST_RENDER"),
    ).toBe(true);
    const wrongRounds = structuredClone(a);
    wrongRounds
      .structuredSections!.flatMap((s) => s.blocks)
      .find((b) => b.exercises[0].label === "B1")!
      .exercises.forEach((e) => {
        e.sets = "20";
      });
    expect(
      validateEngineSession(wrongRounds, player).some((i) => i.code === "UPPER_CONTRAST_RENDER"),
    ).toBe(true);
    expect(
      validateEngineSession(a, { ...player, supervisionLevel: "none" }).some(
        (i) => i.code === "UPPER_CONTRAST_DOSE",
      ),
    ).toBe(true);
    expect(a.engineV2!.upperContrast!.transitionSeconds).toBe(UPPER_CONTRAST.transition);
  });

  it("moves an existing finalized contrast through the real feedback placement path", () => {
    const opts = { ...options, minutesPerSession: 95 };
    const result = generateTrainingPlan(player, opts);
    const source = result.plan.find((s) => s.engineV2?.roles.includes("strengthA"))!;
    source.dbId = "source-upper-contrast";
    const removed = removeOwnSession(result.plan, source.dbId, player, opts)!;
    const moved = placeRecipeOnDate(removed, "2026-11-22", source.engineV2!, player, opts);
    expect("plan" in moved).toBe(true);
    if (!("plan" in moved)) return;
    expect(moved.session.engineV2!.exercises.filter((e) => e.role === "upper_power")).toHaveLength(
      1,
    );
    expect(validateTrainingPlan(moved.plan, player, opts)).toEqual([]);
  });
});
