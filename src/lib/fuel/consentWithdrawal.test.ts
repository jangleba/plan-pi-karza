import { describe, expect, it } from "vitest";
import type { Profile } from "../loadwise/types";
import {
  profileWithoutFuelPrecision,
  profileWithoutHealthData,
  redactFuelHealthData,
} from "../loadwise/localPrivacy";
import { foodSafetyRow } from "../loadwise/foodSafety";
import { emptyFuelData, fuelStorageKey, readFuelData } from "./experience";
import { fuelDayTargets } from "./dayTargets";
import { fuelRestrictionTerms } from "./practical";

/** Withdrawing a consent stops the data being used: profile, device cache and next write. */
class Memory {
  values = new Map<string, string>();
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
}
const profile = {
  age: 20,
  healthPersonalizationEnabled: true,
  fuelAllergyStatus: "has_allergies",
  foodAllergies: ["orzechy"],
  foodIntolerances: ["laktoza"],
  foodExclusions: ["grzyby"],
  fuelPrecisionEnabled: true,
  weightKg: 70,
} as Profile;
const safetyOf = (p: Profile) => ({
  status: p.fuelAllergyStatus ?? "unconfirmed",
  allergies: p.foodAllergies ?? [],
  intolerances: p.foodIntolerances ?? [],
  exclusions: p.foodExclusions ?? [],
});

describe("consent withdrawal in Fuel", () => {
  it("health data: allergies and intolerances leave the profile, the restriction list and the next write", () => {
    const after = profileWithoutHealthData(profile);
    const terms = fuelRestrictionTerms(emptyFuelData().preferences, safetyOf(after));
    expect(terms).toEqual(["grzyby"]);
    expect(foodSafetyRow(after)).toEqual({
      fuel_allergy_status: "unconfirmed",
      food_allergies: [],
      food_intolerances: [],
      food_exclusions: ["grzyby"],
    });
  });

  it("health data: the device copy loses the tolerance answer and stomach feedback, keeps meals", () => {
    const store = new Memory();
    const data = emptyFuelData();
    data.preferences.preExerciseTolerance = "sensitive";
    data.preferences.nonTrainingActivity = "high";
    const now = Date.now();
    data.entries = [
      {
        id: "e",
        recipeId: "r",
        title: "Owsianka",
        lines: [{ foodId: "oats", grams: 60 }],
        contextKey: "k",
        status: "eaten",
        createdAt: now,
        eatenAt: now,
        fraction: 1,
        feedback: "heavy",
      },
    ];
    store.setItem(fuelStorageKey("u"), JSON.stringify(data));
    expect(redactFuelHealthData("u", store)).toBe(true);
    const read = readFuelData(store, "u", now);
    expect(read.preferences.preExerciseTolerance).toBeUndefined();
    expect(read.preferences.nonTrainingActivity).toBe("high");
    expect(read.entries[0]).toMatchObject({ title: "Owsianka", feedback: null });
    expect(redactFuelHealthData("u", store)).toBe(false);
  });

  it("Fuel Precision: without the body mass the day falls back to portions at once", () => {
    const after = profileWithoutFuelPrecision(profile);
    const targets = fuelDayTargets({
      age: after.age,
      weightKg: after.fuelPrecisionEnabled ? (after.weightKg ?? null) : null,
      nonTrainingActivity: "low",
      activities: [],
      previous: null,
      matchToday: false,
      matchTomorrow: false,
    });
    expect(targets.precision).toBe("portions");
    expect(targets.kcal).toBeNull();
  });
});
