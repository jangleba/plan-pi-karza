import { describe, expect, it } from "vitest";
import type { SessionDay } from "./types";
import { decideRemovedSession, moveSessionToDay } from "./planDecisionEngine";

function day(
  date: string,
  title: string,
  dayType: SessionDay["dayType"] = "training",
  intensity: SessionDay["intensity"] = "umiarkowana",
): SessionDay {
  return {
    date,
    dayName: "Test",
    dayType,
    title,
    goalLabel: title,
    intensity,
    durationMin: dayType === "rest" ? 0 : 45,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType: title,
    goalOfSession: "test",
    riskManaged: "test",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: {
      warmup: [],
      main: [],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
  };
}

describe("plan decision engine", () => {
  const profile = { age: 20, level: "intermediate" as const };

  it("nic nie dokłada, jeśli bodziec już występuje później", () => {
    const result = decideRemovedSession({
      effectivePlan: [
        day("2026-09-21", "Siła"),
        day("2026-09-23", "Siła nóg"),
        day("2026-09-24", "Wolne", "rest", "niska"),
      ],
      removed: day("2026-09-21", "Siła"),
      todayIso: "2026-09-21",
      profile,
    });

    expect(result.action).toBe("already_covered");
  });

  it("sam przenosi bodziec, gdy istnieje jedno bezpieczne miejsce", () => {
    const result = decideRemovedSession({
      effectivePlan: [
        day("2026-09-21", "Siła"),
        day("2026-09-22", "Mecz", "match", "wysoka"),
        day("2026-09-24", "Wolne", "rest", "niska"),
      ],
      removed: day("2026-09-21", "Siła"),
      todayIso: "2026-09-21",
      profile,
    });

    expect(result.action).toBe("move");
    if (result.action === "move") expect(result.target.date).toBe("2026-09-24");
  });

  it("pyta dopiero przy dwóch równie bezpiecznych miejscach", () => {
    const result = decideRemovedSession({
      effectivePlan: [
        day("2026-09-21", "Siła"),
        day("2026-09-23", "Wolne", "rest", "niska"),
        day("2026-09-25", "Wolne", "rest", "niska"),
      ],
      removed: day("2026-09-21", "Siła"),
      todayIso: "2026-09-21",
      profile,
    });

    expect(result.action).toBe("ask");
  });

  it("nie wciska sesji w tydzień bez bezpiecznego miejsca", () => {
    const result = decideRemovedSession({
      effectivePlan: [
        day("2026-09-21", "Siła"),
        day("2026-09-22", "Klub", "club", "wysoka"),
        day("2026-09-24", "Mecz", "match", "wysoka"),
      ],
      removed: day("2026-09-21", "Siła"),
      todayIso: "2026-09-21",
      profile,
    });

    expect(result.action).toBe("drop");
  });
});

it("nie proponuje sprintu ani siły obok mocnego dnia, także w drugim slocie i za granicą tygodnia", () => {
  const removed = day("2026-09-21", "Sprint", "training", "wysoka");
  const target = day("2026-09-27", "Wolne", "rest", "niska");
  const monday = {
    ...day("2026-09-28", "Wolne", "rest", "niska"),
    secondSession: day("2026-09-28", "Siła", "training", "wysoka"),
  };
  expect(
    decideRemovedSession({
      effectivePlan: [removed, target, monday],
      removed,
      todayIso: removed.date,
      profile: { age: 22, level: "advanced" },
    }).action,
  ).toBe("drop");
});
it("respektuje dostępność zawodnika i nie nadpisuje wykonanej jednostki", () => {
  const removed = day("2026-09-21", "Siła"),
    target = day("2026-09-24", "Wolne", "rest", "niska");
  for (const [profile, candidate] of [
    [{ age: 22, level: "advanced" as const, individualTrainingDays: [1] as number[] }, target],
    [
      { age: 22, level: "advanced" as const },
      { ...target, executionProtected: true },
    ],
  ] as const) {
    expect(
      decideRemovedSession({
        effectivePlan: [removed, candidate],
        removed,
        todayIso: removed.date,
        profile,
      }).action,
    ).toBe("drop");
  }
});
it("przeniesiona sesja przejmuje kontekst bloku dnia docelowego", () => {
  const result = moveSessionToDay(
    { ...day("2026-09-21", "Siła"), blockWeekNumber: 3, blockPhaseLabel: "Rozwój" },
    {
      ...day("2026-09-24", "Wolne", "rest", "niska"),
      blockWeekNumber: 4,
      blockPhaseLabel: "Odciążenie",
    },
  );
  expect(result.blockWeekNumber).toBe(4);
  expect(result.blockPhaseLabel).toBe("Odciążenie");
});
