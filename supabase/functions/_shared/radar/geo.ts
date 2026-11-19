import { PL_PLACES } from "./places.ts";

export { haversineKm } from "./distance.ts";

/** Klucz porównawczy nazwy: małe litery, bez polskich znaków, spacji i znaków interpunkcyjnych. */
export function placeKey(s: string): string {
  return s.toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

export interface Place { name: string; lat: number; lon: number; pop: number }

const byKey = new Map<string, Place>();
for (const [name, lat, lon, pop] of PL_PLACES) {
  const k = placeKey(name);
  if (!byKey.has(k)) byKey.set(k, { name, lat, lon, pop });
}

/** Współrzędne miejscowości po nazwie (bez zgadywania: nieznana nazwa → null). */
export function lookupPlace(name: string | null | undefined): Place | null {
  if (!name) return null;
  return byKey.get(placeKey(name)) ?? null;
}

/** Podpowiedzi do wyboru miejscowości: najpierw początek nazwy, potem fragment; najludniejsze najpierw. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const k = placeKey(query);
  if (k.length < 2) return [];
  const starts: Place[] = [], contains: Place[] = [];
  for (const [key, p] of byKey) {
    if (key.startsWith(k)) starts.push(p); else if (key.includes(k)) contains.push(p);
  }
  const byPop = (a: Place, b: Place) => b.pop - a.pop || a.name.localeCompare(b.name, "pl");
  return [...starts.sort(byPop), ...contains.sort(byPop)].slice(0, limit);
}
