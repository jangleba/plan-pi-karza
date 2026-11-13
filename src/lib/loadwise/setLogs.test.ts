import { describe, expect, it } from "vitest";
import {
  plannedSets,
  previousSessionLogs,
  previousExerciseSessions,
  type SetLogRow,
} from "./setLogs";

describe("historia serii", () => {
  it("opens all sets from the structured generator, whose sets are strings", () => {
    expect(plannedSets({ id: "squat", name: "Przysiad", sets: "3", reps: "8" })).toBe(3);
    expect(plannedSets({ id: "rdl", name: "Martwy ciąg", sets: "2–3", reps: "6" })).toBe(2);
  });
  it("retains the display-prescription fallback for legacy set records", () => {
    expect(plannedSets({ id: "old", name: "Przysiad", displayPrescription: "4 × 5" })).toBe(4);
    expect(plannedSets({ id: "mobility", name: "Mobilność", duration: "5 min" })).toBe(0);
  });
  it("nie miesza serii z kilku poprzednich sesji", () => {
    const rows = [
      {
        session_id: "current",
        exercise_key: "squat",
        set_number: 1,
        weight_kg: 82.5,
        reps: 6,
        rir: 2,
        performed_at: "2026-09-05T10:00:00Z",
      },
      {
        session_id: "last",
        exercise_key: "squat",
        set_number: 2,
        weight_kg: 80,
        reps: 6,
        rir: 2,
        performed_at: "2026-09-01T10:05:00Z",
      },
      {
        session_id: "last",
        exercise_key: "squat",
        set_number: 1,
        weight_kg: 80,
        reps: 7,
        rir: 2,
        performed_at: "2026-09-01T10:00:00Z",
      },
      {
        session_id: "older",
        exercise_key: "squat",
        set_number: 3,
        weight_kg: 75,
        reps: 8,
        rir: 3,
        performed_at: "2026-08-25T10:10:00Z",
      },
    ];
    const result = previousSessionLogs(rows, "current");
    expect(Object.keys(result)).toEqual(["1", "2"]);
    expect(result[1].weightKg).toBe(80);
  });
  it("uses the newest offline correction for both prefill and progression history", () => {
    const base: SetLogRow = {
      session_id: "last",
      exercise_key: "squat",
      set_number: 1,
      weight_kg: 80,
      reps: 4,
      rir: 2,
      performed_at: "2026-11-02T10:00:00Z",
    };
    const rows: SetLogRow[] = [
      { ...base, session_id: "current", weight_kg: 90, performed_at: "2026-11-09T10:00:00Z" },
      { ...base, weight_kg: 85, performed_at: "2026-11-02T10:05:00Z" },
      { ...base, set_number: 2, weight_kg: 82, performed_at: "2026-11-02T10:02:00Z" },
      base,
      { ...base, session_id: "older", weight_kg: 70, performed_at: "2026-10-26T10:00:00Z" },
    ];
    for (const input of [rows, [...rows].reverse()]) {
      const previous = previousSessionLogs(input, "current");
      expect(previous[1].weightKg).toBe(85);
      expect(previous[2].weightKg).toBe(82);
      expect(Object.values(previous)).toEqual(previousExerciseSessions(input, "current")[0].sets);
    }
  });
});
