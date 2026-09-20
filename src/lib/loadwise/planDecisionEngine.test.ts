import { describe, expect, it } from "vitest";
import type { SessionDay } from "./types";
import { decideRemovedSession } from "./planDecisionEngine";

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
