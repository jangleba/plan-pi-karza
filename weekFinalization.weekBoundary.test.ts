import { describe, expect, it } from "vitest";
import type {
  DayType,
  ExerciseItem,
  Profile,
  SessionDay,
} from "./types";
import { normalizeSessionCategory } from "./sessionClassification";
import {
  finalizeWeekPlan,
  hasSpeedSession,
  repairSpeedAcrossWeekBoundaries,
} from "./weekFinalization";

const DATES = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(
    Date.UTC(2026, 7, 3 + index),
  );

  return date.toISOString().slice(0, 10);
});

function sections(
  main: ExerciseItem[],
): SessionDay["sections"] {
  return {
    warmup: [],
    main,
    accessory: [],
    footballTransfer: [],
    cooldown: [],
  };
}

function makeDay(
  date: string,
  dayType: DayType,
  overrides: Partial<SessionDay> = {},
): SessionDay {
  const index = DATES.indexOf(date);

  return normalizeSessionCategory({
    date,
    dayOfWeek: (index % 7) + 1,
    dayName: "Dzień testowy",
    dayType,
    title: "Sesja testowa",
    goalLabel: "Test",
    intensity: "umiarkowana",
    durationMin: dayType === "rest" ? 0 : 45,
    reason: "Test granicy tygodni.",
    safetyNote: null,
    whyToday: "Test.",
    sessionType: "Test",
    goalOfSession: "Test.",
    riskManaged: "Test.",
    avoidToday: "Test.",
    mdLabel: null,
    slotLabel: null,
    sections: sections([]),
    secondSession: null,
    ...overrides,
  });
}

function restDay(date: string): SessionDay {
  return makeDay(date, "rest", {
    title: "Dzień wolny",
    sessionType: "Dzień wolny",
    intensity: "niska",
  });
}

function speedDay(date: string): SessionDay {
  return makeDay(date, "training", {
    title: "Sprint i przyspieszenie",
    sessionType: "Szybkość",
    intensity: "wysoka",
    sections: sections([
      {
        name: "Sprinty z pozycji startowej",
        prescription: "4 × 20 m",
        rest: "2–3 min",
      },
    ]),
  });
}

function gymDay(date: string): SessionDay {
  return makeDay(date, "training", {
    title: "Siła dolna — przysiad",
    sessionType: "Siła / moc",
    intensity: "wysoka",
  });
}

function enduranceDay(date: string): SessionDay {
  return makeDay(date, "training", {
    title: "Tempo aerobowe",
    sessionType: "Wytrzymałość",
    intensity: "umiarkowana",
    sections: sections([
      {
        name: "Bieg tlenowy",
        prescription: "20 min spokojnego biegu",
      },
    ]),
  });
}

function testProfile(): Profile {
  return {
    name: "Test",
    age: 22,
    position: "midfielder" as Profile["position"],
    level: "intermediate" as Profile["level"],
    goal: "general" as Profile["goal"],
    secondaryLimiter: null,
    clubTrainingDays: [],
    individualTrainingDays: [],
    usualMatchDay:
      "none" as Profile["usualMatchDay"],
    matchDate: null,
    equipment: [],
    painInjury: false,
    doubleSessionsAllowed: "no",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-08-01",
    seasonPhase:
      "inseason" as Profile["seasonPhase"],
    seasonStage: null,
    competitionLevel:
      "amateur" as Profile["competitionLevel"],
    weeklyMatches: false,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
    gymExperienceLevel: "intermediate",
  };
}

function twoWeekPlan(): SessionDay[] {
  return [
    enduranceDay(DATES[0]),
    gymDay(DATES[1]),
    restDay(DATES[2]),
    gymDay(DATES[3]),
    restDay(DATES[4]),
    restDay(DATES[5]),
    speedDay(DATES[6]),

    speedDay(DATES[7]),
    enduranceDay(DATES[8]),
    restDay(DATES[9]),
    gymDay(DATES[10]),
    restDay(DATES[11]),
    gymDay(DATES[12]),
    restDay(DATES[13]),
  ];
}

function expectNoAdjacentSpeed(
  plan: SessionDay[],
): void {
  for (
    let index = 0;
    index < plan.length - 1;
    index += 1
  ) {
    expect(
      hasSpeedSession(plan[index]) &&
        hasSpeedSession(plan[index + 1]),
    ).toBe(false);
  }
}

describe("speed load na granicy tygodni", () => {
  it("przenosi poniedziałkową szybkość po sprincie w niedzielę", () => {
    const result =
      repairSpeedAcrossWeekBoundaries(
        twoWeekPlan(),
      );

    expect(result.moved).toBe(1);
    expect(result.removed).toBe(0);

    expect(hasSpeedSession(result.plan[6])).toBe(
      true,
    );

    expect(hasSpeedSession(result.plan[7])).toBe(
      false,
    );

    expectNoAdjacentSpeed(result.plan);
  });

  it("finalizeWeekPlan naprawia granicę i zachowuje dwa poprawne tygodnie", () => {
    const result = finalizeWeekPlan(
      twoWeekPlan(),
      testProfile(),
    );

    expect(result.reports).toHaveLength(2);

    expect(
      result.reports.every(
        (report) =>
          report.finalStatus === "valid",
      ),
    ).toBe(true);

    expect(hasSpeedSession(result.plan[6])).toBe(
      true,
    );

    expect(hasSpeedSession(result.plan[7])).toBe(
      false,
    );

    expectNoAdjacentSpeed(result.plan);
  });
});
