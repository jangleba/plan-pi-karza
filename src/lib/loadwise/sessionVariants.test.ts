import { describe, it, expect } from "vitest";
import type { Profile } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  createGymSessionVariant,
  createEnduranceSessionVariant,
  createSpeedSessionVariant,
  createAccelerationDecelerationSession,
  createMaxVelocityCODSession,
  createSpeedMicrodoseSession,
  createLowImpactEnduranceSession,
  createShortAerobicBlock,
  normalizeGeneratedSession,
  validateWorkoutForAthleteProfile,
  type SessionGenContext,
} from "./sessionVariants";

function makeProfile(over: Partial<Profile>): Profile {
  return {
    name: "Test",
    age: 25,
    position: "midfielder",
    level: "advanced",
    goal: "general",
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 3, 6],
    usualMatchDay: 7,
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-06-01",
    seasonPhase: "inseason",
    seasonStage: null,
    competitionLevel: "academy",
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    ...over,
  };
}

const adult = (over: Partial<Profile> = {}, week = { readiness: 8 }) =>
  buildAthleteTrainingProfile(
    makeProfile({
      age: 25,
      level: "advanced",
      gymExperienceLevel: "advanced",
      movementCompetence: "high",
      supervisionLevel: "full",
      ...over,
    }),
    {},
    week,
  );

const youth = (over: Partial<Profile> = {}) =>
  buildAthleteTrainingProfile(
    makeProfile({ age: 14, level: "beginner", ...over }),
    {},
    { readiness: 8 },
  );

const HEAVY_RE = /martw|deadlift|ciężk|heavy|1\s?rm|3\s?rm|5\s?rm|clean|snatch|depth jump/i;

describe("gym session variant", () => {
  it("tworzy gym_strength, nie recovery_prehab", () => {
    const s = createGymSessionVariant({}, adult());
    expect(s.category).toBe("gym_strength");
    expect(s.countsAsStrength).toBe(true);
    expect(s.countsAsEndurance).toBe(false);
    expect(s.countsAsSpeed).toBe(false);
  });

  it("14yo beginner dostaje strength foundation, nie heavy strength", () => {
    const s = createGymSessionVariant({}, youth());
    expect(s.category).toBe("gym_strength");
    expect(s.subcategory).toBe("strength_foundation");
    expect(s.countsAsStrength).toBe(true);
    expect(s.tags).not.toContain("heavy_legs");
  });

  it("14yo beginner nie dostaje martwego ciągu, heavy squat ani 1RM", () => {
    const s = createGymSessionVariant({}, youth());
    for (const b of s.blocks) {
      expect(HEAVY_RE.test(b.name)).toBe(false);
      expect(HEAVY_RE.test(b.detail ?? "")).toBe(false);
    }
  });

  it("MD-1 nie tworzy heavy lower", () => {
    const ctx: SessionGenContext = { toMatch: 1 };
    const s = createGymSessionVariant(ctx, adult());
    expect(s.subcategory).not.toBe("lower_strength");
    expect(s.tags).not.toContain("heavy_legs");
    expect(s.loadLevel).not.toBe("high");
    const report = validateWorkoutForAthleteProfile(s, adult(), ctx);
    expect(report.ok).toBe(true);
  });
});

describe("endurance session variant", () => {
  it("tworzy endurance_conditioning", () => {
    const s = createEnduranceSessionVariant({}, adult());
    expect(s).not.toBeNull();
    expect(s!.category).toBe("endurance_conditioning");
    expect(s!.countsAsEndurance).toBe(true);
  });

  it("nie tworzy sesji dla dnia klubowego", () => {
    const s = createEnduranceSessionVariant({ hasClub: true }, adult());
    expect(s).toBeNull();
  });

  it("niski readiness zmienia endurance na low-impact", () => {
    const s = createEnduranceSessionVariant({ readiness: 3 }, adult());
    expect(s).not.toBeNull();
    expect(s!.subcategory).toBe("low_impact_conditioning");
    expect(s!.loadLevel).toBe("low");
  });

  it("MD-1 nie tworzy heavy running", () => {
    const ctx: SessionGenContext = { toMatch: 1 };
    const s = createEnduranceSessionVariant(ctx, adult());
    expect(s).not.toBeNull();
    expect(["high", "very_high"]).not.toContain(s!.loadLevel);
    expect(validateWorkoutForAthleteProfile(s!, adult(), ctx).ok).toBe(true);
  });

  it("14yo cel wydolność dostaje easy/low-impact/short aerobic", () => {
    const s = createEnduranceSessionVariant({}, youth({ goal: "endurance" }));
    expect(s).not.toBeNull();
    expect(
      ["easy_aerobic", "easy_run", "short_aerobic_block", "low_impact_conditioning", "recovery_run"],
    ).toContain(s!.subcategory);
    expect(s!.loadLevel).toBe("low");
  });

  it("helpery low-impact i short aerobic zwracają endurance_conditioning", () => {
    expect(createLowImpactEnduranceSession({}, adult()).category).toBe("endurance_conditioning");
    expect(createShortAerobicBlock({}, adult()).category).toBe("endurance_conditioning");
  });
});

describe("speed session variant", () => {
  it("tworzy speed_sprint", () => {
    const s = createSpeedSessionVariant({}, adult());
    expect(s.category).toBe("speed_sprint");
    expect(s.countsAsSpeed).toBe(true);
  });

  it("dwie sesje speed przy celu szybkość mają różne subcategory", () => {
    const a = adult({ goal: "speed" });
    const s1 = createSpeedSessionVariant({ speedSlot: 1 }, a);
    const s2 = createSpeedSessionVariant({ speedSlot: 2 }, a);
    expect(s1.subcategory).not.toBe(s2.subcategory);
  });

  it("pierwsza speed to acceleration_deceleration", () => {
    const s = createSpeedSessionVariant({ speedSlot: 1 }, adult({ goal: "speed" }));
    expect(s.subcategory).toBe("acceleration_deceleration");
  });

  it("druga speed to max_velocity_cod", () => {
    const s = createSpeedSessionVariant({ speedSlot: 2 }, adult({ goal: "speed" }));
    expect(s.subcategory).toBe("max_velocity_cod");
  });

  it("niski readiness zmienia speed na microdose", () => {
    const s = createSpeedSessionVariant({ readiness: 3, speedSlot: 2 }, adult());
    expect(s.subcategory).toBe("speed_microdose");
  });

  it("MD-1 nie tworzy full max velocity", () => {
    const ctx: SessionGenContext = { toMatch: 1, speedSlot: 2 };
    const s = createMaxVelocityCODSession(ctx, adult());
    expect(s.subcategory).not.toBe("max_velocity_cod");
    expect(s.tags).not.toContain("max_velocity");
    expect(validateWorkoutForAthleteProfile(s, adult(), ctx).ok).toBe(true);
  });

  it("14yo beginner dostaje speed techniczny, nie dużą objętość max velocity", () => {
    const s = createSpeedSessionVariant({ speedSlot: 2 }, youth());
    expect(s.subcategory).toBe("technical_speed");
    expect(s.tags).not.toContain("max_velocity");
    expect(s.loadLevel).toBe("low");
  });

  it("helpery accel/decel i microdose zwracają speed_sprint", () => {
    expect(createAccelerationDecelerationSession({}, adult()).category).toBe("speed_sprint");
    expect(createSpeedMicrodoseSession({}, adult()).category).toBe("speed_sprint");
  });
});

describe("normalizeGeneratedSession", () => {
  it("wylicza countsAs* i tagi na podstawie kategorii", () => {
    const s = normalizeGeneratedSession({
      category: "gym_strength",
      subcategory: "lower_strength",
      intensity: "wysoka",
    });
    expect(s.countsAsStrength).toBe(true);
    expect(s.tags).toContain("gym_strength");
    expect(s.tags).toContain("heavy_legs");
  });
});
