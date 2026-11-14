import { describe, expect, it } from "vitest";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";
import { plusDays, weekday } from "./model";
import type { Profile, SessionDay } from "../types";

const base = {
  name: "Robust athlete",
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
} as unknown as Profile;
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const own = (d: SessionDay) => slots(d).filter((s) => s.engineV2);
const heavy = (d: SessionDay) => own(d).some((s) => s.engineV2!.highLower);
const rolesOf = (plan: SessionDay[]) =>
  new Set(plan.flatMap(own).flatMap((s) => s.engineV2!.roles));
const gen = (patch: Partial<Profile>, startDate = "2026-11-02", weeks = 4, extra = {}) =>
  generateTrainingPlan({ ...base, ...patch } as Profile, { startDate, weeks, ...extra });
const noConsecutiveHeavy = (plan: SessionDay[], before: SessionDay[] = []) => {
  const all = [...before, ...plan].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < all.length; i++)
    if (plusDays(all[i - 1].date, 1) === all[i].date)
      expect(heavy(all[i - 1]) && heavy(all[i])).toBe(false);
};

describe("calendar robustness", () => {
  it("keeps heavy leg days apart across Sunday→Monday and window boundaries, for several start days", () => {
    for (const start of ["2026-11-02", "2026-11-04", "2026-11-08", "2026-11-09"]) {
      const { plan } = gen({ goal: "strength" }, start, 4);
      noConsecutiveHeavy(plan);
      expect(
        validateTrainingPlan(plan, { ...base } as Profile, {
          startDate: start,
          minutesPerSession: 75,
        }),
      ).toEqual([]);
    }
  });

  it("respects the last day of the previous saved plan (a heavy Sunday blocks a heavy Monday)", () => {
    const first = gen({}, "2026-11-02", 1).plan;
    // pretend the previous plan ended on a heavy Sunday
    const sunday = first.find((d) => weekday(d.date) === 7)!;
    const heavySunday = first.find(heavy) ?? sunday;
    const preceding = [{ ...heavySunday, date: "2026-11-08" } as SessionDay];
    const next = gen({}, "2026-11-09", 1, { precedingDays: preceding }).plan;
    const monday = next.find((d) => d.date === "2026-11-09")!;
    expect(heavy(monday) && heavy(preceding[0])).toBe(false);
  });

  it.each([
    ["no match", []],
    ["one match", ["2026-11-07"]],
    ["two matches", ["2026-11-04", "2026-11-07"]],
    ["a changed match day", ["2026-11-08"]],
  ])("%s: nothing is placed in the match buffer and the whole plan validates", (_n, matchDates) => {
    const p = { ...base, matchDates } as Profile;
    const { plan } = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 });
    for (const m of matchDates)
      for (const offset of [-1, 0, 1]) {
        const d = plan.find((x) => x.date === plusDays(m, offset));
        if (d)
          expect(
            own(d).filter(
              (s) =>
                !["activation", "recovery"].some((r) => s.engineV2!.roles.includes(r as never)),
            ).length,
          ).toBe(0);
      }
    expect(
      validateTrainingPlan(plan, p, { startDate: "2026-11-02", minutesPerSession: 75 }),
    ).toEqual([]);
  });

  it("with only two available days, the main goal is kept and the missing targets stay visible", () => {
    for (const [goal, role] of [
      ["speed", "speed"],
      ["endurance", "endurance"],
      ["strength", "strengthA"],
    ] as const) {
      const r = gen(
        { goal, individualTrainingDays: [3, 6], doubleSessionsAllowed: "no" },
        "2026-11-02",
        2,
      );
      expect(rolesOf(r.plan).has(role)).toBe(true);
      expect(r.issues.some((i) => i.code === "UNMET_WEEKLY_TARGET")).toBe(true);
      noConsecutiveHeavy(r.plan);
    }
  });

  it("strength A, strength B and the sprint never share a day", () => {
    const { plan } = gen({ goal: "general" }, "2026-11-02", 4);
    for (const d of plan) {
      const roles = own(d).flatMap((s) => s.engineV2!.roles);
      expect(roles.filter((r) => r.startsWith("strength")).length).toBeLessThanOrEqual(1);
      expect(roles.includes("speed") && roles.some((r) => r.startsWith("strength"))).toBe(false);
    }
  });

  it("a short time budget gives real compact variants inside the budget, or reports what is missing", () => {
    const r = gen({ goal: "strength" }, "2026-11-02", 1, { minutesPerSession: 30 });
    for (const s of r.plan.flatMap(own)) expect(s.engineV2!.minutes).toBeLessThanOrEqual(30);
    expect(
      r.plan.flatMap(own).some((s) => s.engineV2!.variant === "compact") || r.issues.length > 0,
    ).toBe(true);
    expect(
      validateTrainingPlan(r.plan, { ...base } as Profile, {
        startDate: "2026-11-02",
        minutesPerSession: 30,
      }),
    ).toEqual([]);
  });

  it.each([13, 16, 17, 20])(
    "age %i produces a plan that passes the independent validator",
    (age) => {
      const level = age < 17 ? "beginner" : "intermediate";
      const p = {
        ...base,
        age,
        level,
        gymExperienceLevel: level,
        strengthTrainingMonths: age < 17 ? 0 : 12,
      } as Profile;
      const { plan } = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 2 });
      expect(
        validateTrainingPlan(plan, p, { startDate: "2026-11-02", minutesPerSession: 75 }),
      ).toEqual([]);
    },
  );

  it("limited equipment produces no exercise that needs the missing equipment", () => {
    const p = { ...base, equipment: [], hasGym: false } as Profile;
    const { plan, issues } = generateTrainingPlan(p, { startDate: "2026-11-02", weeks: 1 });
    expect(
      validateTrainingPlan(plan, p, { startDate: "2026-11-02", minutesPerSession: 75 }),
    ).toEqual([]);
    expect(Array.isArray(issues)).toBe(true);
  });
});
