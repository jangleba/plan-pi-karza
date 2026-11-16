import type { Profile } from "./types";

type ExistingHealth = Pick<
  Profile,
  "healthPersonalizationEnabled" | "painInjury" | "painLocations"
>;

/** Editing general answers does not answer the separate health questions again. */
export function healthFieldsForOnboarding(
  existing: ExistingHealth | null | undefined,
  healthConsent: boolean,
): Pick<Profile, "painInjury" | "painLocations"> {
  if (!healthConsent || existing?.healthPersonalizationEnabled !== true)
    return { painInjury: false, painLocations: [] };
  return {
    painInjury: existing.painInjury,
    painLocations: [...(existing.painLocations ?? [])],
  };
}

type FoodSafetyFields = Pick<
  Profile,
  "fuelAllergyStatus" | "foodAllergies" | "foodIntolerances" | "foodExclusions"
>;

/** General profile edits preserve food answers; withdrawing health consent only clears health data. */
export function foodSafetyFieldsForOnboarding(
  existing:
    (Partial<FoodSafetyFields> & Pick<Profile, "healthPersonalizationEnabled">) | null | undefined,
  healthConsent: boolean,
): FoodSafetyFields {
  const keepHealth = healthConsent && existing?.healthPersonalizationEnabled === true;
  return {
    fuelAllergyStatus: keepHealth ? (existing.fuelAllergyStatus ?? "unconfirmed") : "unconfirmed",
    foodAllergies: keepHealth ? [...(existing.foodAllergies ?? [])] : [],
    foodIntolerances: keepHealth ? [...(existing.foodIntolerances ?? [])] : [],
    foodExclusions: [...(existing?.foodExclusions ?? [])],
  };
}
