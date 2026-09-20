import { describe, expect, it } from "vitest";
import {
  EMPTY_FUEL_SCHEDULE,
  findNextFuelSession,
  rememberFuelStart,
} from "./schedule";
import type { SessionDay } from "@/lib/loadwise/types";

function session(partial: Partial<SessionDay>): SessionDay {
  return {
    date: "2026-09-20",
    dayName: "Niedziela",
    dayType: "training",
    title: "Siła",
    goalLabel: "Siła",
    intensity: "umiarkowana",
    durationMin: 50,
    reason: "Test",
    safetyNote: null,
    whyToday: "Test",
    sessionType: "Siła",
    goalOfSession: "Test",
    riskManaged: "Test",
    avoidToday: "Test",
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
    ...partial,
  };
}

describe("fuel schedule", () => {
  it("remembers one clock for the same kind", () => {
    const next = rememberFuelStart({
      preferences: EMPTY_FUEL_SCHEDULE,
      session: { kind: "strength", scheduleKey: "x" },
      clock: "17:30",
      rememberForKind: true,
    });
    expect(next.defaults.strength).toBe("17:30");
  });

  it("includes the second session and picks the earliest known start", () => {
    const second = session({
      title: "Piłka",
      sessionType: "Piłka",
      goalLabel: "Piłka",
      dbId: "s2",
    });
    const main = session({ dbId: "s1", secondSession: second });
    const result = findNextFuelSession({
      plan: [main],
      todayIso: "2026-09-20",
      now: new Date("2026-09-20T12:00:00"),
      preferences: {
        version: 1,
        defaults: { strength: "18:00", football: "16:00" },
        sessions: {},
      },
    });
    expect(result.slot).toBe(2);
    expect(result.startClock).toBe("16:00");
  });

  it("pomija ukończony slot i prowadzi Fuel do następnej realnej sesji", () => {
    const today = session({ dbId: "done", scheduledStartTime: "14:00" });
    const tomorrow = session({
      date: "2026-09-21",
      dbId: "next",
      scheduledStartTime: "18:00",
    });
    const result = findNextFuelSession({
      plan: [today, tomorrow],
      todayIso: "2026-09-20",
      now: new Date("2026-09-20T12:00:00"),
      preferences: EMPTY_FUEL_SCHEDULE,
      completions: {
        done: { completed: true, rpe: 7, notes: "" },
      },
    });

    expect(result.date).toBe("2026-09-21");
  });
});
