import type { Profile } from "./types";

/** The athlete's three separate food lists, written as they are in the profile — never reset. */
export function foodSafetyRow(profile: Profile) {
  const health = Boolean(profile.healthPersonalizationEnabled);
  const clean = (values: string[] | undefined) =>
    [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))].slice(0, 40);
  const allergies = health ? clean(profile.foodAllergies) : [];
  return {
    fuel_allergy_status: health
      ? allergies.length
        ? ("has_allergies" as const)
        : profile.fuelAllergyStatus === "confirmed_none"
          ? ("confirmed_none" as const)
          : ("unconfirmed" as const)
      : ("unconfirmed" as const),
    food_allergies: allergies,
    food_intolerances: health ? clean(profile.foodIntolerances) : [],
    food_exclusions: clean(profile.foodExclusions),
  };
}
