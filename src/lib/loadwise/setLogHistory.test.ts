import { describe, expect, it } from "vitest";
import {
  previousExerciseSessions,
  verifyExerciseHistory,
  exercisePrescriptionKey,
  type HistorySetLogRow,
} from "./setLogHistory";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionCompletion, TrainingExercise } from "./types";

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
  const exercise: TrainingExercise = { id: "squat", exerciseId: "squat", name: "Przysiad", sets: "2", reps: "6", rir: "2" };
  const completion = (overrides: Partial<SessionCompletion> = {}): SessionCompletion => ({
    completed: true, status: "completed", rpe: 6, notes: "",
    executionSnapshot: sessionFixture({ dbId: "latest", structuredSections: [sectionFixture("main", [exercise])] }),
    ...overrides,
  });
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

  it("nakładka offline zastępuje tę samą serię i nie udaje dodatkowej serii", () => {
    const result = previousExerciseSessions([
      row("latest", 1, "2026-09-18T10:01:00Z"),
      { ...row("latest", 1, "2026-09-18T10:03:00Z"), weight_kg: 62.5 },
    ], "current");
    expect(result[0].sets).toHaveLength(1);
    expect(result[0].sets[0].weightKg).toBe(62.5);
  });

  it("weryfikuje cel z wykonanej rozpiski strukturalnej, nie z bieżącego planu", () => {
    const recent = previousExerciseSessions([row("latest", 1, "2026-09-18T10:01:00Z")], "current");
    const result = verifyExerciseHistory(recent, "squat", { latest: completion() });
    expect(result[0].verification).toEqual({ expectedSets: 2, prescriptionKey: exercisePrescriptionKey(exercise) });
    expect(recent[0].verification).toBeUndefined();
  });

  it("nie przenosi starego dowodu na brakującą lub przerwaną sesję", () => {
    const recent = verifyExerciseHistory(previousExerciseSessions([
      row("latest", 1, "2026-09-18T10:01:00Z"),
    ], "current"), "squat", { latest: completion() });
    expect(verifyExerciseHistory(recent, "squat", {})[0].verification).toBeUndefined();
    expect(verifyExerciseHistory(recent, "squat", {
      latest: completion({ completed: false, status: "started" }),
    })[0].verification).toBeUndefined();
  });

  it("odrzuca niejednoznaczny klucz powtórzony w dwóch blokach", () => {
    const recent = previousExerciseSessions([row("latest", 1, "2026-09-18T10:01:00Z")], "current");
    const result = verifyExerciseHistory(recent, "squat", { latest: completion({
      executionSnapshot: sessionFixture({ dbId: "latest", structuredSections: [sectionFixture("main", [exercise, exercise])] }),
    }) });
    expect(result[0].verification).toBeUndefined();
  });
});
