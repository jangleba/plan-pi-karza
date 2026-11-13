import { describe, expect, it } from "vitest";
import { canonicalExerciseName, formatRestValue, restLine } from "./sessionPresentation";
import { skipRoundLabel } from "./skipRounds";

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
