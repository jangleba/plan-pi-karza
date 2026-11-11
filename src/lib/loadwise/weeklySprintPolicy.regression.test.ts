import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { estimateLimitedSprintMeters, estimateSprintMeters } from "./speedLoad";
import { validatePersistedPlan } from "./persistedPlanValidation";
import { PLAN_ENGINE_VERSION } from "./planVersion";
import {
  MAX_WEEKLY_SPRINT_METERS,
  calendarMonday,
  weekSprintSummary,
  weeklySprintIssues,
} from "./weeklySprintPolicy";
import type { Goal, Level, Profile, SessionDay } from "./types";

function sprintRow(prescription: string, name = "Swobodny sprint akceleracyjny"): SessionDay {
  return {
    date: "2026-11-10",
    dayName: "wtorek",
    dayType: "training",
    title: "Sprint",
    goalLabel: "Sprint",
    intensity: "wysoka",
    durationMin: 50,
    reason: "",
    sections: {
      warmup: [],
      main: [{ name, prescription }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    classification: { category: "speed_sprint", subcategory: "acceleration" },
  } as unknown as SessionDay;
}

function profile(age: number, level: Level, goal: Goal, variant: number): Profile {
  return {
    name: "Regresja sprintu",
    age,
    healthPersonalizationEnabled: false,
    position: "midfielder",
    level,
    goal,
    secondaryLimiter: null,
    clubTrainingDays: variant % 2 ? [2, 4] : [1, 3, 5],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: variant % 3 ? 6 : 7,
    matchDate: "2026-11-21",
    equipment: ["dumbbells", "barbell"],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-09-01",
    seasonPhase: "inseason",
    seasonStage: "match_week",
    competitionLevel: "academy",
    weeklyMatches: true,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
  };
}

describe("licznik metrów sprintu", () => {
  it("liczy odcinki akcji i złożone powtórzenia, których wcześniej nie widział", () => {
    expect(estimateSprintMeters(sprintRow("6 akcji × 10 m"))).toBe(60);
    expect(
      estimateSprintMeters(
        sprintRow("4 × (10 m + 10 m)", "Przyspieszenie–hamowanie–ponowne przyspieszenie"),
      ),
    ).toBe(80);
  });

  it("w odcinku złożonym liczy tylko część z przyspieszeniem", () => {
    expect(
      estimateSprintMeters(
        sprintRow(
          "2–3 × 20 m (10 m drobienia + 10 m przyspieszenia)",
          "Drobienie → przyspieszenie",
        ),
      ),
    ).toBe(30);
  });

  it("nie liczy najazdu do sprintu lotnego", () => {
    expect(estimateSprintMeters(sprintRow("4 × 20 m z najazdu 15 m", "Sprint lotny"))).toBe(80);
  });

  it("limit tygodnia pomija jawnie submaksymalne zrywy, ale liczy 90–95%", () => {
    expect(
      estimateLimitedSprintMeters(
        sprintRow("3–5 × 10–15 m na ok. 80%", "Krótkie zrywy submaksymalne"),
      ),
    ).toBe(0);
    expect(estimateLimitedSprintMeters(sprintRow("2 × 30 m przy 90–95%", "Piłkarski sprint"))).toBe(
      60,
    );
  });
});

describe("limit tygodnia: 1 dedykowana sesja sprintu i 240 m", () => {
  beforeAll(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  // Before the fix these profiles received 2–3 sprint sessions and up to 390 m per week.
  const cases: [number, Level, Goal][] = [
    [16, "intermediate", "speed"],
    [17, "advanced", "speed"],
    [20, "intermediate", "general"],
    [20, "advanced", "power"],
    [14, "advanced", "endurance"],
    [20, "advanced", "agility"],
  ];

  it.each(cases)("wiek %i, %s, cel %s", (age, level, goal) => {
    const plan = generatePlan(profile(age, level, goal, age), new Date("2026-11-09T00:00:00"), 28);
    expect(weeklySprintIssues(plan)).toEqual([]);
    const weeks = new Map<string, SessionDay[]>();
    for (const day of plan)
      weeks.set(calendarMonday(day.date), [...(weeks.get(calendarMonday(day.date)) ?? []), day]);
    for (const week of weeks.values()) {
      const summary = weekSprintSummary(week);
      expect(summary.dedicatedSessions).toBeLessThanOrEqual(1);
      expect(summary.meters).toBeLessThanOrEqual(MAX_WEEKLY_SPRINT_METERS);
    }
  });

  it("walidator odrzuca drugą dedykowaną sesję sprintu w tym samym tygodniu", () => {
    const plan = generatePlan(
      profile(20, "advanced", "speed", 1),
      new Date("2026-11-09T00:00:00"),
      7,
    );
    const sprint = plan
      .flatMap((day) => [day, day.secondSession])
      .find((session) => session?.classification?.category === "speed_sprint")!;
    const freeIndex = plan.findIndex(
      (day) =>
        day.date !== sprint.date &&
        !["club", "match"].includes(day.dayType) &&
        day.classification?.category !== "speed_sprint",
    );
    expect(freeIndex).toBeGreaterThanOrEqual(0);
    const target = plan[freeIndex];
    const changed = plan.map((day, index) =>
      index === freeIndex
        ? { ...sprint, date: target.date, dayName: target.dayName, secondSession: null }
        : day,
    );
    const codes = validatePersistedPlan(
      changed,
      profile(20, "advanced", "speed", 1),
      PLAN_ENGINE_VERSION,
    ).issues.map((issue) => issue.code);
    expect(codes).toContain("extra-sprint-session");
  });
});
