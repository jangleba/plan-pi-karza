import { describe, expect, it } from "vitest";
import { buildRunning } from "./exercises";
import type { Profile } from "../types";

const athlete: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "elite",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "none",
  strengthTrainingMonths: 0,
  movementCompetence: "high",
  supervisionLevel: "some",
  trainingMethodPreferences: { spaceLengthM: 40 },
};

describe("sport-specific speed preparation", () => {
  it("gives a prepared footballer a suitable acceleration dose despite no gym experience", () => {
    const s = buildRunning(athlete, "speed", "development")!;
    expect(s.tier).toBe("foundation");
    expect(s.exercises.find((e) => e.role === "speed")!.exerciseId).toBe(
      "free_acceleration_sprint",
    );
    expect(s.exercises.find((e) => e.role === "speed")!.dose).toMatchObject({
      sets: 6,
      distanceM: 20,
      restSeconds: 90,
    });
    expect(s.sprintMetres).toBe(180); // includes 40 m of build-ups and 20 m of braking approaches
  });
  it("does not turn advanced gym experience into advanced sport preparation", () => {
    const s = buildRunning(
      {
        ...athlete,
        level: "beginner",
        hasGym: true,
        gymExperienceLevel: "advanced",
        strengthTrainingMonths: 48,
        trainingMethodPreferences: { spaceLengthM: 60 },
      },
      "speed",
      "development",
    )!;
    expect(s.tier).toBe("performance");
    expect(s.exercises.find((e) => e.role === "speed")!.exerciseId).toBe(
      "free_acceleration_sprint",
    );
    expect(s.exercises.find((e) => e.role === "speed")!.dose).toMatchObject({
      sets: 4,
      distanceM: 10,
    });
  });
  it("uses explicit space and the onboarding declaration of thirty metres plus a braking area", () => {
    for (const spaceLengthM of [20, 25, 39])
      expect(
        buildRunning(
          { ...athlete, trainingMethodPreferences: { spaceLengthM } },
          "speed",
          "development",
        )?.exercises.find((e) => e.role === "speed")!.dose.distanceM,
      ).toBe(10);
    expect(
      buildRunning(
        { ...athlete, trainingMethodPreferences: {} },
        "speed",
        "development",
      )?.exercises.find((e) => e.role === "speed")!.dose.distanceM,
    ).toBe(20);
    for (const spaceLengthM of [0, 10, 19, NaN, Infinity])
      expect(
        buildRunning(
          { ...athlete, trainingMethodPreferences: { spaceLengthM } },
          "speed",
          "development",
        ),
      ).toBeNull();
  });
  it("allows a coached adult high-competence footballer a separate flying dose", () => {
    const p = { ...athlete, trainingMethodPreferences: { spaceLengthM: 50 } };
    const s = buildRunning(p, "speed", "development")!;
    expect(s.tier).toBe("foundation");
    expect(s.exercises.find((e) => e.role === "speed")!.exerciseId).toBe("flying_sprint");
    expect(s.exercises.find((e) => e.role === "speed")!.dose).toMatchObject({
      sets: 4,
      distanceM: 10,
      runInM: 20,
      restSeconds: 150,
    });
    expect(s.sprintMetres).toBe(180); // includes 40 m of build-ups and 20 m of braking approaches
    for (const patch of [
      { age: 17 },
      { level: "intermediate" as const },
      { movementCompetence: "medium" as const },
      { supervisionLevel: "none" as const },
      { trainingMethodPreferences: { spaceLengthM: 49 } },
      { trainingMethodPreferences: {} },
    ])
      expect(
        buildRunning({ ...p, ...patch }, "speed", "development")?.exercises.find(
          (e) => e.role === "speed",
        )!.exerciseId,
      ).toBe("free_acceleration_sprint");
  });
  it("reduces volume for youth, fatigue, return goals, transition and deload", () => {
    const normal = buildRunning(athlete, "speed", "development")!;
    expect(
      buildRunning({ ...athlete, age: 14 }, "speed", "development")?.exercises.find(
        (e) => e.role === "speed",
      )!.dose,
    ).toMatchObject({ sets: 4, distanceM: 10 });
    for (const patch of [
      { secondaryLimiter: "fatigue" as const },
      { seasonPhase: "transition" as const },
      { goal: "return" as const },
    ]) {
      const s = buildRunning(
        { ...athlete, ...patch, trainingMethodPreferences: { spaceLengthM: 60 } },
        "speed",
        "development",
      )!;
      expect(s.exercises.find((e) => e.role === "speed")!.exerciseId).toBe(
        "free_acceleration_sprint",
      );
      expect(s.sprintMetres).toBeLessThan(normal.sprintMetres);
    }
    expect(buildRunning(athlete, "speed", "deload")!.sprintMetres).toBeLessThan(
      normal.sprintMetres,
    );
  });
});
