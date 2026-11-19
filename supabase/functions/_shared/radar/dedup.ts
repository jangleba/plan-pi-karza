import { placeKey } from "./geo.ts";
import type { Eligibility } from "./types.ts";

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|yclid$|igshid$)/i;

/** Kanoniczny adres ogłoszenia: małe litery hosta, bez fragmentu i parametrów śledzących, posortowane parametry. */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

export const domainOf = (raw: string): string => new URL(raw).hostname.toLowerCase().replace(/^www\./, "");

/** Stabilny skrót tekstu (FNV-1a 64-bit jako hex) – bez zależności od środowiska. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Kanoniczny zapis zasad wieku do porównań (kolejność i sposób zapisu nie mają znaczenia). */
export function eligibilityKey(e: Eligibility | null | undefined): string {
  if (!e) return "?";
  const parts: string[] = [];
  const years = new Set<number>();
  for (const r of e.birthYears ?? []) {
    if (r.op === "in") r.years.forEach((y) => years.add(y));
    else if (r.op === "range") for (let y = r.from; y <= r.to && y - r.from < 60; y++) years.add(y);
    else parts.push(`${r.op}:${r.year}`);
  }
  if (years.size) parts.push(`y:${[...years].sort((a, b) => a - b).join(",")}`);
  for (const l of e.ageLimits ?? []) parts.push(`a:${l.op}${l.age}@${l.ref.type === "date" ? l.ref.date : l.ref.type}`);
  if (e.categoryLabel) parts.push(`c:${placeKey(e.categoryLabel)}`);
  return parts.sort().join("|") || "?";
}

export interface SessionIdentity {
  organizer: string;
  city?: string | null;
  date: string;
  startTime?: string | null;
  eligibility?: Eligibility | null;
}

/** Klucz grupy możliwych duplikatów (bez godziny). */
export const sessionGroupKey = (s: SessionIdentity): string =>
  [placeKey(s.organizer), placeKey(s.city ?? ""), s.date, eligibilityKey(s.eligibility)].join("#");

/**
 * Ta sama sesja z różnych publikacji: ten sam organizator, miejscowość, dzień i zasady wieku, a godziny zgodne
 * (albo jedna z publikacji jej nie podaje). Różne roczniki tego samego dnia to ODRĘBNE sesje.
 */
export function sameSession(a: SessionIdentity, b: SessionIdentity): boolean {
  if (sessionGroupKey(a) !== sessionGroupKey(b)) return false;
  return !a.startTime || !b.startTime || a.startTime === b.startTime;
}

/** Usuwa duplikaty w obrębie jednej listy sesji, zachowując pierwszą i odrębne sesje. */
export function dedupeSessions<T extends SessionIdentity>(list: T[]): T[] {
  const out: T[] = [];
  for (const s of list) if (!out.some((o) => sameSession(o, s))) out.push(s);
  return out;
}
