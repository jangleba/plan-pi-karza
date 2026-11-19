import { PL_PLACES } from "./places.ts";

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Odległość po kuli ziemskiej (km), z środka miejscowości do środka miejscowości – zawsze PRZYBLIŻONA. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
