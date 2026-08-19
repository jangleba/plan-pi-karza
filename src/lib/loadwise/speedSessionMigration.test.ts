import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "./types";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  generateFootballSpeedSession,
} from "./footballSpeedSessionEngine";
import { migratePersistedSpeedSessions } from "./speedSessionMigration";

const profile = (): Profile =>
  ({
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
    unavailableEquipmentIds: [],
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
  }) as Profile;

const legacySpeed = (overrides: Partial<SessionDay> = {}): SessionDay =>
  ({
    date: "2026-08-21",
    dayName: "2026-08-21",
    dayType: "training",
    title: "Sprint i przyspieszenie",
    goalLabel: "Szybkość",
    intensity: "wysoka",
    durationMin: 40,
    isOwnSession: true,
    isClubSession: false,
    reason: "legacy",
    safetyNote: null,
    whyToday: "legacy",
    sessionType: "Szybkość",
    goalOfSession: "Szybkość",
    riskManaged: "legacy",
    avoidToday: "legacy",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: [],
      main: [{ name: "Sprint", prescription: "4 × 20 m" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
    ...overrides,
  }) as SessionDay;

describe("persisted football speed migration", () => {
  it("migrates once and preserves the session identity", () => {
    const original = legacySpeed({ dbId: "session-1" });
    const first = migratePersistedSpeedSessions([original], profile(), "2026-08-19", {});
    expect(first.migratedDates).toEqual(["2026-08-21"]);
    expect(first.plan[0].dbId).toBe("session-1");
    expect(first.plan[0].speedGeneratorVersion).toBe(FOOTBALL_SPEED_GENERATOR_VERSION);
    const second = migratePersistedSpeedSessions(first.plan, profile(), "2026-08-19", {});
    expect(second.migratedDates).toEqual([]);
    expect(second.plan).toBe(first.plan);
  });

  it("does not touch history, commitments, or user-owned sessions", () => {
    const completed = legacySpeed({ dbId: "done" });
    const club = legacySpeed({ dayType: "club", isClubSession: true });
    const user = legacySpeed({ isOwnSession: false });
    const result = migratePersistedSpeedSessions([completed, club, user], profile(), "2026-08-19", {
      done: { completed: true, rpe: null, notes: "history" },
    });
    expect(result.migratedDates).toEqual([]);
    expect(result.plan).toEqual([completed, club, user]);
  });

  it("produces no-ball speed work with exactly three selected drills", () => {
    const generated = generateFootballSpeedSession({
      profile: profile(),
      date: "2026-08-21",
      family: "acceleration",
    });
    const all = generated.exercises;
    expect(all.some((exercise) => /piłk|ball/i.test(exercise.name))).toBe(false);
    expect(
      new Set(all.filter((exercise) => exercise.role === "technical").map((e) => e.exerciseId)),
    ).toEqual(new Set(["a_skip", "c_skip", "b_skip", "d_skip"]));
    expect(all.filter((exercise) => exercise.role === "technical").length).toBe(8);
    expect(
      new Set(
        all
          .filter((exercise) => exercise.role === "technical" && exercise.exerciseId !== "a_skip")
          .map((exercise) => exercise.exerciseId),
      ),
    ).toEqual(new Set(["c_skip", "b_skip", "d_skip"]));
  });
});
