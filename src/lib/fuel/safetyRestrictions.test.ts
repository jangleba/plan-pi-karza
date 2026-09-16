import { describe, expect, it } from "vitest";
import { evaluateMeal } from "./engine";
import { parseMeal } from "./mealParser";
import type { FuelAthleteContext, FuelRequest, FuelSessionInput } from "./types";

const sprint: FuelSessionInput = {
  kind: "speed",
  intensity: "wysoka",
  durationMin: 65,
  minutesToStart: null,
  title: "Sprint – akceleracja",
  subtitle: "Szybkość",
  date: "2026-08-04",
  startClock: null,
  dayLabel: "Dzisiaj",
};

function athlete(partial: Partial<FuelAthleteContext> = {}): FuelAthleteContext {
  return {
    age: 17,
    position: null,
    level: null,
    goal: null,
    restrictions: [],
    allergyStatus: "confirmed_none",
    allergies: [],
    intolerances: [],
    exclusions: [],
    ...partial,
  };
}

function req(text: string, ath: FuelAthleteContext): FuelRequest {
  return {
    session: sprint,
    athlete: ath,
    meal: parseMeal(text),
    portion: "normalna",
    timeBucket: "60_120",
    onlyThis: false,
  };
}

describe("FuelWise — bezpieczeństwo zgłoszonych ograniczeń", () => {
  it("blokuje zgłoszoną nietolerancję obecną w posiłku", () => {
    const res = evaluateMeal(
      req("mleko z płatkami i banan", athlete({ intolerances: ["mleko"] })),
    );
    expect(res?.safetyBlocked).toBe(true);
    expect(res?.ruleId).toBe("DECLARED_INTOLERANCE_PRESENT_V1");
  });

  it("blokuje składnik z listy wykluczeń", () => {
    const res = evaluateMeal(req("ryż z kurczakiem", athlete({ exclusions: ["kurczak"] })));
    expect(res?.safetyBlocked).toBe(true);
    expect(res?.ruleId).toBe("DECLARED_EXCLUSION_PRESENT_V1");
  });

  it("alergia ma pierwszeństwo przed nietolerancją", () => {
    const res = evaluateMeal(
      req("mleko z płatkami", athlete({ allergies: ["mleko"], intolerances: ["mleko"] })),
    );
    expect(res?.ruleId).toBe("DECLARED_ALLERGEN_PRESENT_V1");
  });

  it("nie blokuje posiłku bez zgłoszonych składników", () => {
    const res = evaluateMeal(
      req("ryż z kurczakiem", athlete({ intolerances: ["mleko"], exclusions: ["wieprzowina"] })),
    );
    expect(res?.safetyBlocked).toBeUndefined();
  });

  it("nieznany wiek jest traktowany jak niepełnoletni przy kofeinie", () => {
    const res = evaluateMeal(req("kawa i banan", athlete({ age: null })));
    expect(res?.safetyBlocked).toBe(true);
    expect(res?.ruleId).toBe("MINOR_CAFFEINE_BLOCK_V1");
  });

  it("pełnoletni zawodnik nie jest blokowany za kofeinę", () => {
    const res = evaluateMeal(req("kawa i banan", athlete({ age: 24 })));
    expect(res?.ruleId).not.toBe("MINOR_CAFFEINE_BLOCK_V1");
  });
});
