import type { LoadwiseState, Profile } from "./types";
import { purgeTrainingQueue, redactTrainingQueueHealthData } from "./offlineTrainingQueue";

export interface PrivacyStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem?(key: string): string | null;
  removeItem(key: string): void;
}

const LEGACY_UNSCOPED_PREFIXES = ["ballwise:fuel-protocol:", "loadwise:sprint-progress:"] as const;

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
  storage: PrivacyStorage | null = typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage || !userId) return;

  const exactKeys = new Set([
    `ballwise:offline-owner:v1:${userId}`,
    `ballwise:module-backup:device:v1:${userId}`,
    `ballwise:billing:v1:${userId}`,
    `ballwise:legal-status:v1:${userId}`,
    `loadwise:v3:${userId}`,
    `loadwise:boot:v2:${userId}`,
    `loadwise:training-queue:v1:${userId}`,
    `ballwise:reactive:v1:${userId}`,
    `ballwise:iq:v2:${userId}`,
    `ballwise:iq:journeys:v1:${userId}`,
    `ballwise:iq:journeys:v1:${userId}:draft`,
    `ballwise.browser-lab.v1:${encodeURIComponent(userId)}`,
    `ballwise:lab:results:${userId}`,
    `ballwise:fuel:v3:${userId}`,
    `ballwise:fuel-reminders:v1:${userId}`,
  ]);
  const scopedPrefixes = [
    `ballwise:run-draft:v1:${encodeURIComponent(userId)}:`,
    `ballwise:module-backup:state:v1:${userId}:`,
    `ballwise:reactive:v1:${userId}:`,
    `ballwise:fuel-protocol:${userId}:`,
    `loadwise:sprint-progress:${userId}:`,
    `ballwise:daily-plan-checkin:v2:${userId}:`,
    `ballwise:warmup:${userId}:`,
    `ballwise:recovery:${userId}:`,
  ];

  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => Boolean(key),
    );
    if (storage.getItem?.("ballwise:offline-owner:active") === userId)
      storage.removeItem("ballwise:offline-owner:active");
    for (const key of keys) {
      if (
        exactKeys.has(key) ||
        scopedPrefixes.some((prefix) => key.startsWith(prefix)) ||
        (key.startsWith("loadwise:details:v1:") &&
          key.split(":")[4] === encodeURIComponent(userId)) ||
        LEGACY_UNSCOPED_PREFIXES.some(
          (prefix) => key.startsWith(prefix) && !isUserScopedProgressKey(key, prefix),
        )
      ) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Niedostępny localStorage nie może zablokować wylogowania ani usunięcia konta.
  }
  if (typeof window !== "undefined") {
    void purgeTrainingQueue(userId);
    try {
      window.sessionStorage.removeItem(`ballwise:legal-status:v1:${userId}`);
    } catch {
      /* no storage */
    }
    window.dispatchEvent(new CustomEvent("ballwise:clear-user-data", { detail: { userId } }));
  }
}

/** Logout drops cached server state; account deletion separately wipes local histories/queue. */
export function clearLocalSessionData(
  userId: string,
  storage: PrivacyStorage | null = typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage || !userId) return;
  try {
    storage.removeItem(`loadwise:v3:${userId}`);
    storage.removeItem(`loadwise:boot:v2:${userId}`);
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (
        key &&
        LEGACY_UNSCOPED_PREFIXES.some(
          (prefix) => key.startsWith(prefix) && !isUserScopedProgressKey(key, prefix),
        )
      )
        storage.removeItem(key);
    }
  } catch {
    /* Storage restrictions must not prevent logout. */
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

/** Keeps result measurements, but immediately removes optional health text and readiness. */
export function stateWithoutHealthData(state: LoadwiseState): LoadwiseState {
  return {
    ...state,
    profile: state.profile ? profileWithoutHealthData(state.profile) : null,
    readiness: {},
    completions: Object.fromEntries(
      Object.entries(state.completions).map(([key, value]) => [key, { ...value, notes: "" }]),
    ),
    history: state.history.map((row) => ({ ...row, notes: "" })),
  };
}

export async function clearLocalHealthData(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`loadwise:boot:v2:${userId}`);
    const prefix = `ballwise:daily-plan-checkin:v2:${userId}:`;
    for (const key of Object.keys(window.localStorage))
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
  } catch {
    /* Queue redaction still has to run if storage is blocked. */
  }
  await redactTrainingQueueHealthData(userId);
}

/** A registry of account-owned local data, also used by export. Never inspect other users' keys. */
export function belongsToLocalUser(key: string, userId: string): boolean {
  const exact = [
    `loadwise:v3:${userId}`,
    `loadwise:boot:v2:${userId}`,
    `loadwise:training-queue:v1:${userId}`,
    `ballwise:billing:v1:${userId}`,
    `ballwise:legal-status:v1:${userId}`,
    `ballwise:reactive:v1:${userId}`,
    `ballwise:iq:v2:${userId}`,
    `ballwise:iq:journeys:v1:${userId}`,
    `ballwise:iq:journeys:v1:${userId}:draft`,
    `ballwise.browser-lab.v1:${encodeURIComponent(userId)}`,
    `ballwise:lab:results:${userId}`,
    `ballwise:fuel:v3:${userId}`,
    `ballwise:fuel-reminders:v1:${userId}`,
  ];
  return (
    key === `ballwise:offline-owner:v1:${userId}` ||
    key.startsWith(`ballwise:run-draft:v1:${encodeURIComponent(userId)}:`) ||
    key === `ballwise:module-backup:device:v1:${userId}` ||
    key.startsWith(`ballwise:module-backup:state:v1:${userId}:`) ||
    exact.includes(key) ||
    [
      `ballwise:reactive:v1:${userId}:`,
      `ballwise:fuel-protocol:${userId}:`,
      `loadwise:sprint-progress:${userId}:`,
      `ballwise:daily-plan-checkin:v2:${userId}:`,
      `ballwise:warmup:${userId}:`,
      `ballwise:recovery:${userId}:`,
    ].some((prefix) => key.startsWith(prefix)) ||
    (key.startsWith("loadwise:details:v1:") && key.split(":")[4] === encodeURIComponent(userId))
  );
}

export function exportLocalUserData(
  userId: string,
): Record<string, { raw: string; value: unknown; readable: boolean }> {
  const result: Record<string, { raw: string; value: unknown; readable: boolean }> = {};
  if (typeof window === "undefined") return result;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (
        !belongsToLocalUser(key, userId) &&
        !(key === "ballwise:offline-owner:active" && storage.getItem(key) === userId)
      )
        continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      try {
        result[key] = { raw, value: JSON.parse(raw), readable: true };
      } catch {
        result[key] = { raw, value: null, readable: false };
      }
    }
  }
  return result;
}
