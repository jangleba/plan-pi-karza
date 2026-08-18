import { describe, expect, it } from "vitest";
import type { Profile } from "./types";
import { generateFootballSpeedSession } from "./footballSpeedSessionEngine";

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 4, 6],
  usualMatchDay: null,
  matchDate: null,
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
  ...overrides,
});

describe("football speed session engine", () => {
  it("keeps the RAMP, exactly three technique drills and sprint order", () => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "acceleration",
    });
    expect(result.status).toBe("generated");
    expect(result.exercises[0]?.distanceOrDuration).toBe("8–12 min");
    expect(result.exercises.filter((e) => e.role === "technical").map((e) => e.exerciseId)).toEqual(
      ["a_skip", "wall_triple_switch", "straight_leg_run_bound"],
    );
    expect(result.exercises.findIndex((e) => e.role === "primary")).toBeGreaterThan(
      result.exercises.findIndex((e) => e.role === "technical"),
    );
    expect(result.exercises.every((e) => e.equipment.replacementStatus !== "blocked")).toBe(true);
  });

  it.each([
    "acceleration",
    "maximum_velocity",
    "curved_sprinting",
    "deceleration_cod",
    "reactive_agility_reacceleration",
  ] as const)("is off-ball for %s", (family) => {
    const result = generateFootballSpeedSession({ profile: profile(), date: "2026-08-20", family });
    expect(
      result.exercises.every((exercise) => {
        const text = `${exercise.exerciseId} ${exercise.name} ${exercise.equipment.requiredEquipment.join(" ")}`;
        return !/\bball\b|piłka\b|pass|receiv|dribbl|feint|zwod|przyjęci|podani/i.test(text);
      }),
    ).toBe(true);
    expect(
      result.exercises.every((exercise) =>
        exercise.equipment.requiredEquipment.every((item) => item !== "med_ball"),
      ),
    ).toBe(true);
  });

  it.each([
    ["maximum_velocity", "flying_sprint"],
    ["curved_sprinting", "football_curved_sprint"],
    ["deceleration_cod", "progressive_deceleration_5_10_15"],
    ["reactive_agility_reacceleration", "app_audio_forward_left_right"],
  ] as const)("selects the approved primary for %s", (family, exerciseId) => {
    const result = generateFootballSpeedSession({ profile: profile(), date: "2026-08-20", family });
    expect(result.primaryExerciseId).toBe(exerciseId);
    expect(result.exercises.some((e) => e.exerciseId === exerciseId)).toBe(true);
  });

  it("protects MD, MD+1 and uses activation on MD-1", () => {
    const match = profile({ matchDate: "2026-08-20" });
    expect(
      generateFootballSpeedSession({ profile: match, date: "2026-08-20", family: "acceleration" })
        .status,
    ).toBe("blocked");
    expect(
      generateFootballSpeedSession({ profile: match, date: "2026-08-21", family: "acceleration" })
        .status,
    ).toBe("blocked");
    expect(
      generateFootballSpeedSession({
        profile: match,
        date: "2026-08-19",
        family: "maximum_velocity",
      }).status,
    ).toBe("activation");
  });

  it("reduces volume for low readiness without conditioning or RSA", () => {
    const result = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-20",
      family: "maximum_velocity",
      readiness: 4,
    });
    expect(result.exercises.filter((e) => e.role === "technical").length).toBe(3);
    expect(result.exercises.some((e) => e.exerciseId.includes("repeated"))).toBe(false);
    expect(result.excludedExerciseIds.length).toBeGreaterThan(0);
  });

  it("is deterministic and follows the pain stop path", () => {
    const input = { profile: profile(), date: "2026-08-20", family: "curved_sprinting" as const };
    expect(generateFootballSpeedSession(input)).toEqual(generateFootballSpeedSession(input));
    const blocked = generateFootballSpeedSession({ ...input, pain: ["hamstring"] });
    expect(blocked.status).toBe("blocked");
    expect(blocked.safetyNote).toMatch(/Ból/);
  });
});
