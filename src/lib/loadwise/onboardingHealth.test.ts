import { describe, expect, it } from "vitest";
import { foodSafetyFieldsForOnboarding, healthFieldsForOnboarding } from "./onboardingHealth";
import type { Profile } from "./types";

describe("health state while saving general onboarding answers", () => {
  const existing: Pick<Profile, "healthPersonalizationEnabled" | "painInjury" | "painLocations"> = {
    healthPersonalizationEnabled: true,
    painInjury: true,
    painLocations: ["knee", "hamstring"],
  };

  it.each([false, true])("starts without inferred pain when new consent is %s", (consent) => {
    expect(healthFieldsForOnboarding(null, consent)).toEqual({
      painInjury: false,
      painLocations: [],
    });
  });

  it("preserves the injury block and locations when editing with consent still active", () => {
    const fields = healthFieldsForOnboarding(existing, true);
    expect(fields).toEqual({ painInjury: true, painLocations: ["knee", "hamstring"] });
    expect(fields.painLocations).not.toBe(existing.painLocations);
    fields.painLocations!.push("ankle");
    expect(existing.painLocations).toEqual(["knee", "hamstring"]);
  });

  it("keeps an existing pain-free profile pain-free", () => {
    expect(
      healthFieldsForOnboarding({ ...existing, painInjury: false, painLocations: [] }, true),
    ).toEqual({ painInjury: false, painLocations: [] });
  });

  it("clears sensitive pain fields when consent is withdrawn", () => {
    expect(healthFieldsForOnboarding(existing, false)).toEqual({
      painInjury: false,
      painLocations: [],
    });
    expect(existing.painInjury).toBe(true);
  });

  it("does not restore stale pain fields when health consent is newly enabled", () => {
    expect(
      healthFieldsForOnboarding({ ...existing, healthPersonalizationEnabled: false }, true),
    ).toEqual({ painInjury: false, painLocations: [] });
  });
});

describe("food safety while saving general onboarding answers", () => {
  const existing = {
    healthPersonalizationEnabled: true,
    fuelAllergyStatus: "has_allergies" as const,
    foodAllergies: ["orzechy"],
    foodIntolerances: ["laktoza"],
    foodExclusions: ["grzyby"],
  };

  it("keeps the separately confirmed allergies, intolerances and exclusions on profile edits", () => {
    const fields = foodSafetyFieldsForOnboarding(existing, true);
    expect(fields).toEqual({
      fuelAllergyStatus: "has_allergies",
      foodAllergies: ["orzechy"],
      foodIntolerances: ["laktoza"],
      foodExclusions: ["grzyby"],
    });
    for (const key of ["foodAllergies", "foodIntolerances", "foodExclusions"] as const)
      expect(fields[key]).not.toBe(existing[key]);
  });

  it("preserves a confirmed absence of allergies", () => {
    expect(
      foodSafetyFieldsForOnboarding(
        { ...existing, fuelAllergyStatus: "confirmed_none", foodAllergies: [] },
        true,
      ).fuelAllergyStatus,
    ).toBe("confirmed_none");
  });

  it("clears allergies and intolerances after withdrawal while keeping ordinary exclusions", () => {
    expect(foodSafetyFieldsForOnboarding(existing, false)).toEqual({
      fuelAllergyStatus: "unconfirmed",
      foodAllergies: [],
      foodIntolerances: [],
      foodExclusions: ["grzyby"],
    });
  });

  it("does not restore stale health lists on new consent", () => {
    expect(
      foodSafetyFieldsForOnboarding({ ...existing, healthPersonalizationEnabled: false }, true),
    ).toEqual({
      fuelAllergyStatus: "unconfirmed",
      foodAllergies: [],
      foodIntolerances: [],
      foodExclusions: ["grzyby"],
    });
  });

  it("initializes new accounts without inferring any food answers", () => {
    expect(foodSafetyFieldsForOnboarding(null, true)).toEqual({
      fuelAllergyStatus: "unconfirmed",
      foodAllergies: [],
      foodIntolerances: [],
      foodExclusions: [],
    });
  });
});
