import type { Profile } from "../engine";
import type { PrivateProfile } from "../lib/private";
import type { Evaluation, ListingKind, PlayerFacts, SortKey } from "./lib";
import { LISTING_KINDS, matchesOnly, sortEvaluations } from "./lib";
import { POSITION_LABEL } from "../engine/profile";
import { RADII, type RadarPrefs, type Radius } from "./prefs";

/** Dane zawodnika do dopasowania, z istniejącego profilu (bez duplikowania daty urodzenia) i wyborów radaru. */
export function playerFacts(profile: Profile, birth: PrivateProfile, prefs: RadarPrefs): PlayerFacts {
  return {
    birthDate: birth.birthDate ?? null,
    birthYear: birth.birthDate ? null : birth.birthYear ?? null,
    position: profile.position ?? null,
    place: prefs.place,
    radiusKm: prefs.radiusKm,
    kinds: prefs.kinds,
  };
}

export const hasBirth = (f: PlayerFacts) => !!(f.birthDate || f.birthYear);

/** Czego brakuje, by dopasowanie było możliwe (stan „brakuje danych profilu”). */
export function missingProfile(f: PlayerFacts): Array<"birth" | "place"> {
  const m: Array<"birth" | "place"> = [];
  if (!hasBirth(f)) m.push("birth");
  if (f.radiusKm !== null && !f.place) m.push("place");
  return m;
}

export const radiusLabel = (r: Radius) => (r === null ? "cała Polska" : `${r} km`);

/** Kolejny większy promień do zaproponowania przy braku ofert (nie rusza wieku). */
export function nextRadius(r: Radius): Radius | undefined {
  const i = RADII.indexOf(r);
  return i >= 0 && i < RADII.length - 1 ? RADII[i + 1] : undefined;
}

/** Faktycznie użyte kryteria, w kolejności z ekranu. */
export function criteriaParts(f: PlayerFacts): string[] {
  const parts: string[] = [];
  const year = f.birthDate ? f.birthDate.slice(0, 4) : f.birthYear ? String(f.birthYear) : null;
  if (year) parts.push(`rocznik ${year}`);
  if (f.position) parts.push(POSITION_LABEL[f.position].toLowerCase());
  parts.push(f.radiusKm === null ? "cała Polska" : f.place ? `${f.place.name} ${f.radiusKm} km` : `${f.radiusKm} km`);
  parts.push(f.kinds.length ? f.kinds.map((k) => LISTING_KINDS.find(([x]) => x === k)![1].toLowerCase()).join(", ") : "wszystkie rodzaje");
  return parts;
}

export interface Health { lastRefreshOkAt: string | null; lastDiscoverOkAt: string | null; lastExpireOkAt: string | null; failingSources: number; approvedSources: number }

/** Awaria aktualizacji źródeł: brak udanego odświeżenia od ponad 24 h przy aktywnych źródłach albo źródła z serią błędów. */
export function sourcesDegraded(h: Health | null | undefined, nowMs: number): boolean {
  if (!h || h.approvedSources === 0) return false;
  const last = h.lastRefreshOkAt ? Date.parse(h.lastRefreshOkAt) : null;
  return h.failingSources > 0 || last === null || nowMs - last > 24 * 3_600_000;
}

export interface ListFilters { kinds: ListingKind[]; freeOnly: boolean; sort: SortKey }

/** Lista pełna: tylko MATCH aktualnych ofert, filtry rodzaju i kosztu (bezpłatne tylko z potwierdzeniem), sortowanie po kwalifikacji. */
export function visibleList(evals: Evaluation[], f: ListFilters): Evaluation[] {
  let list = matchesOnly(evals);
  if (f.kinds.length) list = list.filter((e) => f.kinds.includes(e.listing.kind));
  if (f.freeOnly) list = list.filter((e) => e.listing.costState === "free");
  return sortEvaluations(list, f.sort);
}

/** Czy brak ofert wynika z braków w profilu zawodnika (a nie z braku dopasowań). */
export function profileGaps(evals: Evaluation[]): boolean {
  return evals.some((e) => e.live && e.result === "NEEDS_INFORMATION" && e.reasons.some((r) => ["birth_year_missing", "needs_birthday", "position_missing", "place_missing"].includes(r)));
}
