import { describe, expect, it, vi } from "vitest";
import { generatePlan } from "../planEngine";
import { trainingMethodEligibility } from "./eligibility";
import { createMethodSession } from "./planner";
import type { Profile, SessionDay } from "../types";

const profile = {
  name: "M31",
  age: 24,
  healthPersonalizationEnabled: false,
  position: "midfielder",
  level: "advanced",
  goal: "endurance",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  unavailableDays: [],
  usualMatchDay: null,
  matchDate: null,
  equipment: ["dumbbells", "barbell"],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-09-01",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "pro",
  weeklyMatches: true,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
} as unknown as Profile;

describe("M31: odmowa bez trenera jest poprawna, potwierdzenie przechodzi", () => {
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  const plan = generatePlan(profile, new Date("2026-11-09T00:00:00"), 14);
  const session = plan.find(
    (d) => d.dayType === "training" && d.classification?.category === "endurance_conditioning",
  ) as SessionDay;

  it("bez potwierdzenia trenera metoda jest odrzucona z powodem o trenerze", () => {
    const reasons = trainingMethodEligibility("M31", profile, session, {}).reasons;
    expect(reasons.join(" ")).toMatch(/trener/);
  });

  it("z potwierdzeniem trenera i przestrzenia 400 m metoda jest dozwolona", () => {
    const gate = trainingMethodEligibility("M31", profile, session, {
      coachPresent: true,
      spaceLengthM: 400,
    });
    expect(gate).toEqual({ allowed: true, reasons: [] });
    expect(() =>
      createMethodSession(
        session,
        profile,
        "M31",
        { coachPresent: true, spaceLengthM: 400 },
        "athlete",
      ),
    ).not.toThrow();
  });
});
