import { describe,expect,it } from "vitest";
import { TRAINING_METHODS } from "./catalogue";
import { METHOD_RESEARCH_SOURCES } from "./research";
import { decodeStrengthExperience,encodeStrengthExperience } from "../strengthExperience";
import type { Profile } from "../types";
export const methodProfile = {
  name: "Test",
  age: 25,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [1, 3],
  individualTrainingDays: [2, 4, 5],
  usualMatchDay: 7,
  matchDate: "2026-11-08",
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-03",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  equipment: [],
  homeEquipment: [],
  painInjury: false,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
} as Profile;
describe("method library and routing", () => {
  it("contains 44 distinct referenced methods; support and planning are not pretend workouts", () => {
    expect(TRAINING_METHODS).toHaveLength(44);
    expect(new Set(TRAINING_METHODS.map((m) => m.id)).size).toBe(44);
    for (const m of TRAINING_METHODS) {
      expect(m.sources.length).toBeGreaterThan(0);
      expect(m.sources.every((url) => METHOD_RESEARCH_SOURCES.some((s) => s.url === url))).toBe(
        true,
      );
    }
    expect(TRAINING_METHODS.filter((m) => m.role !== "workout").length).toBe(12);
  });
  it("round trips optional method preferences without growing onboarding or accepting unknown IDs", () => {
    const p = {
      ...methodProfile,
      trainingMethodPreferences: {
        strength: "M08" as const,
        periodization: "undulating" as const,
        spaceLengthM: 60,
        declaredEquipment: ["flywheel"],
      },
    };
    const raw = encodeStrengthExperience(p)!;
    expect(raw.length).toBeLessThan(1000);
    expect(decodeStrengthExperience(raw).trainingMethodPreferences).toEqual(
      p.trainingMethodPreferences,
    );
  });
});
