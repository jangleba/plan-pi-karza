import { describe, expect, it } from "vitest";
import { generatePlan, applyReadiness } from "../planEngine";
import type { Profile, Readiness } from "../types";
import { canGuideRecoverySession } from "./protocols";
import { assertFinalPlanMeetsMinimums, requirementsFor } from "../weekFinalization";

const profile: Profile = {
  name: "Test blokady",
  age: 22,
  position: "midfielder",
  level: "intermediate",
  goal: "general",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-10-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  seasonPhaseOverride: true,
};

describe("prowadzenie regeneracji respektuje końcową decyzję silnika", () => {
  it("zmiana prowadzenia regeneracji nie przestawia dawnego slotu planowania w gęstym tygodniu", () => {
    const denseProfile: Profile = {
      ...profile,
      goal: "strength",
      clubTrainingDays: [1, 2, 4, 5],
      doubleSessionsAllowed: "yes_if_safe",
      seasonPhase: "inseason",
      matchDate: "2026-10-18",
      weeklyMatches: true,
      gymExperienceLevel: "intermediate",
      movementCompetence: "medium",
      supervisionLevel: "some",
      strengthTrainingMonths: 24,
      fieldMasKmh: 15,
      fieldMasTestedAt: "2026-10-10",
      runningProgressionLevel: 0,
    };
    const week = generatePlan(denseProfile, new Date("2026-10-12T12:00:00"), 28).slice(14, 21);
    const report = assertFinalPlanMeetsMinimums(
      week,
      requirementsFor(week, denseProfile),
      denseProfile,
    );
    expect(report.noBackToBackSpeedDays).toBe(true);
    expect(report.unresolvedIssues).toEqual([]);
  });
  it.each([
    { name: "aktywny ból", profile: { ...profile, painInjury: true } },
    { name: "powrót po urazie", profile: { ...profile, seasonPhase: "return_injury" as const } },
  ])("nie dodaje ruchu dla trybu: $name", ({ profile: currentProfile }) => {
    const days = generatePlan(currentProfile, new Date("2026-10-12T12:00:00"), 7);
    expect(days).toHaveLength(7);
    for (const day of days) {
      expect(day.durationMin).toBe(0);
      expect(Object.values(day.sections).flat()).toHaveLength(0);
      expect(canGuideRecoverySession(day)).toBe(false);
    }
  });

  it("nie otwiera regeneracji po ostrożnościowym wstrzymaniu sprintu w check-inie", () => {
    const plan = generatePlan(profile, new Date("2026-10-12T12:00:00"), 7);
    const sprint = plan.find((day) => day.speedGeneratorVersion);
    expect(sprint).toBeDefined();
    const readiness: Readiness = {
      date: sprint!.date,
      sleep: 8,
      energy: 8,
      fatigue: 3,
      soreness: 3,
      jointPain: 5,
      painLocation: "hamstring",
      stress: 3,
      motivation: 8,
      overall: 8,
    };
    const adjusted = applyReadiness(sprint!, readiness, profile).session;
    expect(adjusted.durationMin).toBe(0);
    expect(Object.values(adjusted.sections).flat()).toHaveLength(0);
    expect(canGuideRecoverySession(adjusted)).toBe(false);
  });
});
