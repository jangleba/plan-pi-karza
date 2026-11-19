import { supabase } from "../lib/supabase";
import type { RadarListing } from "./lib";
import type { Health } from "./state";

export type FeedResult =
  | { state: "ok"; listings: RadarListing[]; health: Health | null; offsetMs: number }
  | { state: "unconfigured" } // brak połączenia aplikacji z serwerem (to NIE jest awaria)
  | { state: "error"; message: string };

interface RawFeed { serverNow: string; health: Health | null; listings: RadarListing[] }

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
  new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

/**
 * Gotowe wyniki z serwera (funkcja radar_feed). Nie uruchamia wyszukiwarki ani AI – serwer odpowiada tylko tym, co zadania
 * już zebrały i zweryfikowały. Czas serwera koryguje zegar urządzenia, żeby aktualność nie zależała od ustawień telefonu.
 */
export async function fetchFeed(): Promise<FeedResult> {
  if (!supabase) return { state: "unconfigured" };
  try {
    const { data, error } = await withTimeout(supabase.rpc("radar_feed"), 10_000);
    if (error) return { state: "error", message: error.message };
    const raw = data as RawFeed;
    if (!raw || !Array.isArray(raw.listings)) return { state: "error", message: "nieprawidłowa odpowiedź" };
    return { state: "ok", listings: raw.listings, health: raw.health ?? null, offsetMs: Date.parse(raw.serverNow) - Date.now() };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "błąd połączenia" };
  }
}

/** Aktualny stan zapisanych ofert (także wygasłych) po identyfikatorach. */
export async function fetchListings(ids: string[]): Promise<Array<RadarListing & { live: boolean }> | null> {
  if (!supabase || !ids.length) return null;
  try {
    const { data, error } = await withTimeout(supabase.rpc("radar_get_listings", { p_ids: ids }), 10_000);
    if (error) return null;
    return (data as { listings: Array<RadarListing & { live: boolean }> }).listings;
  } catch {
    return null;
  }
}

/** Zgłoszenie nieaktualności trafia do administratora radaru (zapisy i kontakt – u organizatora). */
export async function reportStale(listingId: string, reason: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await withTimeout(supabase.rpc("radar_report_stale", { p_listing: listingId, p_reason: reason }), 10_000);
    return !error && data === true;
  } catch {
    return false;
  }
}
