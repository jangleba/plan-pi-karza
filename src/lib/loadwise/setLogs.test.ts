import { describe, expect, it } from "vitest";
import { plannedSets, previousSessionLogs } from "./setLogs";

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
});
