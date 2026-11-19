import { supabase } from "../lib/supabase";
import { haversineKm } from "../../supabase/functions/_shared/radar/distance";
import type { PlayerFacts } from "./lib";

export interface ClubContact { email: string; kind: "general" | "recruitment"; evidenceUrl: string; evidenceQuote: string; checkedAt: string }
export interface Club { id: string; name: string; city: string | null; lat: number | null; lon: number | null; website: string; recruitmentUrl: string | null; checkedAt: string | null; contacts: ClubContact[] }

export type ClubsResult =
  | { state: "ok"; clubs: Club[]; offsetMs: number }
  | { state: "unconfigured" }
  | { state: "error"; message: string };

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
  new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

/** Gotowa lista klubów z aktualnym, zweryfikowanym adresem (radar_clubs_feed). Nie uruchamia wyszukiwarki ani AI. */
export async function fetchClubs(): Promise<ClubsResult> {
  if (!supabase) return { state: "unconfigured" };
  try {
    const { data, error } = await withTimeout(supabase.rpc("radar_clubs_feed"), 10_000);
    if (error) return { state: "error", message: error.message };
    const raw = data as { serverNow: string; clubs: Club[] };
    if (!raw || !Array.isArray(raw.clubs)) return { state: "error", message: "nieprawidłowa odpowiedź" };
    return { state: "ok", clubs: raw.clubs, offsetMs: Date.parse(raw.serverNow) - Date.now() };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "błąd połączenia" };
  }
}

export async function reportClub(clubId: string, reason: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await withTimeout(supabase.rpc("radar_report_club", { p_club: clubId, p_reason: reason }), 10_000);
    return !error && data === true;
  } catch {
    return false;
  }
}

export interface ClubView { club: Club; distanceKm: number | null }

/**
 * Kluby dla zawodnika: tylko z co najmniej jednym aktualnym adresem; promień jak w ofertach (bez współrzędnych klubu przy
 * ograniczonym promieniu nie zgadujemy odległości – klub nie trafia na listę); sortowanie: odległość (nieznana na końcu), nazwa.
 */
export function clubsForPlayer(clubs: Club[], facts: Pick<PlayerFacts, "place" | "radiusKm">): ClubView[] {
  const out: ClubView[] = [];
  for (const club of clubs) {
    if (!club.contacts.length) continue;
    const distanceKm = facts.place && club.lat != null && club.lon != null ? Math.round(haversineKm(facts.place, { lat: club.lat, lon: club.lon })) : null;
    if (facts.radiusKm !== null && (distanceKm === null || distanceKm > facts.radiusKm)) continue;
    out.push({ club, distanceKm });
  }
  return out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.club.name.localeCompare(b.club.name, "pl") || a.club.id.localeCompare(b.club.id));
}

/** Najlepszy adres do zapytania o nabór: najpierw przeznaczony na nabór, potem ogólny. */
export const bestContact = (c: Club): ClubContact | null => c.contacts.find((x) => x.kind === "recruitment") ?? c.contacts[0] ?? null;

/* ---------- dane zawodnika do wiadomości i dziennik wysłanych (tylko na urządzeniu) ---------- */

export interface InquiryForm { fullName: string; currentClub: string; experience: string; videoUrl: string; phone: string; purpose: "testy" | "trening" | "oba"; withBirthDate: boolean }
export const EMPTY_FORM: InquiryForm = { fullName: "", currentClub: "", experience: "", videoUrl: "", phone: "", purpose: "oba", withBirthDate: false };

export function loadForm(defaultName: string): InquiryForm {
  try {
    const v = JSON.parse(localStorage.getItem("radarInquiry") ?? "null") as Partial<InquiryForm> | null;
    return { ...EMPTY_FORM, fullName: defaultName, ...(v ?? {}) };
  } catch {
    return { ...EMPTY_FORM, fullName: defaultName };
  }
}
export function saveForm(f: InquiryForm): void { try { localStorage.setItem("radarInquiry", JSON.stringify(f)); } catch { /* brak pamięci */ } }

export function loadSent(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem("radarSent") ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export function markSent(clubId: string, iso = new Date().toISOString()): Record<string, string> {
  const next = { ...loadSent(), [clubId]: iso };
  try { localStorage.setItem("radarSent", JSON.stringify(next)); } catch { /* brak pamięci */ }
  return next;
}
