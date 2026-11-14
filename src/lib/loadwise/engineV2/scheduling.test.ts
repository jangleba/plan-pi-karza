import { describe, expect, it } from "vitest";
import { assessPlacement, hasKnownHighLowerLoad, solveWeeklySchedule } from "./scheduling";
import type { EngineSession } from "./model";
import type { Profile, SessionDay } from "../types";

const athlete: Profile = {
  name: "Scheduling test",
  age: 27,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-11-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "iv_liga",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
};
function day(date: string, patch: Partial<SessionDay> = {}): SessionDay {
  return {
    date,
    dayName: "Test",
    dayType: "rest",
    title: "Wolne",
    goalLabel: "",
    intensity: "niska",
    durationMin: 0,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Wolne",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...patch,
  };
}
function recipe(
  role: EngineSession["roles"][number],
  patch: Partial<EngineSession> = {},
): EngineSession {
  return {
    roles: [role],
    tier: "performance",
    highLower: role !== "endurance",
    exercises: [],
    missing: [],
    minutes: role === "endurance" ? 20 : 40,
    sprintMetres: role === "speed" ? 120 : 0,
    phase: "development",
    ...patch,
  };
}
function assess(patch: Partial<Parameters<typeof assessPlacement>[0]> = {}) {
  return assessPlacement({
    days: [day("2026-11-05")],
    dayIndex: 0,
    recipe: recipe("strengthA"),
    profile: athlete,
    options: { startDate: "2026-11-02" },
    matchDates: new Set(),
    combinedMinutes: (a, b) => a.minutes + b.minutes - 10,
    ...patch,
  });
}

describe("exact weekly target allocation", () => {
  it("backtracks past a tempting first placement to cover all four tasks", () => {
    const tasks = ["strengthA", "strengthB", "speed", "endurance"].map((id, i) => ({
      id,
      recipe: id,
      priority: 4 - i,
    }));
    const result = solveWeeklySchedule<Record<string, number>, string>({
      initialState: {},
      tasks,
      dayCount: 4,
      isCovered: (state, id) => state[id] !== undefined,
      tryPlace: (state, id, index) => {
        const specific: Record<string, number> = { strengthB: 0, speed: 1, endurance: 2 };
        if (Object.values(state).includes(index) || (id in specific && specific[id] !== index))
          return { blocked: { code: "CONFLICT", message: "Termin zajęty lub niedostępny." } };
        return {
          state: { ...state, [id]: index },
          penalty: id === "strengthA" && index === 3 ? 10000 : 0,
        };
      },
    });
    expect(result.covered).toEqual(["strengthA", "strengthB", "speed", "endurance"]);
    expect(result.placements).toEqual({ strengthA: 3, strengthB: 0, speed: 1, endurance: 2 });
    expect(result.unmet).toEqual([]);
    expect(result.objective.penalty).toBe(10000);
  });

  it("chooses the higher priority target only when equal target counts are achievable", () => {
    const result = solveWeeklySchedule<Record<string, number>, string>({
      initialState: {},
      tasks: [
        { id: "strengthA", recipe: "strengthA", priority: 30 },
        { id: "endurance", recipe: "endurance", priority: 10 },
      ],
      dayCount: 1,
      isCovered: (state, id) => state[id] !== undefined,
      tryPlace: (state, id, index) =>
        Object.keys(state).length
          ? { blocked: { code: "MAX_DAILY_SESSIONS", message: "Brak miejsca." } }
          : { state: { ...state, [id]: index } },
    });
    expect(result.covered).toEqual(["strengthA"]);
    expect(result.unmet).toEqual(["endurance"]);
    expect(result.rejections.endurance).toEqual([
      { code: "MAX_DAILY_SESSIONS", message: "Brak miejsca.", dayIndex: 0 },
    ]);
  });

  it("keeps pre-existing targets and never calls placement for them", () => {
    const initial = Object.freeze({ strengthA: 0 });
    const placed: string[] = [];
    const result = solveWeeklySchedule<Record<string, number>, string>({
      initialState: initial,
      tasks: [
        { id: "strengthA", recipe: "strengthA", priority: 30 },
        { id: "speed", recipe: "speed", priority: 25 },
      ],
      dayCount: 2,
      isCovered: (state, id) => state[id] !== undefined,
      tryPlace: (state, id, index) => {
        placed.push(id);
        return Object.values(state).includes(index)
          ? { blocked: { code: "OCCUPIED", message: "Zajęte." } }
          : { state: { ...state, [id]: index } };
      },
    });
    expect(initial).toEqual({ strengthA: 0 });
    expect(placed).not.toContain("strengthA");
    expect(result.state).toEqual({ strengthA: 0, speed: 1 });
  });

  it("has a small explicit worst-case bound and does not invent coverage", () => {
    const result = solveWeeklySchedule({
      initialState: {},
      tasks: ["A", "B", "S", "E"].map((id) => ({ id, recipe: id, priority: 1 })),
      dayCount: 7,
      isCovered: () => false,
      tryPlace: (state) => ({ state }),
    });
    expect(result.exploredNodes).toBe(4681);
    expect(result.covered).toEqual([]);
    expect(result.unmet).toHaveLength(4);
  });

  it("rejects unbounded or ambiguous task definitions", () => {
    const input = {
      initialState: {},
      dayCount: 7,
      isCovered: () => false,
      tryPlace: () => ({ blocked: { code: "NONE", message: "Brak." } }),
    };
    expect(() =>
      solveWeeklySchedule({
        ...input,
        tasks: Array.from({ length: 5 }, (_, i) => ({ id: String(i), recipe: i, priority: 1 })),
      }),
    ).toThrow();
    expect(() =>
      solveWeeklySchedule({
        ...input,
        tasks: [
          { id: "A", recipe: 0, priority: 1 },
          { id: "A", recipe: 1, priority: 1 },
        ],
      }),
    ).toThrow();
  });
});

describe("shared calendar and load constraints", () => {
  it("rejects unknown time instead of treating NaN as an unlimited budget", () => {
    expect(assess({ options: { startDate: "2026-11-02", minutesPerSession: NaN } })).toMatchObject({
      allowed: false,
      code: "INVALID_BUDGET",
    });
  });
  it("preserves MD-3 eligibility instead of treating it like MD-1", () => {
    expect(assess({ matchDates: new Set(["2026-11-08"]) })).toMatchObject({
      allowed: true,
      mode: "new",
    });
  });

  it("checks both sides of multiple actual fixtures without adding phantom games", () => {
    const matches = new Set(["2026-11-04", "2026-11-08"]);
    for (const date of [
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
    ])
      expect(assess({ days: [day(date)], matchDates: matches })).toMatchObject({
        allowed: false,
        code: "MATCH_BUFFER",
      });
    expect(assess({ days: [day("2026-11-02")], matchDates: matches })).toMatchObject({
      allowed: true,
    });
    expect(assess({ days: [day("2026-11-06")], matchDates: matches })).toMatchObject({
      allowed: true,
    });
    expect(assess({ days: [day("2026-11-08")], matchDates: new Set() })).toMatchObject({
      allowed: true,
    });
  });

  it("sees declared club strength immediately outside the window but does not guess unknown club load", () => {
    const profile = { ...athlete, clubTrainingDays: [2], clubStrengthDays: [2] };
    expect(assess({ days: [day("2026-11-04")], profile })).toMatchObject({
      allowed: false,
      code: "ADJACENT_HIGH_LOWER",
    });
    expect(
      assess({ days: [day("2026-11-04")], profile: { ...profile, clubStrengthDays: [] } }),
    ).toMatchObject({ allowed: true });
    expect(
      hasKnownHighLowerLoad(day("2026-11-03", { dayType: "club", intensity: "wysoka" }), {
        ...profile,
        clubStrengthDays: [],
      }),
    ).toBe(false);
  });

  it("keeps cross-week high lower-body loads separated", () => {
    const sunday = day("2026-11-01", { dayType: "training", engineV2: recipe("strengthA") });
    expect(assess({ days: [day("2026-11-02")], precedingDays: [sunday] })).toMatchObject({
      allowed: false,
      code: "ADJACENT_HIGH_LOWER",
    });
    expect(
      assess({ days: [day("2026-11-02")], precedingDays: [sunday], recipe: recipe("endurance") }),
    ).toMatchObject({ allowed: true });
  });

  it("allows a real light companion when light-only doubles were selected", () => {
    const club = day("2026-11-05", { dayType: "club" });
    const profile = { ...athlete, doubleSessionsAllowed: "light_only" as const };
    expect(assess({ days: [club], profile, recipe: recipe("endurance") })).toMatchObject({
      allowed: true,
      mode: "club_second",
      slot: 1,
    });
    expect(assess({ days: [club], profile })).toMatchObject({
      allowed: false,
      code: "LIGHT_SECOND_ONLY",
    });
    expect(
      assess({
        days: [club],
        profile,
        recipe: recipe("strengthA", { tier: "foundation", highLower: false }),
      }),
    ).toMatchObject({ allowed: false, code: "LIGHT_SECOND_ONLY" });
  });

  it("never creates a third session on a club day", () => {
    const current = day("2026-11-05", {
      dayType: "club",
      secondSession: day("2026-11-05", { dayType: "training", engineV2: recipe("strengthA") }),
    });
    expect(assess({ days: [current], recipe: recipe("endurance") })).toMatchObject({
      allowed: false,
      code: "MAX_DAILY_SESSIONS",
    });
    expect(assess({ days: [current], recipe: recipe("speed") })).toMatchObject({
      allowed: false,
      code: "STRENGTH_SPEED_SEPARATE",
    });
    expect(
      assess({ days: [current], recipe: recipe("speed"), combinedMinutes: () => 76 }),
    ).toMatchObject({ allowed: false, code: "STRENGTH_SPEED_SEPARATE" });
  });

  it("distinguishes per-session time from daily time when two sessions are allowed", () => {
    const current = day("2026-11-05", { dayType: "training", engineV2: recipe("strengthA") });
    expect(
      assess({ days: [current], recipe: recipe("speed"), combinedMinutes: () => 80 }),
    ).toMatchObject({ allowed: false, code: "STRENGTH_SPEED_SEPARATE" });
    expect(assess({ days: [current], recipe: recipe("endurance") })).toMatchObject({
      allowed: true,
      mode: "append_second",
      slot: 1,
    });
  });

  it("does not permit two high lower-body units below age 17", () => {
    const current = day("2026-11-05", {
      dayType: "training",
      engineV2: recipe("strengthA", { tier: "development" }),
    });
    expect(
      assess({
        days: [current],
        profile: { ...athlete, age: 16 },
        recipe: recipe("speed", { tier: "development" }),
      }),
    ).toMatchObject({ allowed: false, code: "STRENGTH_SPEED_SEPARATE" });
    const foundation = day("2026-11-05", {
      dayType: "training",
      engineV2: recipe("strengthA", { tier: "foundation", highLower: false }),
    });
    expect(
      assess({
        days: [foundation],
        profile: { ...athlete, age: 13 },
        recipe: recipe("speed", { tier: "foundation" }),
      }),
    ).toMatchObject({ allowed: false, code: "STRENGTH_SPEED_SEPARATE" });
  });

  it("does not modify a protected second slot or schedule on an unavailable weekday", () => {
    const current = day("2026-11-05", {
      dayType: "club",
      secondSession: day("2026-11-05", { executionProtected: true }),
    });
    expect(assess({ days: [current] })).toMatchObject({ allowed: false, code: "EXECUTION_LOCK" });
    expect(assess({ profile: { ...athlete, unavailableDays: [4] } })).toMatchObject({
      allowed: false,
      code: "UNAVAILABLE",
    });
    expect(assess({ profile: { ...athlete, individualTrainingDays: [1] } })).toMatchObject({
      allowed: false,
      code: "UNAVAILABLE",
    });
  });
});

describe("main goal ranking in a tight week", () => {
  // Two dates. The main target M is only feasible on date 0 and then occupies date 1 too
  // (a recovery gap). S1 fits date 0, S2 fits date 1. Counting targets alone prefers S1+S2.
  type State = string[];
  const tryPlace = (state: State, recipe: string, i: number) => {
    if (state[i] !== "") return { blocked: { code: "OCCUPIED", message: "zajęte" } };
    if (recipe === "M") {
      if (i !== 0 || state[1] !== "") return { blocked: { code: "GAP", message: "przerwa" } };
      return { state: ["M", "gap"] as State };
    }
    if (recipe === "S1" && i !== 0) return { blocked: { code: "DAY", message: "dzień" } };
    if (recipe === "S2" && i !== 1) return { blocked: { code: "DAY", message: "dzień" } };
    return { state: state.map((x, k) => (k === i ? recipe : x)) };
  };
  const tasks = [
    { id: "S1", recipe: "S1", priority: 30 },
    { id: "S2", recipe: "S2", priority: 30 },
    { id: "M", recipe: "M", priority: 10 },
  ];
  const input = {
    initialState: ["", ""] as State,
    tasks,
    dayCount: 2,
    isCovered: (state: State, id: string) => state.includes(id),
    tryPlace,
  };
  it("without a main goal keeps the previous objective (most targets, then priority)", () => {
    const result = solveWeeklySchedule(input);
    expect(result.covered.sort()).toEqual(["S1", "S2"]);
    expect(result.objective.main).toBe(0);
  });
  it("with a main goal keeps it even though fewer targets fit", () => {
    const result = solveWeeklySchedule({ ...input, mainGoalIds: ["M"] });
    expect(result.covered).toEqual(["M"]);
    expect(result.unmet.sort()).toEqual(["S1", "S2"]);
    expect(result.objective.main).toBe(1);
  });
  it("prefers more targets again when the main goal is covered either way", () => {
    const result = solveWeeklySchedule({
      ...input,
      tasks: tasks.filter((t) => t.id !== "M"),
      mainGoalIds: ["S1"],
    });
    expect(result.covered.sort()).toEqual(["S1", "S2"]);
  });
});
