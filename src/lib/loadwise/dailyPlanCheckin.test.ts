import { describe, expect, it } from "vitest";
import type { SessionDay } from "./types";
import {
  buildLighterSession,
  buildUnavailableSession,
  promoteSecondSession,
  readDailyPlanCheckin,
  saveDailyPlanCheckin,
  withoutSecondSession,
} from "./dailyPlanCheckin";

function session(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-09-20",
    dayName: "Niedziela",
    dayType: "training",
    type: "strength_power",
    title: "Siła",
    goalLabel: "Siła",
    intensity: "wysoka",
    durationMin: 60,
    reason: "Plan tygodnia",
    safetyNote: null,
    whyToday: "Dzień siłowy",
    sessionType: "Siła",
    goalOfSession: "Rozwój siły",
    riskManaged: "Kontrolowana objętość",
    avoidToday: "",
    mdLabel: null,
    slotLabel: "Sesja 1",
    sections: {
      warmup: [],
      main: [{ name: "Przysiad", prescription: "4 × 8" }],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    },
    secondSession: null,
    ...overrides,
  };
}

describe("daily plan check-in", () => {
  it("zapisuje datę oraz niezależne decyzje dla obu sesji", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const now = new Date("2026-09-20T08:00:00.000Z");

    saveDailyPlanCheckin(
      "user-1",
      "2026-09-20",
      "lighter",
      "remove",
      storage,
      now,
    );

    expect(readDailyPlanCheckin("user-1", "2026-09-20", storage)).toEqual({
      date: "2026-09-20",
      primaryAction: "lighter",
      secondAction: "remove",
      completedAt: now.toISOString(),
    });
    expect(readDailyPlanCheckin("user-1", "2026-09-21", storage)).toBeNull();
  });

  it("buduje lżejszy wariant i zachowuje drugą sesję do osobnej decyzji", () => {
    const result = buildLighterSession(
      session({ secondSession: session({ title: "Technika" }) }),
    );

    expect(result.durationMin).toBe(45);
    expect(result.intensity).toBe("umiarkowana");
    expect(result.sections.main[0].prescription).toBe("3 × 8");
    expect(result.secondSession?.title).toBe("Technika");
    expect(result.loadLabelOverride).toBe("Lżejszy wariant");
  });

  it("nie zmienia jednostki klubowej, tylko oznacza mniejszy udział", () => {
    const result = buildLighterSession(
      session({ dayType: "club", externalCommitment: true }),
    );

    expect(result.durationMin).toBe(60);
    expect(result.loadLabelOverride).toBe("Ogranicz obciążenie");
  });

  it("zamienia niedostępną sesję na dzień bez treningu", () => {
    const result = buildUnavailableSession(session());

    expect(result.isUnavailable).toBe(true);
    expect(result.dayType).toBe("rest");
    expect(result.durationMin).toBe(0);
    expect(result.sections.main).toEqual([]);
  });

  it("usuwa wyłącznie drugi slot", () => {
    const original = session({
      secondSession: session({ title: "Technika" }),
    });
    const result = withoutSecondSession(original);

    expect(result.title).toBe("Siła");
    expect(result.secondSession).toBeNull();
    expect(result.slotLabel).toBeNull();
  });

  it("promuje drugą sesję, gdy pierwsza jest niedostępna", () => {
    const original = session({
      dayDbId: "day-1",
      secondSession: session({ title: "Technika", slotLabel: "Sesja 2" }),
    });
    const result = promoteSecondSession(original);

    expect(result.title).toBe("Technika");
    expect(result.dayDbId).toBe("day-1");
    expect(result.date).toBe(original.date);
    expect(result.secondSession).toBeNull();
    expect(result.slotLabel).toBeNull();
  });
});
