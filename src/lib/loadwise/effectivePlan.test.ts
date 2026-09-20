import { describe, expect, it } from "vitest";
import type { SessionDay, SessionModification } from "./types";
import {
  effectiveSessions,
  resolveEffectivePlan,
  resolveModifiedDay,
} from "./effectivePlan";

function day(title: string, date = "2026-09-21"): SessionDay {
  return {
    date,
    dayName: "Poniedziałek",
    dayType: "training",
    title,
    goalLabel: title,
    intensity: "umiarkowana",
    durationMin: 45,
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

function mod(
  id: string,
  type: "add" | "swap",
  session: SessionDay,
  reason = "test",
  createdAt = "2026-09-20T08:00:00.000Z",
): SessionModification {
  return {
    id,
    date: session.date,
    type,
    reason,
    safetyStatus: type === "add" ? "added_by_user" : "swapped_by_user",
    session,
    originalSession: null,
    createdAt,
  };
}

describe("effective plan", () => {
  it("używa ostatniej zamiany jako jedynej wersji sesji głównej", () => {
    const source = day("Siła A");
    const result = resolveModifiedDay(source, [
      mod("1", "swap", day("Siła B"), "", "2026-09-20T08:00:00.000Z"),
      mod("2", "swap", day("Siła C"), "", "2026-09-20T09:00:00.000Z"),
    ]);

    expect(result.title).toBe("Siła C");
    expect(result.date).toBe(source.date);
  });

  it("wkłada dodaną sesję w drugi slot i nie tworzy trzeciej", () => {
    const source = day("Siła");
    const result = resolveModifiedDay(source, [
      mod("1", "add", day("Technika"), "", "2026-09-20T08:00:00.000Z"),
      mod("2", "add", day("Bieg"), "", "2026-09-20T09:00:00.000Z"),
    ]);

    expect(result.slotLabel).toBe("Sesja 1");
    expect(result.secondSession?.title).toBe("Bieg");
    expect(effectiveSessions([result])).toHaveLength(2);
  });

  it("decyzja check-inu o drugiej sesji ma pierwszeństwo przed starym slotem", () => {
    const source = day("Siła");
    source.secondSession = day("Stara technika");
    const result = resolveModifiedDay(source, [
      mod(
        "second",
        "add",
        day("Technika — lżej"),
        "[daily-checkin:second-lighter] Druga sesja lżej.",
      ),
    ]);

    expect(result.secondSession?.title).toBe("Technika — lżej");
  });

  it("rozwiązuje modyfikacje osobno dla każdej daty", () => {
    const monday = day("Poniedziałek", "2026-09-21");
    const tuesday = day("Wtorek", "2026-09-22");
    const effective = resolveEffectivePlan([monday, tuesday], {
      [monday.date]: [mod("m", "swap", day("Nowy poniedziałek", monday.date))],
    });

    expect(effective.map((item) => item.title)).toEqual([
      "Nowy poniedziałek",
      "Wtorek",
    ]);
  });
});
