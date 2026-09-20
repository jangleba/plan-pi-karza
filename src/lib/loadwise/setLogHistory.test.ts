import { describe, expect, it } from "vitest";
import {
  previousExerciseSessions,
  type HistorySetLogRow,
} from "./setLogHistory";

function row(
  sessionId: string,
  setNumber: number,
  performedAt: string,
): HistorySetLogRow {
  return {
    session_id: sessionId,
    set_number: setNumber,
    weight_kg: 60,
    reps: 6,
    rir: 2,
    performed_at: performedAt,
  };
}

describe("exercise set history", () => {
  it("zwraca trzy ostatnie sesje, a nie miesza serii między treningami", () => {
    const result = previousExerciseSessions(
      [
        row("current", 1, "2026-09-20T10:00:00.000Z"),
        row("third", 2, "2026-09-10T10:02:00.000Z"),
        row("latest", 2, "2026-09-18T10:02:00.000Z"),
        row("second", 1, "2026-09-15T10:01:00.000Z"),
        row("latest", 1, "2026-09-18T10:01:00.000Z"),
        row("fourth", 1, "2026-09-05T10:01:00.000Z"),
      ],
      "current",
    );

    expect(result.map((item) => item.sessionKey)).toEqual([
      "latest",
      "second",
      "third",
    ]);
    expect(result[0].sets.map((set) => set.setNumber)).toEqual([1, 2]);
  });
});
