import { describe, expect, it } from "vitest";
import { redactStateForBootCache } from "./bootCache";
import type { LoadwiseState, Profile } from "./types";

const profile = {
  onboardingComplete: true,
  fuelAllergyStatus: "has_allergies",
  foodAllergies: ["orzechy"],
  foodIntolerances: ["laktoza"],
  painInjury: true,
  painLocations: ["knee"],
  injuryHistory: ["ankle"],
} as Profile;

describe("boot cache privacy", () => {
  it("removes direct health data and free-form notes", () => {
    const state = {
      profile,
      readiness: { "2026-09-13": { date: "2026-09-13", sleep: 4 } },
      completions: { s1: { completed: true, rpe: 8, notes: "ból kolana" } },
      history: [{ key: "s1", date: "2026-09-13", title: "Sprint", category: "speed", durationMin: 30, rpe: 8, notes: "ból" }],
      runningActivities: {},
      equipmentNotice: "test",
      plan: [],
      planGeneratedFor: null,
      modifications: {},
      transitions: {},
      exerciseReplacements: {},
    } as unknown as LoadwiseState;
    const cached = redactStateForBootCache(state);
    expect(cached.readiness).toEqual({});
    expect(cached.profile?.foodAllergies).toEqual([]);
    expect(cached.profile?.painLocations).toEqual([]);
    expect(cached.profile?.painInjury).toBe(false);
    expect(cached.completions.s1.notes).toBe("");
    expect(cached.history[0].notes).toBe("");
    expect(cached.equipmentNotice).toBeNull();
  });
});
