import { describe, expect, it } from "vitest";
import type { SetLog } from "./setLogs";
import {
  recommendNextLoad,
  saveStrengthProgressionDecision,
} from "./strengthProgression";

function sets(weightKg: number, reps: number, rir: number): SetLog[] {
  return [1, 2, 3].map((setNumber) => ({ setNumber, weightKg, reps, rir }));
}

describe("strength progression", () => {
  it("proponuje mały wzrost dopiero po dwóch stabilnych ekspozycjach", () => {
    const result = recommendNextLoad(
      [sets(60, 6, 3), sets(60, 6, 3)],
      "6",
      "2",
      {
        age: 22,
        level: "intermediate",
        gymExperienceLevel: "intermediate",
        smallestIncrementKg: 2.5,
        exercise: { name: "Przysiad ze sztangą" },
      },
    );

    expect(result?.mode).toBe("increase");
    expect(result?.weightKg).toBe(62.5);
  });

  it("po jednej sesji utrzymuje ciężar", () => {
    const result = recommendNextLoad([sets(60, 6, 3)], "6", "2", {
      age: 22,
      exercise: { name: "Przysiad" },
    });

    expect(result?.mode).toBe("repeat");
    expect(result?.weightKg).toBe(60);
  });

  it("chroni świeżość w MD-1 nawet przy dobrych wynikach", () => {
    const result = recommendNextLoad(
      [sets(60, 6, 4), sets(60, 6, 4)],
      "6",
      "2",
      {
        age: 22,
        mdLabel: "MD-1",
        exercise: { name: "Przysiad" },
      },
    );

    expect(result?.mode).toBe("repeat");
    expect(result?.reason).toContain("świeżość");
  });

  it("nie zwiększa obciążenia młodemu zawodnikowi bez pełnego nadzoru", () => {
    const result = recommendNextLoad(
      [sets(20, 10, 4), sets(20, 10, 4)],
      "8",
      "2",
      {
        age: 12,
        supervisionLevel: "some",
        exercise: { name: "Goblet squat" },
      },
    );

    expect(result?.mode).toBe("repeat");
    expect(result?.reason).toContain("nadzór");
  });

  it("utrzymuje ciężar, gdy najmniejszy dostępny skok byłby zbyt duży", () => {
    const result = recommendNextLoad(
      [sets(20, 10, 3), sets(20, 10, 3)],
      "8",
      "2",
      {
        age: 17,
        gymExperienceLevel: "beginner",
        smallestIncrementKg: 2.5,
        exercise: { name: "Wyciskanie hantli" },
      },
    );

    expect(result?.mode).toBe("repeat");
    expect(result?.weightKg).toBe(20);
  });

  it("zapisuje decyzję akceptacji albo odłożenia bez danych zdrowotnych", () => {
    const values = new Map<string, string>();
    saveStrengthProgressionDecision(
      "user-1",
      {
        sessionId: "session-1",
        exerciseKey: "squat",
        decision: "repeat",
        currentWeightKg: 60,
        proposedWeightKg: 62.5,
        decidedAt: "2026-09-20T10:00:00.000Z",
      },
      { setItem: (key, value) => values.set(key, value) },
    );

    expect([...values.values()][0]).toContain('"decision":"repeat"');
    expect([...values.values()][0]).not.toContain("pain");
  });
});
