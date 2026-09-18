import type { Profile } from "./types";

export interface PrivacyStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

const LEGACY_UNSCOPED_PREFIXES = [
  "ballwise:fuel-protocol:",
  "loadwise:sprint-progress:",
] as const;

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:/i;

function isUserScopedProgressKey(key: string, prefix: string): boolean {
  return UUID_PREFIX.test(key.slice(prefix.length));
}

/**
 * Removes every device-side cache that can contain data belonging to a user.
 * Legacy Fuel and sprint keys did not contain a user id, so they are removed
 * for all accounts to prevent data crossing between accounts on a shared phone.
 */
export function clearLocalUserData(
  userId: string,
  storage: PrivacyStorage | null =
    typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage || !userId) return;

  const exactKeys = new Set([
    `loadwise:v3:${userId}`,
    `loadwise:boot:v2:${userId}`,
    `loadwise:training-queue:v1:${userId}`,
    `ballwise:reactive:v1:${userId}`,
  ]);
  const scopedPrefixes = [
    `ballwise:fuel-protocol:${userId}:`,
    `loadwise:sprint-progress:${userId}:`,
  ];

  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => Boolean(key),
    );
    for (const key of keys) {
      if (
        exactKeys.has(key) ||
        scopedPrefixes.some((prefix) => key.startsWith(prefix)) ||
        LEGACY_UNSCOPED_PREFIXES.some((prefix) =>
          key.startsWith(prefix) && !isUserScopedProgressKey(key, prefix),
        )
      ) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Niedostępny localStorage nie może zablokować wylogowania ani usunięcia konta.
  }
}

export function profileWithoutHealthData(profile: Profile): Profile {
  return {
    ...profile,
    healthPersonalizationEnabled: false,
    painInjury: false,
    painLocations: [],
    injuryHistory: [],
    fuelAllergyStatus: "unconfirmed",
    foodAllergies: [],
    foodIntolerances: [],
  };
}

export function profileWithoutFuelPrecision(profile: Profile): Profile {
  return {
    ...profile,
    fuelPrecisionEnabled: false,
    weightKg: null,
  };
}
