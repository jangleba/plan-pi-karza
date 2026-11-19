import { haversineKm } from "./geo.ts";
import type {
  AgeLimit, BirthYearRule, Eligibility, PlayerFacts, QualResult, RadarListing, RadarSession, ReasonCode,
} from "./types.ts";

type Tri = true | false | null; // null = nie da się rozstrzygnąć z posiadanych danych

const ymd = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Ukończone lata w dniu `asOf` dla ustalonej daty urodzin w danym roku. W dniu urodzin wiek już się zwiększa. */
function completedYears(b: { y: number; m: number; d: number }, asOf: { y: number; m: number; d: number }, bm: number, bd: number): number {
  const before = asOf.m < bm || (asOf.m === bm && asOf.d < bd);
  return asOf.y - b.y - (before ? 1 : 0);
}

/**
 * Zakres możliwych ukończonych lat [min, max] w dniu `asOfISO`.
 *  – znana pełna data: jedna wartość (dla 29.02 w roku niewysokosowym liczymy obie konwencje: 28.02 i 1.03),
 *  – znany tylko rok: od 1 stycznia do 31 grudnia, więc zwykle dwie wartości,
 *  – brak danych: null.
 */
export function ageRangeOn(facts: Pick<PlayerFacts, "birthDate" | "birthYear">, asOfISO: string): [number, number] | null {
  const a = ymd(asOfISO);
  if (facts.birthDate) {
    const b = ymd(facts.birthDate);
    const variants = b.m === 2 && b.d === 29 && !isLeap(a.y) ? [[2, 28], [3, 1]] : [[b.m, b.d]];
    const ages = variants.map(([bm, bd]) => completedYears(b, a, bm!, bd!));
    return [Math.min(...ages), Math.max(...ages)];
  }
  if (facts.birthYear) {
    const jan = completedYears({ y: facts.birthYear, m: 1, d: 1 }, a, 1, 1);
    const dec = completedYears({ y: facts.birthYear, m: 12, d: 31 }, a, 12, 31);
    return [Math.min(jan, dec), Math.max(jan, dec)];
  }
  return null;
}

export const birthYearOf = (facts: Pick<PlayerFacts, "birthDate" | "birthYear">): number | null =>
  facts.birthDate ? Number(facts.birthDate.slice(0, 4)) : facts.birthYear ?? null;

function ageHolds(op: AgeLimit["op"], age: number, limit: number): boolean {
  switch (op) {
    case "lt": return age < limit;
    case "lte": return age <= limit;
    case "gt": return age > limit;
    case "gte": return age >= limit;
    case "eq": return age === limit;
  }
}

/** true/false tylko wtedy, gdy wynik jest taki sam dla każdego możliwego wieku z zakresu. */
function ageLimitHolds(range: [number, number], l: AgeLimit): Tri {
  const results = new Set<boolean>();
  for (let a = range[0]; a <= range[1]; a++) results.add(ageHolds(l.op, a, l.age));
  return results.size === 1 ? [...results][0]! : null;
}

function yearRuleHolds(r: BirthYearRule, year: number): boolean {
  switch (r.op) {
    case "in": return r.years.includes(year);
    case "range": return year >= r.from && year <= r.to;
    case "gte": return year >= r.year; // „2010 i młodsi”
    case "lte": return year <= r.year; // „2010 i starsi”
  }
}

interface EligOutcome { outcome: "pass" | "fail" | "unknown"; reasons: ReasonCode[] }

/** Zasady wieku/rocznika dla zawodnika; `sessionDate` potrzebna tylko dla „wiek na dzień sesji”. */
export function checkEligibility(elig: Eligibility | null | undefined, facts: PlayerFacts, sessionDate?: string | null): EligOutcome {
  if (!elig) return { outcome: "unknown", reasons: ["age_unknown"] };
  const hasYears = !!elig.birthYears?.length, hasAge = !!elig.ageLimits?.length;
  if (!hasYears && !hasAge) return { outcome: "unknown", reasons: [elig.ambiguous ? "ambiguous" : elig.categoryLabel ? "category_only" : "age_unknown"] };

  const fail: ReasonCode[] = [], unknown: ReasonCode[] = [];
  if (hasYears) {
    const year = birthYearOf(facts);
    if (year === null) unknown.push("birth_year_missing");
    else if (!elig.birthYears!.some((r) => yearRuleHolds(r, year))) fail.push("birth_year_out");
  }
  for (const l of elig.ageLimits ?? []) {
    const asOf = l.ref.type === "date" ? l.ref.date : l.ref.type === "session_start" ? sessionDate : null;
    if (!asOf) { unknown.push("age_ref_unspecified"); continue; }
    const range = ageRangeOn(facts, asOf);
    if (!range) { unknown.push("birth_year_missing"); continue; }
    const ok = ageLimitHolds(range, l);
    if (ok === false) fail.push("age_out"); else if (ok === null) unknown.push("needs_birthday");
  }
  if (fail.length) return { outcome: "fail", reasons: [...new Set([...fail, ...(elig.consentException ? (["consent_exception"] as const) : [])])] };
  if (elig.ambiguous) unknown.push("ambiguous");
  if (unknown.length) return { outcome: "unknown", reasons: [...new Set(unknown)] };
  return { outcome: "pass", reasons: [] };
}

/**
 * Kwalifikacja zawodnika do jednej sesji (albo do całego ogłoszenia bezterminowego – `session = null`).
 * Najpierw kwalifikacja (tu), dopiero potem sortowanie (gdzie indziej).
 * Którykolwiek pewny brak dopasowania daje NO_MATCH; w przeciwnym razie brak danych daje NEEDS_INFORMATION; MATCH tylko gdy wszystko potwierdzone.
 */
export function qualifySession(listing: RadarListing, session: RadarSession | null, facts: PlayerFacts): QualResult {
  const fail: ReasonCode[] = [], unknown: ReasonCode[] = [];

  // wiek / rocznik (zasady sesji, a bez nich – domyślne ogłoszenia)
  const elig = session?.eligibility ?? listing.eligibility ?? null;
  const e = checkEligibility(elig, facts, session?.date);
  if (e.outcome === "fail") fail.push(...e.reasons); else if (e.outcome === "unknown") unknown.push(...e.reasons);

  // pozycja
  if (listing.positions.scope === "unknown") unknown.push("listing_position_unknown");
  else if (listing.positions.scope === "only") {
    if (!facts.position) unknown.push("position_missing");
    else if (!listing.positions.positions.includes(facts.position)) fail.push("position_out");
  }

  // zgłoszenie indywidualne (drużynowe nie trafia do indywidualnych rekomendacji)
  if (listing.signupMode === "team_only") fail.push("team_only");
  else if (listing.signupMode === "unknown") unknown.push("signup_mode_unknown");

  // rodzaj ogłoszenia wybrany jawnie przez użytkownika
  if (facts.kinds.length && !facts.kinds.includes(listing.kind)) fail.push("kind_not_selected");

  // odległość (przybliżona; bez współrzędnych nie wymyślamy kilometrów)
  const lat = session?.lat ?? listing.lat, lon = session?.lon ?? listing.lon;
  let distanceKm: number | null = null;
  if (facts.place && lat != null && lon != null) distanceKm = Math.round(haversineKm(facts.place, { lat, lon }));
  if (facts.radiusKm !== null) {
    if (!facts.place) unknown.push("place_missing");
    else if (distanceKm === null) unknown.push("distance_unknown");
    else if (distanceKm > facts.radiusKm) fail.push("distance_out");
  }

  const reasons = fail.length ? [...new Set(fail)] : [...new Set(unknown)];
  return { result: fail.length ? "NO_MATCH" : unknown.length ? "NEEDS_INFORMATION" : "MATCH", reasons, distanceKm };
}
