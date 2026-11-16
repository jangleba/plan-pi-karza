import { describe, expect, it } from "vitest";
import type { CycleRecommendationKind } from "../cyclePolicy";
import type { CycleReview } from "../cycleReview";
import type { CycleStartRecord, Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { gymAthlete } from "./testFixtures";

/** Every cycle recommendation has a measurable effect on the recipes — or is explicitly neutral. */
const record = (kind: CycleRecommendationKind): CycleStartRecord => ({
  kind,
  youth: false,
  reviewedCycleId: null,
  review: { recommendation: kind } as CycleReview,
});
const start = { startDate: "2026-11-02", weeks: 4, minutesPerSession: 75 };
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const strength = (plan: SessionDay[]) =>
  plan.flatMap(slots).filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
/** The session's first main lower lift (note sessions open B with a step-up or a hinge). */
const primary = (s: SessionDay) =>
  s.engineV2!.exercises.find((e) =>
    ["knee_strength", "hip_strength", "unilateral_strength"].includes(e.role),
  )!;
const gen = (profile: Profile, kind?: CycleRecommendationKind) =>
  generateTrainingPlan(profile, { ...start, cycleStart: kind ? record(kind) : undefined }).plan;
const strengthGoal = { ...gymAthlete, goal: "strength" } as Profile;
/** The usual A/B layout (balanced), where "vary" swaps equivalent exercises for the whole cycle. */
const balanced = {
  ...strengthGoal,
  trainingMethodPreferences: { gymTemplate: "balanced" },
} as Profile;
const mainSets = (s: SessionDay) =>
  s.engineV2!.exercises.filter((e) => e.role !== "warmup").reduce((n, e) => n + e.dose.sets, 0);

describe("cycle recommendation effects", () => {
  it("progress changes nothing by itself: no dose rises with the weeks, plan equals no recommendation", () => {
    const none = strength(gen(strengthGoal)).map((s) => [
      s.date,
      primary(s).exerciseId,
      primary(s).dose,
    ]);
    const progress = strength(gen(strengthGoal, "progress")).map((s) => [
      s.date,
      primary(s).exerciseId,
      primary(s).dose,
    ]);
    expect(progress).toEqual(none);
    // A later week of the same note is not heavier than the first: time alone never adds sets or load.
    const byWeek = strength(gen(strengthGoal, "progress")).filter((s) =>
      s.engineV2!.roles.includes("strengthA"),
    );
    const sameNote = byWeek.filter(
      (s) => s.engineV2!.advancedTemplate === byWeek[0].engineV2!.advancedTemplate,
    );
    expect(sameNote.length).toBeGreaterThan(1);
    expect(primary(sameNote[sameNote.length - 1]).dose).toEqual(primary(sameNote[0]).dose);
  });

  it.each(["maintain", "consistency"] as const)(
    "%s holds the main strength dose: at most 2 sets, RIR >= 3, no strength emphasis",
    (kind) => {
      const progress = strength(gen(strengthGoal, "progress"));
      const held = strength(gen(strengthGoal, kind));
      expect(progress.some((s) => primary(s).dose.sets >= 3)).toBe(true);
      for (const s of held) {
        expect(primary(s).dose.sets).toBeLessThanOrEqual(2);
        expect(primary(s).dose.rir ?? 3).toBeGreaterThanOrEqual(3);
        expect(s.engineV2!.strengthFocus?.mode).toBe("maintenance");
        expect(s.engineV2!.strengthFocus?.mode).not.toBe("max_strength");
      }
    },
  );

  it("vary starts the note cycle with the other note of each A/B pair", () => {
    const progress = strength(gen(strengthGoal, "progress"));
    const varied = strength(gen(strengthGoal, "vary"));
    expect(varied.length).toBe(progress.length);
    for (const [i, s] of varied.entries()) {
      expect(s.engineV2!.advancedTemplate).toBeDefined();
      expect(s.engineV2!.advancedTemplate).not.toBe(progress[i].engineV2!.advancedTemplate);
    }
    expect(varied.every((s) => s.engineV2!.exerciseRotation === 1)).toBe(true);
  });

  it("vary swaps equivalent strength exercises for the whole cycle, without a bigger dose", () => {
    const progress = strength(gen(balanced, "progress"));
    const varied = strength(gen(balanced, "vary"));
    expect(varied.length).toBe(progress.length);
    const changed = varied.filter(
      (s, i) => primary(s).exerciseId !== primary(progress[i]).exerciseId,
    );
    expect(changed.length).toBeGreaterThan(0);
    for (const [i, s] of varied.entries()) {
      expect(primary(s).dose.sets).toBeLessThanOrEqual(primary(progress[i]).dose.sets);
      expect(primary(s).dose.reps ?? 0).toBeLessThanOrEqual(primary(progress[i]).dose.reps ?? 99);
    }
    // Stable within the cycle: the same session type uses the same exercise every week.
    for (const role of ["strengthA", "strengthB"]) {
      const ids = new Set(
        varied
          .filter((s) => s.engineV2!.roles.includes(role as never))
          .map((s) => primary(s).exerciseId),
      );
      expect(ids.size).toBe(1);
    }
    expect(varied.every((s) => s.engineV2!.exerciseRotation === 1)).toBe(true);
  });

  it("deload, health and transition give a lighter first week, then the usual dose", () => {
    const usual = strength(gen(strengthGoal, "progress"));
    for (const kind of ["deload", "health", "transition"] as const) {
      const plan = strength(gen(strengthGoal, kind));
      expect(plan[0].engineV2!.phase).toBe("deload");
      expect(mainSets(plan[0])).toBeLessThan(mainSets(usual[0]));
      const late = plan[plan.length - 1].engineV2!;
      expect(late.phase).not.toBe("deload");
    }
  });

  it.each([
    "progress",
    "vary",
    "maintain",
    "consistency",
    "deload",
    "health",
    "transition",
  ] as const)("%s still produces a plan the validator accepts", (kind) => {
    for (const goal of ["strength", "speed", "endurance", "power", "general"] as const) {
      const p = { ...gymAthlete, goal } as Profile;
      const plan = gen(p, kind);
      expect(validateTrainingPlan(plan, p, start)).toEqual([]);
    }
  });
});
