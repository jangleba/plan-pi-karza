import { describe, expect, it, vi } from "vitest";
import { OWN_EQUIPMENT_OPTIONS } from "./equipmentOptions";
import { resolveEquipmentId } from "./exerciseLibrary";
import { footballConditions } from "./individualFootballSessionEngine";
import { generatePlan } from "./planEngine";
import type { Profile, SessionDay } from "./types";

const athlete = {
  name: "Sprzęt",
  age: 20,
  healthPersonalizationEnabled: false,
  position: "midfielder",
  level: "intermediate",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [2, 4],
  individualTrainingDays: [1, 3, 5],
  unavailableDays: [],
  usualMatchDay: 6,
  matchDate: "2026-11-14",
  matchDates: ["2026-11-14"],
  equipment: [],
  painInjury: false,
  painLocations: [],
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "inseason",
  seasonStage: "season_mid",
  competitionLevel: "iv_liga",
  weeklyMatches: true,
  hasGym: false,
  hasPitch: false,
  hasSprintSpace: true,
  gymExperienceLevel: "intermediate",
  strengthTrainingMonths: 18,
  movementCompetence: "medium",
  supervisionLevel: "none",
} as Profile;

const exercises = (plan: SessionDay[]) =>
  plan.flatMap((day) =>
    [day, day.secondSession].flatMap((session) =>
      session
        ? Object.values(session.sections)
            .flat()
            .map((row) => row.name)
        : [],
    ),
  );

describe("onboarding equipment checklist", () => {
  it("maps every strength option to an equipment id the exercise library understands", () => {
    for (const label of OWN_EQUIPMENT_OPTIONS.filter((item) => !/bramk/i.test(item)))
      expect(resolveEquipmentId(label), label).toBeDefined();
  });

  it("lets a goal on a safe straight unlock finishing, but not in a small room", () => {
    expect(footballConditions({ ...athlete, equipment: ["Bramka lub mini-bramka"] }).goal).toBe(
      true,
    );
    expect(
      footballConditions({
        ...athlete,
        hasSprintSpace: false,
        equipment: ["Bramka lub mini-bramka"],
      }).goal,
    ).toBe(false);
  });

  it("changes a home strength plan when dumbbells are ticked", () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const start = new Date(2026, 10, 9);
    const without = exercises(generatePlan(athlete, start, 28));
    const withDumbbells = exercises(generatePlan({ ...athlete, equipment: ["Hantle"] }, start, 28));
    expect(withDumbbells).not.toEqual(without);
  });
});
