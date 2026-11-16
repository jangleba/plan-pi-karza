import { describe, expect, it } from "vitest";
import type { Profile } from "../types";
import { buildStrength, estimateSessionSeconds } from "./exercises";
import {
  applyStrengthFocus,
  chooseStrengthFocus,
  maximalStrengthEligible,
  strengthWeekContext,
  type StrengthWeekContext,
} from "./strengthPolicy";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { buildReadiness } from "../readinessModel";
import type { SessionCompletion, SessionDay } from "../types";

const p: Profile = {
  name: "Strength policy",
  age: 20,
  position: "forward",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["barbell", "rack", "dumbbell", "bench", "band", "machine", "gym_jump_lane"],
  painInjury: false,
  doubleSessionsAllowed: "no",
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
const ctx: StrengthWeekContext = {
  date: "2026-11-16",
  asOfDate: "2026-11-16",
  matches7d: 0,
  nearestMatchDays: 99,
  hardDays7d: 0,
  unknownPastExternalLoad: false,
  repeatedHard: false,
  strengthGapDays: null,
};

describe("SP1 strength emphasis", () => {
  it("reads the real readiness payload only when personalisation is enabled", () => {
    const r = buildReadiness(ctx.date, { sleep: 2, fatigue: 8, jointPain: 0 });
    const opts = { startDate: ctx.date, readiness: { [ctx.date]: r } };
    const low = strengthWeekContext({ ...p, healthPersonalizationEnabled: true }, ctx.date, opts);
    expect(low.readinessScore).toBeLessThanOrEqual(4);
    expect(chooseStrengthFocus(p, "development", low).mode).toBe("deload");
    expect(
      strengthWeekContext({ ...p, healthPersonalizationEnabled: false }, ctx.date, opts)
        .readinessScore,
    ).toBeUndefined();
    expect(
      strengthWeekContext(p, ctx.date, { startDate: ctx.date }).readinessScore,
    ).toBeUndefined();
  });
  it("counts actual completed check-in preferences once, ignoring unfinished or future sessions", () => {
    const completions: Record<string, SessionCompletion> = {};
    for (const [i, date] of ["2026-11-14", "2026-11-11", "2026-11-08", "2026-11-17"].entries()) {
      completions[`s${i}`] = {
        completed: i !== 2,
        status: i === 2 ? "started" : "completed",
        rpe: 6,
        notes: "",
        executionSnapshot: {
          dbId: `s${i}`,
          date,
          engineV2: { roles: ["strengthA"] },
          strengthCheckIn: {
            version: 1,
            loadPreference: "lighter",
            date,
            recordedAt: `${date}T10:00:00Z`,
          },
        } as SessionDay,
      };
    }
    completions.duplicate = completions.s0;
    const result = strengthWeekContext(p, ctx.date, { startDate: ctx.date, completions });
    expect(result.lighterRequests).toBe(2);
    expect(chooseStrengthFocus(p, "development", result)).toMatchObject({ mode: "maintenance" });
    completions.s1.executionSnapshot!.strengthCheckIn!.date = "2026-11-10";
    expect(
      strengthWeekContext(p, ctx.date, { startDate: ctx.date, completions }).lighterRequests,
    ).toBe(1);
  });
  it("needs declared strength priority as well as preparation", () => {
    expect(chooseStrengthFocus(p, "development", ctx).mode).toBe("max_strength");
    expect(chooseStrengthFocus({ ...p, goal: "power" }, "development", ctx).mode).toBe(
      "power_support",
    );
    expect(
      chooseStrengthFocus({ ...p, goal: "speed", secondaryLimiter: "strength" }, "development", ctx)
        .mode,
    ).toBe("max_strength");
  });
  it.each([13, 14, 15])(
    "does not unlock heavy low-repetition emphasis by age/football level at %i",
    (age) => {
      expect(maximalStrengthEligible({ ...p, age })).toBe(false);
      expect(chooseStrengthFocus({ ...p, age }, "development", ctx).mode).toBe("strength_build");
    },
  );
  it("allows a prepared supervised 17-year-old without pretending the adult evidence is a birthday rule", () => {
    const youth = {
      ...p,
      age: 17,
      gymExperienceLevel: "intermediate" as const,
      strengthTrainingMonths: 12,
    };
    expect(maximalStrengthEligible(youth)).toBe(true);
    expect(maximalStrengthEligible({ ...youth, supervisionLevel: "none" })).toBe(false);
    expect(maximalStrengthEligible({ ...youth, movementCompetence: "medium" })).toBe(false);
    const s = applyStrengthFocus(
      buildStrength(youth, "A", "development"),
      youth,
      ctx.date,
      { startDate: ctx.date },
      [],
    );
    expect(s.exercises.find((e) => e.role === "knee_strength")?.dose).toMatchObject({
      sets: 3,
      reps: 5,
      rir: 3,
      restSeconds: 180,
    });
  });
  it("keeps unknown gym preparation foundational", () => {
    const provisional = {
      ...p,
      gymExperienceLevel: undefined,
      strengthTrainingMonths: undefined,
      movementCompetence: undefined,
      supervisionLevel: undefined,
    };
    expect(chooseStrengthFocus(provisional, "development", ctx).mode).toBe("foundation");
    expect(maximalStrengthEligible({ ...p, hasGym: false })).toBe(false);
  });
  it.each([
    [{ matches7d: 2 }, "maintenance"],
    [{ nearestMatchDays: 2 }, "maintenance"],
    [{ hardDays7d: 4 }, "maintenance"],
    [{ repeatedHard: true }, "deload"],
    [{ readinessScore: 4 }, "deload"],
    [{ strengthGapDays: 14 }, "reentry"],
  ] as const)("uses week context %j as %s", (patch, mode) =>
    expect(chooseStrengthFocus(p, "development", { ...ctx, ...patch }).mode).toBe(mode),
  );
  it("does not lighten MD-3 solely because of the date", () =>
    expect(chooseStrengthFocus(p, "development", { ...ctx, nearestMatchDays: 3 }).mode).toBe(
      "max_strength",
    ));
  it.each(["goalkeeper", "defender", "midfielder", "forward"] as const)(
    "does not invent strength need from position %s",
    (position) =>
      expect(chooseStrengthFocus({ ...p, position }, "development", ctx).mode).toBe("max_strength"),
  );
  it.each(["A", "B"] as const)("keeps %s, one main loaded lift and honest duration", (variant) => {
    const input = buildStrength(p, variant, "development"),
      before = JSON.stringify(input);
    const s = applyStrengthFocus(input, p, ctx.date, { startDate: ctx.date }, []);
    expect(JSON.stringify(input)).toBe(before);
    expect(
      s.exercises.find((e) => e.role === (variant === "A" ? "knee_strength" : "hip_strength"))
        ?.dose,
    ).toMatchObject({ sets: 3, reps: 4, rir: 2, restSeconds: 180 });
    expect(s.roles).toEqual([variant === "A" ? "strengthA" : "strengthB"]);
    expect(s.minutes).toBe(Math.ceil(estimateSessionSeconds(s.exercises) / 60));
  });
  it("keeps a reviewed contrast's round counts and rests", () => {
    const profile = { ...p, trainingMethodPreferences: { strength: "M09" as const } };
    const input = buildStrength(profile, "B", "development");
    const s = applyStrengthFocus(input, profile, ctx.date, { startDate: ctx.date }, []);
    expect(s.exercises.map((e) => e.dose)).toEqual(input.exercises.map((e) => e.dose));
  });
  it("plans both A/B with a recorded focus and retains all independent validation", () => {
    const opts = { startDate: ctx.date, weeks: 1 };
    const result = generateTrainingPlan(p, opts);
    expect(validateTrainingPlan(result.plan, p, opts)).toEqual([]);
    const sessions = result.plan
      .flatMap((d) => [d, ...(d.secondSession ? [d.secondSession] : [])])
      .filter((s) => s.engineV2?.roles.some((r) => r.startsWith("strength")));
    expect(sessions).toHaveLength(2);
    for (const s of sessions) {
      expect(s.engineV2!.strengthFocus?.mode).toBe("max_strength");
      expect(
        s
          .structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
          .some((e) => e.strengthFocus?.mode === "max_strength"),
      ).toBe(true);
    }
  });
  it("sees an absent scheduled club report as unknown rather than zero", () => {
    const c = strengthWeekContext({ ...p, clubTrainingDays: [7] }, ctx.date, {
      startDate: ctx.date,
    });
    expect(c.unknownPastExternalLoad).toBe(true);
  });
});
