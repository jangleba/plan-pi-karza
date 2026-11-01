import { describe, expect, it } from "vitest";
import { addIsoDays } from "@/lib/isoDate";
import {
  currentWeekIndex,
  weeklyConfirmationBounds,
  weeklyPromptTarget,
  weekBounds,
} from "./weeklyNavigation";
const weeks = [
  { startDate: "2026-10-26", endDate: "2026-11-01" },
  { startDate: "2026-11-02", endDate: "2026-11-08" },
];
describe("weekly navigation", () => {
  it("prompts for the next week on Sunday without switching away from today's session", () => {
    expect(currentWeekIndex(weeks, "2026-11-01")).toBe(0);
    expect(weeklyPromptTarget(weeks, "2026-11-01", () => false)).toMatchObject({
      index: 1,
      startDate: "2026-11-02",
      isNext: true,
    });
    expect(weeklyPromptTarget(weeks, "2026-10-31", () => false)).toBeNull();
  });
  it("recovers a missed confirmation on Monday and stops after confirmation", () => {
    expect(weeklyPromptTarget(weeks, "2026-11-02", () => false)?.index).toBe(1);
    expect(weeklyPromptTarget(weeks, "2026-11-02", () => true)).toBeNull();
  });
  it("can prepare a week just beyond the monthly horizon", () => {
    expect(weekBounds(weeks, 2)).toEqual({ startDate: "2026-11-09", endDate: "2026-11-15" });
    expect(weekBounds(weeks, 3)).toBeNull();
    expect(weeklyPromptTarget(weeks, "2026-11-08", () => true)?.index).toBe(2);
    expect(weeklyPromptTarget(weeks, "2026-11-08", () => false)?.index).toBe(2);
  });
  it("can request a missing calendar after a Monday cycle rollover", () => {
    expect(weeklyPromptTarget(weeks.slice(1), "2026-11-02", () => false, true)?.index).toBe(0);
    expect(weeklyPromptTarget(weeks.slice(1), "2026-11-02", () => true, true)).toBeNull();
  });
  it("completes a partial last week and keeps its Sunday inside the bounds", () => {
    const dates = Array.from({ length: 28 }, (_, i) => addIsoDays("2026-11-01", i));
    expect(weeklyConfirmationBounds(dates, 4)).toEqual({
      startDate: "2026-11-23",
      endDate: "2026-11-29",
    });
    expect(weeklyConfirmationBounds(dates, 5)).toEqual({
      startDate: "2026-11-30",
      endDate: "2026-12-06",
    });
    expect(() => weeklyConfirmationBounds(dates, 50)).toThrow();
  });
  it("uses ISO calendar days across year and DST boundaries", () => {
    expect(weeklyConfirmationBounds(["2026-12-31"], 1)).toEqual({
      startDate: "2027-01-04",
      endDate: "2027-01-10",
    });
  });
});
