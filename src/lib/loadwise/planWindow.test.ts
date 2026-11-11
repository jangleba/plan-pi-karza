import { describe, expect, it } from "vitest";
import { addIsoDays } from "@/lib/isoDate";
import { transitionMatchesBlock } from "./confirmedCalendar";
import { rememberedMatchWeekday } from "./matchSchedule";
import {
  calendarSunday,
  latestConfirmedWeekEnd,
  planEndsMidWeek,
  planWindowDays,
} from "./planWindow";
import type { SessionDay, WeeklyTransition } from "./types";

const endOf = (start: string, days: number) => addIsoDays(start, days - 1);

describe("plan window", () => {
  it("ends a block that starts on Thursday on a Sunday instead of mid-week", () => {
    // 15 Oct 2026 is a Thursday: 28 days would stop on Wednesday 11 Nov.
    expect(endOf("2026-10-15", 28)).toBe("2026-11-11");
    const days = planWindowDays("2026-10-15");
    expect(endOf("2026-10-15", days)).toBe("2026-11-15");
  });

  it("keeps 28 days when the block already ends on Sunday", () => {
    expect(planWindowDays("2026-11-09")).toBe(28);
    expect(endOf("2026-11-09", 28)).toBe("2026-12-06");
  });

  it("never cuts off weeks the current block already covers", () => {
    const days = planWindowDays("2026-10-15", "2026-11-22", null, undefined);
    expect(endOf("2026-10-15", days)).toBe("2026-11-22");
    expect(planWindowDays("2026-10-15", "2026-10-20")).toBe(planWindowDays("2026-10-15"));
  });

  it("detects a stored block that stops mid-week", () => {
    expect(planEndsMidWeek(["2026-11-10", "2026-11-11"])).toBe(true);
    expect(planEndsMidWeek(["2026-11-14", "2026-11-15"])).toBe(false);
    expect(planEndsMidWeek([])).toBe(false);
    expect(calendarSunday("2026-11-09")).toBe("2026-11-15");
    expect(calendarSunday("2026-11-15")).toBe("2026-11-15");
  });

  it("reads the latest relevant confirmed week", () => {
    expect(
      latestConfirmedWeekEnd(
        {
          1: { weekEnd: "2026-11-01" },
          4: { weekEnd: "2026-11-15" },
          5: { weekEnd: "2026-11-22" },
          9: { weekEnd: "2027-01-31" },
          10: {},
        },
        "2026-11-11",
      ),
    ).toBe("2026-11-22");
    expect(latestConfirmedWeekEnd({}, "2026-11-11")).toBeNull();
  });
});

describe("confirmed week on a block cut short", () => {
  const plan = Array.from({ length: 3 }, (_, offset) => ({
    date: addIsoDays("2026-11-09", offset),
    cycleId: "cycle-1",
  })) as SessionDay[];
  const transition: WeeklyTransition = {
    id: "t",
    weekNumber: 0,
    cycleId: "cycle-1",
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    nextMatchDate: "2026-11-14",
    nextMatchDates: ["2026-11-14"],
    noMatchNextWeek: false,
    confirmedAt: "2026-11-09T08:00:00Z",
  };

  it("still counts as confirmed, so the match date is not asked for again", () => {
    expect(transitionMatchesBlock(plan, transition, 0)).toBe(true);
  });

  it("rejects a confirmation for another week or block", () => {
    expect(transitionMatchesBlock(plan, { ...transition, weekStart: "2026-11-10" }, 0)).toBe(false);
    expect(transitionMatchesBlock(plan, { ...transition, weekEnd: "2026-11-16" }, 0)).toBe(false);
    expect(transitionMatchesBlock(plan, { ...transition, cycleId: "other" }, 0)).toBe(false);
    expect(
      transitionMatchesBlock(
        plan,
        { ...transition, nextMatchDate: "2026-11-16", nextMatchDates: ["2026-11-16"] },
        0,
      ),
    ).toBe(false);
  });
});

describe("remembered match day", () => {
  it("uses the weekday of the latest earlier match", () => {
    // 7 Nov 2026 is a Saturday, 1 Nov a Sunday.
    expect(rememberedMatchWeekday(["2026-11-01", "2026-11-07", null], "2026-11-09")).toBe(6);
  });

  it("ignores matches from the week being confirmed or later", () => {
    expect(rememberedMatchWeekday(["2026-11-01", "2026-11-14"], "2026-11-09")).toBe(7);
  });

  it("falls back to the usual match day from the profile", () => {
    expect(rememberedMatchWeekday([], "2026-11-09", 3)).toBe(3);
    expect(rememberedMatchWeekday([], "2026-11-09", "no_fixed_day")).toBeNull();
    expect(rememberedMatchWeekday([], "2026-11-09", null)).toBeNull();
  });
});
