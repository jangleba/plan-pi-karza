import { describe, expect, it, vi } from "vitest";
import { generatePlan } from "../planEngine";
import { createMethodSession } from "./planner";
import type { Profile, SessionDay } from "../types";

const profile = {
  name: "Metody",
  age: 22,
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
} as unknown as Profile;

describe("metody wytrzymałości: unikalne ID ćwiczeń", () => {
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  const plan = generatePlan(profile, new Date("2026-11-09T00:00:00"), 14);
  const sessions = plan
    .flatMap((day) => [day, day.secondSession])
    .filter((s): s is SessionDay => !!s && s.dayType === "training");

  // Reproduced on c9e54e5: M27–M29 failed with "Dwa ćwiczenia mają ten sam zapis serii"
  // because the cooldown and the warm-up reused the same ex-N identifiers.
  it.each(["M27", "M28", "M29"] as const)("%s zapisuje się bez duplikatu ID", (id) => {
    for (const session of sessions) {
      let next: SessionDay;
      try {
        next = createMethodSession(session, profile, id, {}, "athlete");
      } catch (error) {
        const message = (error as Error).message;
        expect(message, session.title).not.toMatch(/ten sam zapis serii/);
        continue;
      }
      const ids = next.structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises.map((e) => e.id)));
      expect(new Set(ids).size, session.title).toBe(ids.length);
    }
  });
});
