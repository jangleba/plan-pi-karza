import type { PainLocation } from "./types";

const VALID_PAIN_LOCATIONS = new Set<PainLocation>([
  "knee",
  "back",
  "ankle",
  "hamstring",
  "groin",
  "hip",
  "shoulder",
  "other",
]);

/**
 * Odtwarza wyłącznie znane lokalizacje bólu z zapisanego onboardingu.
 * Nieznane lub uszkodzone wartości są pomijane zamiast trafiać do silnika.
 */
export function normalizePersistedPainLocations(value: unknown): PainLocation[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value.filter(
        (location): location is PainLocation =>
          typeof location === "string" &&
          VALID_PAIN_LOCATIONS.has(location as PainLocation),
      ),
    ),
  );
}
