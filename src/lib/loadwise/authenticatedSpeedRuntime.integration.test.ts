import { describe, expect, it } from "vitest";
import { generatePlan } from "./planEngine";
import type { Profile, SessionDay } from "./types";

const profile: Profile = {
  name: "Existing player",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: "2026-08-22",
  equipment: [],
  unavailableEquipmentIds: ["sled", "box"],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-01-01",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "pro",
  weeklyMatches: true,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
};

function allText(session: SessionDay): string {
  return JSON.stringify(session).toLowerCase();
}

describe("authenticated onboarding edit speed runtime", () => {
  it("regenerates the MD-3 session through the canonical path", () => {
    const persistedBeforeEdit = generatePlan(profile, new Date("2026-08-17"), 7);
    const regeneratedAfterEdit = generatePlan(
      { ...profile, name: "Edited player" },
      new Date("2026-08-17"),
      7,
    );
    const md3 = regeneratedAfterEdit.find((day) => day.date === "2026-08-19");

    expect(persistedBeforeEdit.find((day) => day.date === "2026-08-19")).toBeDefined();
    expect(md3).toBeDefined();
    expect(md3?.secondSession).toBeNull();
    expect(md3?.sessionType).toBe("Szybkość");
    expect(md3?.structuredSections?.flatMap((section) => section.blocks)).toHaveLength(17);
    expect(md3?.sections.main.filter((item) => item.exerciseId).length).toBe(7);
    expect(md3?.sections.main.some((item) => item.speedRole === "resisted")).toBe(true);
    expect(md3?.sections.cooldown).toHaveLength(1);
    expect(md3 ? allText(md3) : "").not.toMatch(/piłk|aktywacja z piłką|sprinty z piłką/);
    expect(md3 ? allText(md3) : "").not.toMatch(
      /zwody i zmiana kierunku|przyjęcie–zwrot–przyspieszenie/,
    );
  });
});
