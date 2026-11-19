import type { Eligibility, PlayerFacts, RadarListing, RadarSession } from "../../supabase/functions/_shared/radar/index.ts";

export const NOW = Date.parse("2026-11-19T12:00:00Z");
export const hoursAgo = (h: number, now = NOW) => new Date(now - h * 3_600_000).toISOString();
export const daysAgo = (d: number, now = NOW) => hoursAgo(d * 24, now);

export const player = (over: Partial<PlayerFacts> = {}): PlayerFacts => ({
  birthDate: "2011-05-10", position: "pomocnik", place: { name: "Kraków", lat: 50.061, lon: 19.937 }, radiusKm: 100, kinds: [], ...over,
});

let n = 0;
export const session = (date: string, elig: Eligibility | null, over: Partial<RadarSession> = {}): RadarSession => ({
  id: `s${++n}`, date, startTime: null, startsAt: null, eligibility: elig, status: "active", ...over,
});

export const listing = (over: Partial<RadarListing> = {}): RadarListing => ({
  id: `l${++n}`, url: "https://klub.example/nabor", kind: "testy", organizer: "KS Przykład", summary: "Otwarte testy.",
  city: "Kraków", lat: 50.061, lon: 19.937, positions: { scope: "all" }, signupMode: "individual", signupStatus: "open", costState: "free",
  sessions: [], indefinite: false, status: "published", sourceCheckedAt: hoursAgo(1), organizerConfirmedAt: hoursAgo(1), organizerConfirmation: { method: "page_statement", evidence: "Informacja aktualna na dzień publikacji" }, ...over,
});

export const years = (...ys: number[]): Eligibility => ({ birthYears: [{ op: "in", years: ys }] });
