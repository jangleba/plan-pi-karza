import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "../types";
import { generateTrainingPlan, validateTrainingPlan } from "./planner";

const athlete = (o: Record<string, unknown> = {}): Profile =>
  ({
    name: "block",
    age: 22,
    position: "midfielder",
    level: "advanced",
    goal: "endurance",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: null,
    matchDate: null,
    matchDates: [],
    weeklyMatches: false,
    equipment: ["barbell", "rack", "dumbbell", "machine", "band", "bench", "nordic_setup"],
    painInjury: false,
    doubleSessionsAllowed: "light_only",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-11-01",
    seasonPhase: "offseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "advanced",
    strengthTrainingMonths: 36,
    movementCompetence: "high",
    supervisionLevel: "full",
    ...o,
  }) as unknown as Profile;
const START = "2026-11-16";
const slots = (d: SessionDay) => [d, ...(d.secondSession ? [d.secondSession] : [])];
const runMinutes = (plan: SessionDay[], week: number) =>
  plan
    .slice(week * 7, week * 7 + 7)
    .flatMap(slots)
    .filter((s) => s.runningRecipe?.blocks[0]?.id === "easy")
    .map((s) => s.runningRecipe!.blocks[0].work.seconds / 60);

describe("week layout and progression in a 4-week block", () => {
  it("free days are used before a second session on a training day", () => {
    const p = athlete();
    const r = generateTrainingPlan(p, { startDate: START, weeks: 2, minutesPerSession: 60 });
    expect(r.plan.filter((d) => d.secondSession?.engineV2)).toEqual([]);
    expect(validateTrainingPlan(r.plan, p, { startDate: START, minutesPerSession: 60 })).toEqual(
      [],
    );
  });

  it("the calm run grows 10% per build week and returns to the base in the review week", () => {
    const r = generateTrainingPlan(athlete(), {
      startDate: START,
      weeks: 4,
      minutesPerSession: 60,
    });
    expect([0, 1, 2, 3].map((w) => [...new Set(runMinutes(r.plan, w))])).toEqual([
      [20],
      [22],
      [24],
      [20],
    ]);
  });

  it("the progression steps back instead of dropping the run when time is short", () => {
    const r = generateTrainingPlan(athlete(), {
      startDate: START,
      weeks: 3,
      minutesPerSession: 31,
    });
    for (const w of [0, 1, 2]) expect(runMinutes(r.plan, w).length).toBeGreaterThan(0);
    for (const s of r.plan.flatMap(slots)) expect(s.durationMin).toBeLessThanOrEqual(31);
  });

  it("a declared return or fatigue keeps the run short without progression", () => {
    const r = generateTrainingPlan(athlete({ secondaryLimiter: "fatigue" }), {
      startDate: START,
      weeks: 3,
      minutesPerSession: 60,
    });
    for (const w of [0, 1, 2])
      for (const m of runMinutes(r.plan, w)) expect(m).toBeLessThanOrEqual(15);
  });
});
