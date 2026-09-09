import { describe, expect, it } from "vitest";
import { buildProposals } from "./modifications";
import type { Profile, Readiness, SessionDay } from "./types";

const DATE = "2026-09-14";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "player",
    name: "Zawodnik",
    age: 20,
    position: "midfielder",
    level: "advanced",
    goal: "speed",
    sessionsPerWeek: 4,
    painInjury: false,
    ...overrides,
  } as Profile;
}

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    date: DATE,
    sleep: 8,
    energy: 8,
    fatigue: 3,
    soreness: 2,
    jointPain: 0,
    painLocation: null,
    stress: 3,
    motivation: 8,
    overall: 8,
    ...overrides,
  };
}

function day(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: DATE,
    dayName: "Poniedziałek",
    dayType: "training",
    title: "Lekki dzień",
    goalLabel: "",
    intensity: "niska",
    durationMin: 30,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Technika",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...overrides,
  };
}

describe("buildProposals — pełny sygnał bólu z check-inu", () => {
  it("nie proponuje dodawania ani zamiany przy bólu 7–10/10", () => {
    const result = buildProposals(
      [day()],
      profile(),
      DATE,
      readiness({ jointPain: 8, painLocation: "knee", overall: 5 }),
      "add",
      "boisko",
      30,
    );

    expect(result.canModify).toBe(false);
    expect(result.safe).toHaveLength(0);
    expect(result.message).toMatch(/7–10\/10|wstrzymaj/i);
  });

  it("przy dyskomforcie 4–6/10 pozostawia wyłącznie lekkie warianty", () => {
    const result = buildProposals(
      [day()],
      profile(),
      DATE,
      readiness({ jointPain: 5, painLocation: "ankle", overall: 6 }),
      "swap",
      "dom",
      30,
    );

    expect(result.canModify).toBe(true);
    expect(result.safe.length).toBeGreaterThan(0);
    expect(result.safe.every((item) => ["recovery", "mobility"].includes(item.category))).toBe(true);
    expect(result.safe.some((item) => item.category === "sprint" || item.category === "strength")).toBe(false);
  });

  it("bez bólu nie tworzy fałszywej blokady celu szybkościowego", () => {
    const result = buildProposals(
      [day()],
      profile(),
      DATE,
      readiness(),
      "add",
      "boisko",
      30,
    );

    expect(result.canModify).toBe(true);
    expect(result.safe.some((item) => item.category === "sprint")).toBe(true);
  });

  it("uwzględnia również aktywną flagę bólu zapisaną w profilu", () => {
    const result = buildProposals(
      [day()],
      profile({ painInjury: true, painLocations: ["back"] }),
      DATE,
      readiness(),
      "add",
      "silownia",
      45,
    );

    expect(result.safe.every((item) => ["recovery", "mobility"].includes(item.category))).toBe(true);
  });
});
