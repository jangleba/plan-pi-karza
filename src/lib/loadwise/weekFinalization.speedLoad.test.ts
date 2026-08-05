import { describe, expect, it } from "vitest";
import type {
  DayType,
  ExerciseItem,
  SessionDay,
} from "./types";
import { normalizeSessionCategory } from "./sessionClassification";
import {
  countSpeedSessionsForDay,
  hasSpeedSession,
  repairBackToBackSpeedSessions,
  repairDuplicateSpeedSameDay,
  validateNoBackToBackSpeedDays,
} from "./weekFinalization";

const DATES = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-08",
  "2026-08-09",
];

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
  const raw: SessionDay = {
    date,
    dayOfWeek: DATES.indexOf(date) + 1,
    dayName: "Dzień testowy",
    dayType,
    title: "Sesja testowa",
    goalLabel: "Test",
    intensity: "umiarkowana",
    durationMin: dayType === "rest" ? 0 : 40,
    reason: "Test integracji speed load.",
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
  };

  return normalizeSessionCategory(raw);
}

function restDay(date: string): SessionDay {
  return makeDay(date, "rest", {
    title: "Dzień wolny",
    sessionType: "Dzień wolny",
    intensity: "niska",
  });
}

function sprintDay(date: string): SessionDay {
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

function rsaDay(date: string): SessionDay {
  return makeDay(date, "training", {
    title: "Powtarzalne sprinty RSA",
    sessionType: "Wytrzymałość specjalna",
    intensity: "wysoka",
    sections: sections([
      {
        name: "Powtarzalne sprinty RSA",
        prescription: "2 × (5 × 20 m)",
        rest: "30–40 s",
      },
    ]),
  });
}

function skipDay(date: string): SessionDay {
  return makeDay(date, "training", {
    title: "Technika biegu A–C–B–D",
    sessionType: "Technika biegu",
    intensity: "umiarkowana",
    sections: sections([
      { name: "Skip A", prescription: "2 × 15 m" },
      { name: "Skip C", prescription: "2 × 15 m" },
      { name: "Skip B", prescription: "2 × 15 m" },
      { name: "Skip D", prescription: "2 × 15 m" },
    ]),
  });
}

describe("weekFinalization korzysta ze speedLoad", () => {
  it("RSA ukryte jako wydolność liczy się jako realny speed load", () => {
    const rsa = rsaDay(DATES[0]);

    expect(hasSpeedSession(rsa)).toBe(true);
    expect(countSpeedSessionsForDay(rsa)).toBe(1);
  });

  it("RSA i sprint jednego dnia są wykrywane jako duplikat", () => {
    const day = rsaDay(DATES[0]);
    day.secondSession = sprintDay(DATES[0]);

    const week = [
      day,
      restDay(DATES[1]),
      restDay(DATES[2]),
      restDay(DATES[3]),
      restDay(DATES[4]),
      restDay(DATES[5]),
      restDay(DATES[6]),
    ];

    expect(countSpeedSessionsForDay(day)).toBe(2);

    const result = repairDuplicateSpeedSameDay(week);

    expect(countSpeedSessionsForDay(day)).toBe(1);
    expect(
      week.some(
        (item) => countSpeedSessionsForDay(item) > 1,
      ),
    ).toBe(false);
    expect(result.moved + result.removed).toBe(1);
  });

  it("RSA i sprint dzień po dniu są rozdzielane", () => {
    const week = [
      rsaDay(DATES[0]),
      sprintDay(DATES[1]),
      restDay(DATES[2]),
      restDay(DATES[3]),
      restDay(DATES[4]),
      restDay(DATES[5]),
      restDay(DATES[6]),
    ];

    expect(
      validateNoBackToBackSpeedDays(week).ok,
    ).toBe(false);

    repairBackToBackSpeedSessions(week);

    expect(
      validateNoBackToBackSpeedDays(week).ok,
    ).toBe(true);
  });

  it("same skipy nie blokują sprintu następnego dnia", () => {
    const week = [
      skipDay(DATES[0]),
      sprintDay(DATES[1]),
      restDay(DATES[2]),
      restDay(DATES[3]),
      restDay(DATES[4]),
      restDay(DATES[5]),
      restDay(DATES[6]),
    ];

    expect(hasSpeedSession(week[0])).toBe(false);
    expect(countSpeedSessionsForDay(week[0])).toBe(0);
    expect(
      validateNoBackToBackSpeedDays(week).ok,
    ).toBe(true);
  });
});
