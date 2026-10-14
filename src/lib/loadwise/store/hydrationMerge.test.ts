import { describe, expect, it } from "vitest";
import { initialState } from "./model";
import { mergeHydratedHistory, mergeHydratedRecord, mergeHydratedState } from "./hydrationMerge";
import type { SessionHistoryRecord } from "../types";

describe("background hydration merges", () => {
  it("keeps new and deleted local entries while refreshing unchanged entries", () => {
    const old = { value: 1 };
    const baseline = { unchanged: old, edited: old, deleted: old };
    const current = { unchanged: old, edited: { value: 5 }, added: { value: 6 } };
    const remote = { unchanged: { value: 2 }, edited: { value: 2 }, deleted: old, remote: old };
    expect(mergeHydratedRecord(current, baseline, remote)).toEqual({
      unchanged: { value: 2 },
      edited: { value: 5 },
      added: { value: 6 },
      remote: old,
    });
  });
  it("keeps the entire edited plan revision together", () => {
    const current = { ...initialState, modifications: { "2026-10-10": [] } };
    const remote = {
      ...initialState,
      planGeneratedFor: "2026-10-11",
      transitions: {
        1: {
          id: "remote",
          weekNumber: 1,
          nextMatchDate: null,
          noMatchNextWeek: true,
          confirmedAt: "2026-10-10",
        },
      },
    };
    const result = mergeHydratedState(current, initialState, remote);
    expect(result.modifications).toBe(current.modifications);
    expect(result.transitions).toBe(current.transitions);
    expect(result.planGeneratedFor).toBe(current.planGeneratedFor);
  });
  it("refreshes cached history but retains a workout finished during the read", () => {
    const row = {
      key: "old",
      date: "2026-10-09",
      title: "Old",
      category: "gym",
      durationMin: 30,
      rpe: 6,
      notes: "",
    } satisfies SessionHistoryRecord;
    const newRow = { ...row, key: "new", date: "2026-10-10" };
    expect(mergeHydratedHistory([row, newRow], [row], [{ ...row, title: "Updated" }])).toEqual([
      newRow,
      { ...row, title: "Updated" },
    ]);
  });
});
