import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import { buildStrength, estimateSessionSeconds, fitStrengthToBudget } from "./exercises";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildRunnerSteps } from "../sessionRunner/steps";
import { restSecondsAfter } from "../sessionRunner/presentation";
import { validateEngineSession } from "./validation";

const player: Profile = {
  trainingMethodPreferences: { gymTemplate: "balanced" },
  name: "17-year-old intermediate",
  age: 17,
  position: "forward",
  level: "intermediate",
  goal: "power",
  secondaryLimiter: "cod",
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["dumbbell", "barbell", "rack", "bench", "band", "gym_jump_lane"],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "inseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "intermediate",
  strengthTrainingMonths: 12,
  movementCompetence: "medium",
  supervisionLevel: "none",
};

describe("complete A/B sessions with accessory pairs", () => {
  it.each(["A", "B"] as const)(
    "gives a prepared 17-year-old both upper directions and clear pairs in %s",
    (variant) => {
      const recipe = buildStrength(player, variant, "development");
      const roles = recipe.exercises.map((e) => e.role);
      for (const role of ["push", "pull", "trunk", "adductor", "power"] as const)
        expect(roles).toContain(role);
      expect(recipe.exercises.filter((e) => e.role !== "warmup").length).toBeGreaterThanOrEqual(8);
      expect(recipe.strengthPairs).toHaveLength(2);
      expect(recipe.organization).toBe("power_first");
      expect(recipe.roles).toEqual([variant === "A" ? "strengthA" : "strengthB"]);
      expect(recipe.exercises.filter((e) => e.role === "power")).toHaveLength(1);
      expect(recipe.minutes).toBe(Math.ceil(estimateSessionSeconds(recipe.exercises) / 60));
      expect(recipe.minutes).toBeLessThanOrEqual(75);
    },
  );
  it("retains foundational preparation when explicit gym preparation is missing", () => {
    const recipe = buildStrength(
      {
        ...player,
        level: "advanced",
        gymExperienceLevel: "none",
        strengthTrainingMonths: 0,
        movementCompetence: "low",
      },
      "A",
      "development",
    );
    expect(recipe.tier).toBe("foundation");
    expect(recipe.organization).not.toBe("contrast");
    // A beginner gets one moderate upper-body pair at the end, never extra lower-body volume.
    const upper = recipe.exercises.filter((e) => ["push", "pull"].includes(e.role));
    expect(upper).toHaveLength(2);
    for (const e of upper) expect(e.dose).toMatchObject({ sets: 2, reps: 10, rir: 3 });
    expect(recipe.exercises.slice(-2).every((e) => ["push", "pull"].includes(e.role))).toBe(true);
  });
  it.each(["A", "B"] as const)("does not fill deload %s with new accessories", (variant) => {
    const recipe = buildStrength(player, variant, "deload");
    expect(recipe.strengthPairs).toBeUndefined();
    expect(recipe.exercises.filter((e) => ["push", "pull"].includes(e.role))).toHaveLength(1);
  });
  it("keeps standalone rests after compact fitting drops pair members", () => {
    const full = buildStrength(player, "A", "development");
    const compact = fitStrengthToBudget(full, 30);
    expect(compact.variant).toBe("compact");
    expect(compact.strengthPairs).toBeUndefined();
    for (const e of compact.exercises.filter((e) =>
      ["push", "pull", "trunk", "adductor"].includes(e.role),
    ))
      expect(e.dose.restSeconds).toBeGreaterThanOrEqual(
        ["push", "pull"].includes(e.role) ? 75 : 60,
      );
  });
  it("renders actual B1/B2 and C1/C2 runner groups with numeric rest and no extra power session", () => {
    const options = { startDate: "2026-11-16", weeks: 1, minutesPerSession: 75 };
    const result = generateTrainingPlan(player, options);
    expect(validateTrainingPlan(result.plan, player, options)).toEqual([]);
    const own = result.plan
      .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
      .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
    expect(own).toHaveLength(2);
    for (const s of own) {
      const linked = buildRunnerSteps(s.structuredSections!).filter(
        (step) => step.kind === "linked",
      );
      expect(linked).toHaveLength(2);
      // Under 18 the upper-body pair closes the session, so C1/C2 comes before B1/B2.
      expect(linked.map((step) => step.rows.map((r) => r.exercise.label))).toEqual([
        ["C1", "C2"],
        ["B1", "B2"],
      ]);
      for (const step of linked) {
        expect(step.rows[0].block.executionProtocol).toBe("superset-rounds-v1");
        expect(restSecondsAfter(step.rows[0].block, step.rows[0].exercise, true, true)).toBe(30);
        // 180 s after each round of a pair (product decision, both pairs).
        expect(restSecondsAfter(step.rows[1].block, step.rows[1].exercise, true, false)).toBe(180);
      }
    }
  });
  it("rejects a pairing that steals a main lift or shortens round recovery", () => {
    const options = { startDate: "2026-11-16", weeks: 1 };
    const s = generateTrainingPlan(player, options).plan.find((d) =>
      d.engineV2?.roles.includes("strengthA"),
    )!;
    const bad = structuredClone(s);
    bad.engineV2!.strengthPairs![0].roundRestSeconds = 0;
    expect(validateEngineSession(bad, player).some((i) => i.code === "STRENGTH_PAIR_DOSE")).toBe(
      true,
    );
    const main = structuredClone(s);
    main.engineV2!.strengthPairs![0].roles = ["knee_strength", "power"];
    expect(validateEngineSession(main, player).some((i) => i.code === "STRENGTH_PAIR_DOSE")).toBe(
      true,
    );
  });
});
