import type { ListingKind } from "./lib";
import { scoped } from "../lib/store";

export const RADII = [25, 50, 100, 200, null] as const;
export type Radius = (typeof RADII)[number];

export interface RadarPrefs {
  place: { name: string; lat: number; lon: number } | null;
  /** null = cała Polska. */
  radiusKm: Radius;
  /** Pusta lista = wszystkie rodzaje. */
  kinds: ListingKind[];
}

export const DEFAULT_PREFS: RadarPrefs = { place: null, radiusKm: 100, kinds: [] };

const KEY = "radarPrefs";

export function loadPrefs(): RadarPrefs {
  try {
    const v = JSON.parse(scoped.getItem(KEY) ?? "null") as Partial<RadarPrefs> | null;
    if (!v) return DEFAULT_PREFS;
    const place = v.place && typeof v.place.lat === "number" && typeof v.place.lon === "number" && typeof v.place.name === "string" ? v.place : null;
    const radiusKm = (RADII as readonly unknown[]).includes(v.radiusKm) ? (v.radiusKm as Radius) : 100;
    return { place, radiusKm, kinds: Array.isArray(v.kinds) ? v.kinds : [] };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: RadarPrefs): void {
  try { scoped.setItem(KEY, JSON.stringify(p)); } catch { /* brak pamięci */ }
}
