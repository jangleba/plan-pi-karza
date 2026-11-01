import { describe, expect, it, vi } from "vitest";
import { generatePlan, PLAN_ENGINE_VERSION } from "./planEngine";
import { enforceFinalPlanPolicy } from "./finalPlanPolicy";
import { validatePersistedPlan } from "./persistedPlanValidation";
import type { Goal, Profile } from "./types";
import { isEnduranceSession } from "./sessionClassification";

const base: Profile = {
  name: "Planning regression", age: 22, position: "midfielder", level: "advanced", goal: "speed",
  secondaryLimiter: null, clubTrainingDays: [], individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [], usualMatchDay: null, matchDate: "2026-11-08", matchDates: ["2026-11-08"],
  equipment: [], painInjury: false, doubleSessionsAllowed: "yes_if_safe", guardianConsent: true,
  onboardingComplete: true, createdAt: "2026-11-01", seasonPhase: "inseason", seasonStage: null,
  seasonPhaseOverride: true, competitionLevel: "iv_liga", weeklyMatches: true,
  hasGym: true, hasPitch: true, hasSprintSpace: true,
};
const goals: Goal[] = ["speed", "strength", "endurance", "power", "agility", "general", "mobility", "return", "matchready"];

describe("generated plans satisfy the same final constraints used on re-opening", () => {
  it("preserves the endurance goal under explicit one-session-per-day availability", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      for (const available of [[1, 2, 3, 4, 5, 6], [1, 3, 5, 6]]) {
        const profile: Profile = { ...base, age: 20, level: "intermediate", goal: "endurance",
          movementCompetence: "medium", seasonPhase: "preseason", weeklyMatches: false,
          matchDate: null, matchDates: [], doubleSessionsAllowed: "no", individualTrainingDays: available };
        const plan = generatePlan(profile, new Date(2026, 6, 13), 7);
        expect(plan.every(day => !day.secondSession)).toBe(true);
        expect(plan.filter(isEnduranceSession).length, JSON.stringify(plan.map(day => ({ date: day.date, title: day.title, notes: day.weekMeta?.planningNotes })))).toBeGreaterThanOrEqual(available.length === 6 ? 2 : 1);
      }
    } finally { debug.mockRestore(); }
  });
  it("keeps youth/adult plans coherent across all goals and different club congestion", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      for (const goal of goals) for (const clubTrainingDays of [[], [2, 4], [1, 2, 4, 5]]) {
        for (const beginner of [true, false]) {
          const profile: Profile = { ...base, goal, clubTrainingDays,
            age: beginner ? 14 : 22, level: beginner ? "beginner" : "advanced",
            doubleSessionsAllowed: beginner ? "light_only" : "yes_if_safe" };
          const plan = enforceFinalPlanPolicy(generatePlan(profile, new Date(2026, 10, 2), 28), profile);
          const result = validatePersistedPlan(plan, profile, PLAN_ENGINE_VERSION);
          expect(result.issues, `${goal}/${clubTrainingDays.length}/${profile.age}`).toEqual([]);
        }
      }
    } finally { debug.mockRestore(); }
  }, 60_000);

  it("handles a short no-double calendar, no sprint space, and every start weekday", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      const cases: Array<{ profile: Profile; offset: number }> = [
        { profile: { ...base, matchDate: null, matchDates: [], weeklyMatches: false,
          seasonPhase: "preseason", individualTrainingDays: [1, 3, 5], unavailableDays: [2, 4, 6, 7],
          doubleSessionsAllowed: "no" }, offset: 0 },
        { profile: { ...base, hasSprintSpace: false, hasPitch: false }, offset: 0 },
        ...Array.from({ length: 7 }, (_, offset) => ({ profile: { ...base, goal: "general" as const,
          level: "intermediate" as const, clubTrainingDays: [2, 4] }, offset })),
      ];
      for (const { profile, offset } of cases) {
        const plan = enforceFinalPlanPolicy(generatePlan(profile, new Date(2026, 10, 2 + offset), 28), profile);
        expect(validatePersistedPlan(plan, profile, PLAN_ENGINE_VERSION).issues,
          `short-calendar/space/start-${offset}`).toEqual([]);
      }
    } finally { debug.mockRestore(); }
  }, 60_000);
});
