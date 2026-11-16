import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { gymAthlete } from "./testFixtures";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { dayDistance } from "./model";
import { advancedSessionsEligible } from "./advancedSessions";

const beginner: Profile = {
  ...gymAthlete,
  age: 16,
  goal: "strength",
  level: "beginner",
  gymExperienceLevel: "beginner",
  strengthTrainingMonths: 0,
  movementCompetence: "low",
  supervisionLevel: "some",
  equipment: ["dumbbell", "bench", "band", "rack", "barbell", "machine"],
};
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const strength = (plan: SessionDay[]) =>
  plan
    .flatMap(slots)
    .filter((s) => s.engineV2?.roles.some((r) => r === "strengthA" || r === "strengthB"));

describe("session quality at the final prescription boundary", () => {
  it.each([12, 13, 15, 15.9, NaN])("does not generate new under-16 plans (age %s)", (age) => {
    expect(() => generateTrainingPlan({ ...beginner, age }, { startDate: "2026-11-16" })).toThrow(
      /od 16 lat/,
    );
  });
  it("separates full-body A/B for a beginner even when neither is classified heavy", () => {
    const options = { startDate: "2026-11-16", weeks: 2 };
    const { plan } = generateTrainingPlan(beginner, options);
    const gym = strength(plan);
    expect(gym).toHaveLength(4);
    expect(gym.every((s) => !s.engineV2!.highLower)).toBe(true);
    for (let i = 1; i < gym.length; i++)
      expect(dayDistance(gym[i].date, gym[i - 1].date)).toBeGreaterThanOrEqual(2);
    expect(validateTrainingPlan(plan, beginner, options)).toEqual([]);
  });

  it("reports an unmet strength target instead of filling two consecutive available days", () => {
    const p = { ...beginner, individualTrainingDays: [1, 2] };
    const result = generateTrainingPlan(p, { startDate: "2026-11-16", weeks: 1 });
    expect(strength(result.plan)).toHaveLength(1);
    expect(
      result.issues.some(
        (i) =>
          i.code === "UNMET_WEEKLY_TARGET" &&
          (i.target === "strengthA" || i.target === "strengthB"),
      ),
    ).toBe(true);
  });

  it("validates non-heavy A/B spacing independently, including across a week boundary", () => {
    const options = { startDate: "2026-11-16", weeks: 1 };
    const result = generateTrainingPlan(beginner, options);
    const prior = { ...strength(result.plan)[0], date: "2026-11-15" };
    const first = strength(result.plan)[0];
    const issues = validateTrainingPlan([{ ...first, date: "2026-11-16" }], beginner, {
      ...options,
      precedingDays: [prior],
    });
    expect(issues.some((i) => i.code === "CONSECUTIVE_STRENGTH")).toBe(true);
    const rebuilt = generateTrainingPlan(beginner, { ...options, precedingDays: [prior] });
    expect(strength(rebuilt.plan).some((s) => s.date === "2026-11-16")).toBe(false);
  });

  it.each(["endurance", "mobility", "matchready"] as const)(
    "%s keeps the universal note sessions in the gym, valid and within the landing limit",
    (goal) => {
      const p = { ...gymAthlete, goal };
      expect(advancedSessionsEligible(p, "development")).toBe(true);
      const options = { startDate: "2026-11-16", weeks: 1 };
      const result = generateTrainingPlan(p, options);
      expect(strength(result.plan).length).toBeGreaterThan(0);
      for (const s of strength(result.plan)) {
        expect(s.engineV2!.advancedTemplate).toBeDefined();
        expect(s.engineV2!.plyometricContacts).toBeLessThanOrEqual(48);
      }
      expect(validateTrainingPlan(result.plan, p, options)).toEqual([]);
    },
  );
});
