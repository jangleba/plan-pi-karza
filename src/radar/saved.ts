import type { RadarListing } from "./lib";
import { fetchListings } from "./api";
import { scoped } from "../lib/store";

/** Zapisana oferta: migawka z chwili zapisu + ostatni znany status z serwera. Zapis nie zmienia planu treningowego ani kalendarza. */
export interface SavedOffer { id: string; savedAt: string; listing: RadarListing; live: boolean; status: RadarListing["status"] }

const KEY = "radarSaved";
const MAX = 100;

export function loadSaved(): SavedOffer[] {
  try {
    const v = JSON.parse(scoped.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as SavedOffer[]).filter((x) => x && typeof x.id === "string" && x.listing) : [];
  } catch {
    return [];
  }
}

function store(list: SavedOffer[]): void {
  try { scoped.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* brak pamięci */ }
}

export const isSaved = (id: string): boolean => loadSaved().some((x) => x.id === id);

export function toggleSaved(listing: RadarListing, nowIso = new Date().toISOString()): SavedOffer[] {
  const cur = loadSaved();
  const next = cur.some((x) => x.id === listing.id)
    ? cur.filter((x) => x.id !== listing.id)
    : [{ id: listing.id, savedAt: nowIso, listing, live: true, status: listing.status }, ...cur];
  store(next);
  return next;
}

/** Odświeża statusy zapisanych ofert z serwera; wygasłe zostają z właściwym statusem (nie znikają). Przy braku połączenia – bez zmian. */
export async function refreshSaved(): Promise<SavedOffer[]> {
  const cur = loadSaved();
  const fresh = await fetchListings(cur.map((x) => x.id));
  if (!fresh) return cur;
  const byId = new Map(fresh.map((l) => [l.id, l]));
  const next = cur.map((x) => {
    const l = byId.get(x.id);
    return l ? { ...x, listing: l, live: l.live, status: l.status } : { ...x, live: false, status: "withdrawn" as const }; // usunięte z serwera = nieaktualne
  });
  store(next);
  return next;
}

/** Etykieta statusu zapisanej oferty. */
export function savedStatusText(s: SavedOffer, nowMs: number): string {
  if (s.live) return "aktualna";
  const l = s.listing;
  if (s.status === "withdrawn") return "wycofana";
  if (l.signupStatus === "cancelled") return "odwołana";
  if (l.signupStatus === "full") return "brak miejsc";
  if (l.signupStatus === "closed") return "zapisy zamknięte";
  if (l.signupClosesAt && nowMs >= Date.parse(l.signupClosesAt)) return "termin zgłoszeń minął";
  const ended = l.sessions.length > 0 && l.sessions.every((x) => (x.startsAt ? Date.parse(x.startsAt) : Date.parse(`${x.date}T00:00:00Z`)) <= nowMs);
  return ended ? "termin minął" : "wygasła – brak świeżego potwierdzenia";
}
