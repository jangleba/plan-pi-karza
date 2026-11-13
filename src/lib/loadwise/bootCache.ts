import type { LoadwiseState } from "./types";
import type { RunningActivity } from "@/lib/running/types";

// v3: the week-planning engine was removed; caches from v2 carried its plan.
const BOOT_CACHE_VERSION = 3;
const LEGACY_CACHE_VERSIONS = [2];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface BootCacheEnvelope {
  version: number;
  savedAt: number;
  state: LoadwiseState;
}

function cacheKey(userId: string, version = BOOT_CACHE_VERSION) {
  return `loadwise:boot:v${version}:${userId}`;
}

function dropLegacyCaches(userId: string) {
  for (const version of LEGACY_CACHE_VERSIONS)
    window.localStorage.removeItem(cacheKey(userId, version));
}

function compactRunningActivity(activity: RunningActivity): RunningActivity {
  return { ...activity, route: [], splits: [], intervalResults: [] };
}

/** Usuwa bezpośrednie dane zdrowotne i swobodne notatki przed zapisem na urządzeniu. */
export function redactStateForBootCache(state: LoadwiseState): LoadwiseState {
  const runningActivities = Object.fromEntries(
    Object.entries(state.runningActivities).map(([id, activity]) => [
      id,
      compactRunningActivity(activity),
    ]),
  );
  return {
    ...state,
    profile: state.profile
      ? {
          ...state.profile,
          fuelAllergyStatus: "unconfirmed",
          foodAllergies: [],
          foodIntolerances: [],
          painInjury: false,
          painLocations: [],
          injuryHistory: [],
        }
      : null,
    readiness: {},
    completions: Object.fromEntries(
      Object.entries(state.completions).map(([id, completion]) => [
        id,
        { ...completion, notes: "" },
      ]),
    ),
    history: state.history.slice(0, 120).map((item) => ({ ...item, notes: "" })),
    runningActivities,
    equipmentNotice: null,
  };
}

export function loadBootState(userId: string): LoadwiseState | null {
  if (typeof window === "undefined") return null;
  try {
    dropLegacyCaches(userId);
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Partial<BootCacheEnvelope>;
    if (
      envelope.version !== BOOT_CACHE_VERSION ||
      typeof envelope.savedAt !== "number" ||
      !Number.isFinite(envelope.savedAt) ||
      envelope.savedAt > Date.now() ||
      Date.now() - envelope.savedAt > MAX_AGE_MS ||
      !envelope.state ||
      !Array.isArray(envelope.state.plan) ||
      !Array.isArray(envelope.state.history) ||
      ![
        envelope.state.completions,
        envelope.state.readiness,
        envelope.state.runningActivities,
        envelope.state.modifications,
        envelope.state.transitions,
        envelope.state.exerciseReplacements,
      ].every((value) => !!value && typeof value === "object" && !Array.isArray(value)) ||
      !envelope.state.profile?.onboardingComplete
    ) {
      window.localStorage.removeItem(cacheKey(userId));
      return null;
    }
    return envelope.state;
  } catch {
    return null;
  }
}

export function saveBootState(userId: string, state: LoadwiseState): void {
  if (typeof window === "undefined" || !state.profile?.onboardingComplete) return;
  try {
    const envelope: BootCacheEnvelope = {
      version: BOOT_CACHE_VERSION,
      savedAt: Date.now(),
      state: redactStateForBootCache(state),
    };
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(envelope));
  } catch {
    // Cache is only a speed-up. Supabase remains the source of truth.
  }
}

export function clearBootState(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(userId));
    dropLegacyCaches(userId);
  } catch {
    // Ignore unavailable browser storage.
  }
}
