import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { isDoubleHeavyDay, qualifiesForDoubleHeavy } from "./doubleHeavyPolicy";
import { secondSessionPolicyViolation } from "./finalPlanPolicy";
import type { Level, Profile } from "./types";

function profile(age: number, level: Level, extra: Partial<Profile> = {}): Profile {
  return {
    name: "Double heavy",
    age,
    healthPersonalizationEnabled: false,
    position: "midfielder",
    level,
    goal: "power",
    secondaryLimiter: null,
    clubTrainingDays: [1, 3, 5],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: 7,
    matchDate: "2026-11-22",
    equipment: ["dumbbells", "barbell"],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-09-01",
    seasonPhase: "inseason",
    seasonStage: "match_week",
    competitionLevel: "academy",
    weeklyMatches: true,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...extra,
  };
}

describe("kwalifikacja double-heavy", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  it("wymaga 17 lat i przygotowania — sam wiek nie wystarcza", () => {
    expect(qualifiesForDoubleHeavy(profile(16, "advanced"))).toBe(false);
    expect(qualifiesForDoubleHeavy(profile(17, "intermediate"))).toBe(true);
    expect(qualifiesForDoubleHeavy(profile(25, "beginner"))).toBe(false);
    expect(qualifiesForDoubleHeavy(profile(25, "advanced", { doubleSessionsAllowed: "no" }))).toBe(
      false,
    );
    expect(
      qualifiesForDoubleHeavy(profile(25, "advanced", { doubleSessionsAllowed: "light_only" })),
    ).toBe(false);
    expect(qualifiesForDoubleHeavy(profile(25, "advanced", { gymExperienceLevel: "none" }))).toBe(
      false,
    );
    expect(qualifiesForDoubleHeavy(profile(25, "advanced", { painInjury: true }))).toBe(false);
  });

  // Before the fix a 16-year-old intermediate got "Sprint: akceleracja" + "Siła ogólna".
  it.each([14, 15, 16])("plan %i-latka nie ma dwóch ciężkich jednostek jednego dnia", (age) => {
    for (const level of ["intermediate", "advanced"] as Level[]) {
      const plan = generatePlan(profile(age, level), new Date("2026-11-09T00:00:00"), 28);
      expect(plan.filter(isDoubleHeavyDay).map((day) => day.date)).toEqual([]);
    }
  });

  it("walidator zgłasza ciężką parę u niezakwalifikowanego zawodnika", () => {
    const plan = generatePlan(profile(20, "advanced"), new Date("2026-11-09T00:00:00"), 7);
    const heavy = plan.find((day) => day.intensity === "wysoka" && day.dayType === "training")!;
    const day = {
      ...heavy,
      secondSession: { ...heavy, title: "Druga ciężka", secondSession: null },
    };
    expect(secondSessionPolicyViolation(day, profile(16, "advanced"))).not.toBeNull();
  });
});
