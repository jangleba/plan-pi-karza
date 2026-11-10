import { describe, expect, it } from "vitest";
import { resolveExerciseAnimation } from "@/lib/trainingCoach/animationCatalog";
import { generateFootballSpeedSession } from "./footballSpeedSessionEngine";
import { canonicalExerciseName, formatRestValue, restLine } from "./sessionPresentation";
import { skipRoundLabel } from "./skipRounds";
import type { Profile } from "./types";

describe("rundy skipów", () => {
  it("opisuje rundę i rytm z zapisanego wariantu", () => {
    expect(skipRoundLabel("a_skip", "gather")).toBe("runda 1 · z dostawieniem");
    expect(skipRoundLabel("d_skip", "continuous")).toBe("runda 2 · ciągły");
    // Stary zapis nie mówi, który rytm — bez zgadywania techniki.
    expect(skipRoundLabel("b_skip", "step_in")).toBe("runda 1");
    expect(skipRoundLabel("a_skip", undefined)).toBeNull();
    expect(skipRoundLabel("a_skip_add_step", "gather")).toBeNull();
  });

  it("dopisuje rundę do nazwy tylko dla skipów A–D", () => {
    expect(
      canonicalExerciseName({
        id: "1",
        exerciseId: "c_skip",
        name: "Skip C",
        animationVariant: "gather",
      }),
    ).toBe("Skip C — runda 1 · z dostawieniem");
    expect(canonicalExerciseName({ id: "2", exerciseId: "c_skip", name: "Skip C" })).toBe("Skip C");
  });

  it("pierwsza runda z silnika ma jeden rytm: animacja bez wyboru techniki", () => {
    const result = generateFootballSpeedSession({
      profile: {
        name: "Test",
        age: 24,
        position: "midfielder",
        level: "advanced",
        clubTrainingDays: [],
        individualTrainingDays: [2, 4, 6],
        usualMatchDay: null,
        matchDate: null,
        equipment: [],
        painInjury: false,
        onboardingComplete: true,
        createdAt: "2026-01-01",
        hasSprintSpace: true,
      } as unknown as Profile,
      date: "2026-08-20",
      family: "acceleration",
    });
    const primers = result.exercises.filter((e) => e.role === "primer");
    expect(primers).toHaveLength(8);
    for (const row of primers.slice(0, 4)) {
      expect(row.variant).toBe("gather");
      expect(row.coachingCuesPl[0]).toMatch(/^Z dostawieniem:/);
      expect(row.coachingCuesPl.join(" ")).not.toMatch(/albo|lub dodatkowe odbicie/i);
      const animation = resolveExerciseAnimation({
        id: row.exerciseId,
        exerciseId: row.exerciseId,
        name: row.name,
        animationVariant: row.variant,
      });
      expect(animation?.needsChoice).toBeFalsy();
      expect(animation?.id).toBe(`review:${row.exerciseId}:gather`);
    }
    for (const row of primers.slice(4)) expect(row.variant).toBe("continuous");
  });
});

describe("linia przerwy", () => {
  it("nie dubluje słowa „Przerwa”", () => {
    expect(restLine("Przerwa 30 s")).toBe("Przerwa 30 s");
    expect(restLine("Przerwa: 45 s")).toBe("Przerwa 45 s");
    expect(restLine("Pełna przerwa 2 min")).toBe("Przerwa 2 min (pełny odpoczynek)");
    expect(restLine("60 s")).toBe("Przerwa 60 s");
    expect(restLine("Bez przerw — płynne przejście do drilli")).toBe(
      "Bez przerw — płynne przejście do drilli",
    );
    expect(restLine("—")).toBeNull();
    expect(restLine(undefined)).toBeNull();
    expect(formatRestValue("Pełna przerwa 90–150 s")).toBe("90–150 s (pełny odpoczynek)");
  });
});
