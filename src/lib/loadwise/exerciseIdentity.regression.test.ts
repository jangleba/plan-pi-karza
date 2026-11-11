import { describe, expect, it } from "vitest";
import { canonicalizeGeneratedExercise, getExerciseDefinition, resolveExerciseByName } from "./exerciseLibrary";
import { LEGACY_EXERCISE_IDS } from "./strengthBlocks";
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
    expect(LEGACY_EXERCISE_IDS["kettlebell deadlift (trap bar zastępczo)"]).not.toBe("kettlebell_swing");
    expect(resolved("Kettlebell deadlift")).not.toBe("kettlebell_swing");
  });

  // Carries were mapped to the swing; the library has dedicated carry records.
  it.each([
    ["farmer's carry", "farmer_carry"],
    ["suitcase carry (jednostronnie)", "suitcase_carry"],
    ["front rack carry", "front_rack_carry"],
    ["spacer kelnera (overhead carry)", "overhead_carry"],
  ])("%s → %s, wzorzec carry", (name, id) => {
    expect(LEGACY_EXERCISE_IDS[name]).toBe(id);
    expect(getExerciseDefinition(id)?.movementPattern).toBe("carry");
  });

  it("aliasy legacy wskazują istniejące, zatwierdzone ćwiczenia", () => {
    for (const id of new Set(Object.values(LEGACY_EXERCISE_IDS)))
      expect(getExerciseDefinition(id), id).toBeDefined();
  });

  it("nazwa z biblioteki rozwiązuje się do tego samego ćwiczenia", () => {
    expect(resolveExerciseByName("Martwy ciąg rumuński ze sztangą")?.id).toBe(
      "barbell_romanian_deadlift",
    );
  });
});
