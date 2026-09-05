import { describe, expect, it } from "vitest";
import { previousSessionLogs } from "./setLogs";

describe("historia serii", () => {
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
