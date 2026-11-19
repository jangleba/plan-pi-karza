import { qualifySession } from "./eligibility.ts";
import { listingFreshness, sessionStartMs, type ExpiryReason } from "./freshness.ts";
import type { PlayerFacts, QualResult, Qualification, RadarListing, RadarSession, ReasonCode } from "./types.ts";

export interface Evaluation {
  listing: RadarListing;
  live: boolean;
  expiry?: ExpiryReason;
  result: Qualification;
  reasons: ReasonCode[];
  /** Sesje, na które zawodnik się kwalifikuje (puste dla bezterminowych – wtedy `indefiniteMatch`). */
  matching: Array<{ session: RadarSession; qual: QualResult }>;
  indefiniteMatch: QualResult | null;
  distanceKm: number | null;
  /** Najbliższy początek pasującej sesji (ms); Infinity dla bezterminowych. */
  nextStartMs: number;
}

/** Dopasowanie jednego ogłoszenia do zawodnika: aktualność, potem kwalifikacja sesja po sesji. */
export function evaluateListing(l: RadarListing, facts: PlayerFacts, nowMs: number): Evaluation {
  const base = { listing: l, matching: [] as Evaluation["matching"], indefiniteMatch: null as QualResult | null, distanceKm: null as number | null, nextStartMs: Infinity };
  const f = listingFreshness(l, nowMs);
  if (!f.live) return { ...base, live: false, expiry: f.reason, result: "NO_MATCH", reasons: [] };

  if (l.indefinite) {
    const q = qualifySession(l, null, facts);
    return { ...base, live: true, result: q.result, reasons: q.reasons, distanceKm: q.distanceKm, indefiniteMatch: q.result === "MATCH" ? q : null };
  }
  const all = f.liveSessions.map((session) => ({ session, qual: qualifySession(l, session, facts) }));
  const matching = all.filter((x) => x.qual.result === "MATCH").sort((a, b) => sessionStartMs(a.session) - sessionStartMs(b.session));
  if (matching.length) {
    return { ...base, live: true, result: "MATCH", reasons: [], matching, distanceKm: matching[0]!.qual.distanceKm, nextStartMs: sessionStartMs(matching[0]!.session) };
  }
  const needs = all.filter((x) => x.qual.result === "NEEDS_INFORMATION");
  const pick = needs[0] ?? all[0];
  return { ...base, live: true, result: needs.length ? "NEEDS_INFORMATION" : "NO_MATCH", reasons: pick?.qual.reasons ?? [], distanceKm: pick?.qual.distanceKm ?? null };
}

/** Do „Dla Ciebie”: wyłącznie MATCH aktualnych ofert. */
export const matchesOnly = (evals: Evaluation[]): Evaluation[] => evals.filter((e) => e.live && e.result === "MATCH");

export type SortKey = "distance" | "date";

/** Sortowanie PO kwalifikacji: domyślnie odległość (nieznana na końcu), potem najbliższy termin, na końcu stabilnie po id. */
export function sortEvaluations(evals: Evaluation[], key: SortKey = "distance"): Evaluation[] {
  const dist = (e: Evaluation) => e.distanceKm ?? Infinity;
  const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);
  return [...evals].sort((a, b) =>
    (key === "distance" ? cmp(dist(a), dist(b)) || cmp(a.nextStartMs, b.nextStartMs) : cmp(a.nextStartMs, b.nextStartMs) || cmp(dist(a), dist(b)))
    || a.listing.id.localeCompare(b.listing.id));
}
