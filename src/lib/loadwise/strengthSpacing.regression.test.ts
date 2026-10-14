import { describe, expect, it } from "vitest";
import { generatePlan, weekRanges } from "./planEngine";
import { isMainGymSession } from "./sessionClassification";
import type { Profile, SessionDay } from "./types";
import { PLAN_ENGINE_VERSION } from "./planVersion";

export function strengthProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Test",
    age: 21,
    position: "midfielder",
    level: "intermediate",
    goal: "strength",
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    usualMatchDay: null,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-01-01",
    seasonPhase: "preseason",
    seasonStage: null,
    competitionLevel: "iv_liga",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...overrides,
  };
}

function gymSlots(day: SessionDay) {
  return [day, day.secondSession].filter((s) => s && isMainGymSession(s));
}

describe("strength spacing — actual final generator output", () => {
  for (const level of ["beginner", "intermediate", "advanced", "elite"] as const) {
    for (const start of ["2026-10-05", "2026-10-10"]) {
      it(`${level}, start ${start}: both slots respect calendar gaps, including Sunday–Monday`, () => {
        const plan = generatePlan(strengthProfile({ level }), new Date(`${start}T00:00:00`), 28);
        for (let i = 0; i < plan.length; i++) {
          expect(plan[i].generatorVersion).toBe(PLAN_ENGINE_VERSION);
          if (plan[i].secondSession)
            expect(plan[i].secondSession!.generatorVersion).toBe(PLAN_ENGINE_VERSION);
          expect(gymSlots(plan[i]).length, `${plan[i].date}: duplicate gym`).toBeLessThanOrEqual(1);
          if (i > 0) {
            expect(
              gymSlots(plan[i]).length && gymSlots(plan[i - 1]).length,
              `${plan[i - 1].date} / ${plan[i].date}: adjacent gym`,
            ).toBeFalsy();
          }
        }
        for (const range of weekRanges(new Date(`${start}T00:00:00`), plan.length)) {
          if (range.end - range.start !== 7) continue;
          expect(plan.slice(range.start, range.end).flatMap(gymSlots)).toHaveLength(2);
        }
      });
    }
  }

  it("dense club calendar still separates gym in second slots", () => {
    const plan = generatePlan(
      strengthProfile({
        clubTrainingDays: [1, 3, 5],
        seasonPhase: "inseason",
        usualMatchDay: 7,
        weeklyMatches: true,
      }),
      new Date("2026-10-05T00:00:00"),
      28,
    );
    for (let i = 1; i < plan.length; i++) {
      expect(
        gymSlots(plan[i]).length && gymSlots(plan[i - 1]).length,
        `${plan[i - 1].date} / ${plan[i].date}`,
      ).toBeFalsy();
    }
  });
});
