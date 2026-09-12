import type { LoadwiseState } from "./types";
import type { RunningActivity } from "@/lib/running/types";
import { PLAN_ENGINE_VERSION } from "./planVersion";

const BOOT_CACHE_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface BootCacheEnvelope {
  version: number;
  engineVersion: string;
  savedAt: number;
  state: LoadwiseState;
}

function cacheKey(userId: string) {
  return `loadwise:boot:v${BOOT_CACHE_VERSION}:${userId}`;
}

function compactRunningActivity(activity: RunningActivity): RunningActivity {
  return { ...activity, route: [], splits: [], intervalResults: [] };
}

export function loadBootState(userId: string): LoadwiseState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Partial<BootCacheEnvelope>;
    if (
      envelope.version !== BOOT_CACHE_VERSION ||
      envelope.engineVersion !== PLAN_ENGINE_VERSION ||
      typeof envelope.savedAt !== "number" ||
      Date.now() - envelope.savedAt > MAX_AGE_MS ||
      !envelope.state ||
      !Array.isArray(envelope.state.plan) ||
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
    const runningActivities = Object.fromEntries(
      Object.entries(state.runningActivities).map(([id, activity]) => [
        id,
        compactRunningActivity(activity),
      ]),
    );
    const envelope: BootCacheEnvelope = {
      version: BOOT_CACHE_VERSION,
      engineVersion: PLAN_ENGINE_VERSION,
      savedAt: Date.now(),
      state: {
        ...state,
        history: state.history.slice(0, 120),
        runningActivities,
        equipmentNotice: null,
      },
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
  } catch {
    // Ignore unavailable browser storage.
  }
}
