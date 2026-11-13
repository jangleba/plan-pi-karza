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
