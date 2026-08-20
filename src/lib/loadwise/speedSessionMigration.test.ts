import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "./types";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  generateFootballSpeedSession,
} from "./footballSpeedSessionEngine";
import { migratePersistedSpeedSessions } from "./speedSessionMigration";
import { validateFootballSpeedDate } from "./footballSpeedScheduling";

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
    expect(first.plan[0].generatorVersion).toBeDefined();
    const second = migratePersistedSpeedSessions(first.plan, profile(), "2026-08-19", {});
    expect(second.migratedDates).toEqual([]);
    expect(second.plan).toBe(first.plan);
  });

  it("does not touch history, commitments, or user-owned sessions", () => {
    const completed = legacySpeed({ dbId: "done" });
    const club = legacySpeed({ dayType: "club", isClubSession: true });
    const externalSession = legacySpeed({ isOwnSession: false });
    const result = migratePersistedSpeedSessions(
      [completed, club, externalSession],
      profile(),
      "2026-08-19",
      {
        done: { completed: true, rpe: null, notes: "history" },
      },
    );
    expect(result.migratedDates).toEqual([]);
    expect(result.plan).toEqual([completed, club, externalSession]);
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
    ).toEqual(new Set(["a_switch_progression", "a_accent", "alternate_leg_bounds"]));
    expect(all.filter((exercise) => exercise.role === "technical").length).toBe(3);
  });

  it("moves an invalid speed candidate to the nearest future valid date", () => {
    const first = legacySpeed({ date: "2026-08-20", sessionId: "first" });
    const second = legacySpeed({ date: "2026-08-21", sessionId: "second" });
    const rest = (date: string): SessionDay =>
      legacySpeed({
        date,
        title: "Dzień wolny",
        dayType: "rest",
        sessionType: "Dzień wolny",
        isOwnSession: false,
        isRecoveryOrPrehab: true,
        sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
      });
    const result = migratePersistedSpeedSessions(
      [first, second, rest("2026-08-22"), rest("2026-08-23")],
      profile(),
      "2026-08-19",
      {},
    );
    expect(result.plan.map((day) => day.date)).toEqual(["2026-08-20", "2026-08-22", "2026-08-23"]);
    expect(result.plan.map((day) => [day.date, day.sessionId])).toEqual([
      ["2026-08-20", "first"],
      ["2026-08-22", "second"],
      ["2026-08-23", undefined],
    ]);
  });

  it("omits a blocked candidate when the horizon has no valid future date", () => {
    const result = migratePersistedSpeedSessions(
      [legacySpeed({ date: "2026-08-20" }), legacySpeed({ date: "2026-08-21" })],
      profile(),
      "2026-08-19",
      {},
    );
    expect(result.plan.map((day) => day.date)).toEqual(["2026-08-20"]);
  });

  it("evaluates ISO dates at calendar boundaries without timezone drift", () => {
    expect(validateFootballSpeedDate("2026-08-20", { matchDate: "2026-08-21" }).issues).toContain(
      "match_minus_one",
    );
    expect(
      validateFootballSpeedDate("2026-08-20", {
        speedDates: ["2026-08-19", "2026-08-21"],
      }).valid,
    ).toBe(false);
  });
});
