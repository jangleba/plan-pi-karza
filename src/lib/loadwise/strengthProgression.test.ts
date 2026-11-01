import { describe, expect, it } from "vitest";
import type { SetLog } from "./setLogs";
import { previousExerciseSessions, verifyExerciseHistory } from "./setLogHistory";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { SessionCompletion, TrainingExercise } from "./types";
import {
  recommendNextLoad,
  saveStrengthProgressionDecision,
} from "./strengthProgression";

function sets(weightKg: number, reps: number, rir: number): SetLog[] {
  return [1, 2, 3].map((setNumber) => ({ setNumber, weightKg, reps, rir }));
}

const exercise: TrainingExercise = {
  id: "squat", exerciseId: "squat", name: "Przysiad ze sztangą", sets: "3", reps: "6", rir: "2",
};
const adult = {
  age: 22, level: "intermediate" as const, gymExperienceLevel: "intermediate" as const,
  strengthTrainingMonths: 24, movementCompetence: "high" as const,
  smallestIncrementKg: 2.5, exercise,
};
function history(options: {
  loggedSets?: number; plannedSets?: string; completed?: boolean; reps?: number; targetReps?: string;
  status?: SessionCompletion["status"]; missingSnapshot?: boolean; olderWeight?: number; tempo?: string;
} = {}) {
  const sessions = ["newest", "older"];
  const rows = sessions.flatMap((session_id, index) =>
    Array.from({ length: options.loggedSets ?? 3 }, (_, n) => ({
      session_id, set_number: n + 1, weight_kg: index ? options.olderWeight ?? 60 : 60,
      reps: options.reps ?? 6, rir: 3, performed_at: `2026-10-${20 - index}T10:0${n}:00Z`,
    })));
  const completions: Record<string, SessionCompletion> = Object.fromEntries(sessions.map(id => [id, {
    completed: options.completed ?? true, status: options.status ?? "completed", rpe: 6, notes: "",
    executionSnapshot: options.missingSnapshot ? null : sessionFixture({ dbId: id,
      structuredSections: [sectionFixture("main", [{ ...exercise, sets: options.plannedSets ?? "3",
        reps: options.targetReps ?? "6", tempo: options.tempo }])] }),
  }]));
  return verifyExerciseHistory(previousExerciseSessions(rows, "current"), "squat", completions);
}

describe("strength progression", () => {
  it("proponuje mały wzrost dopiero po dwóch stabilnych ekspozycjach", () => {
    const result = recommendNextLoad(
      history(),
      "6",
      "2",
      adult,
    );

    expect(result?.mode).toBe("increase");
    expect(result?.weightKg).toBe(62.5);
  });

  it("nie uznaje dwóch pojedynczych zapisów za ukończone treningi czteroseryjne", () => {
    const result = recommendNextLoad(history({ loggedSets: 1, plannedSets: "4" }), "6", "2",
      { ...adult, exercise: { ...exercise, sets: "4" } });
    expect(result?.mode).toBe("repeat");
    expect(result?.reason).toContain("kompletem");
  });

  it.each([
    { completed: false, status: "started" as const },
    { completed: false, status: "missed" as const },
    { missingSnapshot: true },
  ])("nie zwiększa przy nieukończonym lub nieznanym wykonaniu: %o", options => {
    expect(recommendNextLoad(history(options), "6", "2", adult)?.mode).toBe("repeat");
  });

  it("same stare wpisy serii bez dowodu wykonania nie odblokowują progresji", () => {
    expect(recommendNextLoad([sets(60, 6, 3), sets(60, 6, 3)], "6", "2", adult)?.mode).toBe("repeat");
  });

  it.each([{ targetReps: "8" }, { tempo: "3-1-1" }, { plannedSets: "4", loggedSets: 4 }])(
    "nie porównuje wyników z innej dawki/tempa: %o", options => {
      expect(recommendNextLoad(history(options), "6", "2", adult)?.mode).toBe("repeat");
    },
  );

  it("nie zwiększa drugi raz po pojedynczej ekspozycji nowym ciężarem", () => {
    expect(recommendNextLoad(history({ olderWeight: 57.5 }), "6", "2", adult)?.mode).toBe("repeat");
  });

  it("nie pomija nowszej ekspozycji bez ważnych wyników na rzecz starszych dobrych serii", () => {
    const sessions = history();
    sessions[1].sets = sessions[1].sets.map(set => ({ ...set, reps: null }));
    expect(recommendNextLoad(sessions, "6", "2", adult)?.mode).toBe("repeat");
    sessions[0].sets = [];
    expect(recommendNextLoad(sessions, "6", "2", adult)).toBeNull();
  });

  it("nie ekstrapoluje maksymalnego ciężaru na serię rozgrzewkową lub back-off", () => {
    const sessions = history();
    sessions[0].sets[0].weightKg = 40;
    expect(recommendNextLoad(sessions, "6", "2", adult)?.mode).toBe("repeat");
  });

  it("odróżnia dwa pełne nieudane treningi od braku danych i proponuje redukcję", () => {
    expect(recommendNextLoad(history({ reps: 4 }), "6", "2", adult)?.mode).toBe("reduce");
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
