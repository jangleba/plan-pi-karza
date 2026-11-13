import { describe, expect, it } from "vitest";
import { canonicalizeGeneratedExercise, getExerciseDefinition, resolveExerciseByName } from "./exerciseLibrary";
import type { ExerciseItem } from "./types";

const item = (name: string): ExerciseItem =>
  ({ name, prescription: "3 × 8", rest: "90 s" }) as unknown as ExerciseItem;
const resolved = (name: string) => canonicalizeGeneratedExercise(item(name)).exerciseId;

describe("tożsamość ćwiczeń generowanych z nazwy", () => {
  // Reproduced on c9e54e5: the bare hinge name fell through to the squat fallback.
  it("„Martwy ciąg rumuński” nie zamienia się w przysiad z masą ciała", () => {
    expect(resolved("Martwy ciąg rumuński")).toBe("romanian_deadlift_db");
    expect(resolved("Martwy ciąg rumuński (RDL)")).toBe("romanian_deadlift_db");
    expect(getExerciseDefinition(resolved("Martwy ciąg rumuński")!)?.movementPattern).toBe("hinge");
  });

  it("martwy ciąg sztangą i trap barem zachowuje wzorzec zawiasu", () => {
    expect(resolved("Martwy ciąg klasyczny")).toBe("barbell_deadlift");
    expect(resolved("Martwy ciąg z trap barem")).toBe("trap_bar_deadlift");
  });

  // Reproduced on c9e54e5: kettlebell deadlift mapped to a swing (a ballistic power move).
  it("martwy ciąg z kettlebellem nie jest wymachem kettlebell", () => {
    expect(resolved("Kettlebell deadlift")).not.toBe("kettlebell_swing");
  });

  it("nazwa z biblioteki rozwiązuje się do tego samego ćwiczenia", () => {
    expect(resolveExerciseByName("Martwy ciąg rumuński ze sztangą")?.id).toBe(
      "barbell_romanian_deadlift",
    );
  });
});
