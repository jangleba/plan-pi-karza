import { warsawStartOfDay } from "./time.ts";
import type { RadarListing, RadarSession } from "./types.ts";

export const SOURCE_MAX_AGE_MS = 48 * 3_600_000; // 48 h bez POPRAWNEGO sprawdzenia źródła
export const INDEFINITE_MAX_CONFIRM_AGE_MS = 7 * 86_400_000; // nabór bezterminowy: potwierdzenie co najwyżej po 7 dniach

export type ExpiryReason =
  | "not_published" | "closed" | "cancelled" | "full" | "deadline_passed"
  | "no_live_sessions" | "source_stale" | "unconfirmed_indefinite";

const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Moment rozpoczęcia sesji. Samą datę (bez godziny) traktujemy ostrożnie: od początku tego dnia lokalnego (godzin nie wymyślamy). */
export function sessionStartMs(s: Pick<RadarSession, "date" | "startsAt">): number {
  return ms(s.startsAt) ?? warsawStartOfDay(s.date);
}

export const sessionIsLive = (s: RadarSession, nowMs: number): boolean => s.status === "active" && nowMs < sessionStartMs(s);

export interface Freshness { live: boolean; reason?: ExpiryReason; liveSessions: RadarSession[] }

/**
 * Czy ogłoszenie wolno jeszcze rekomendować. Sprawdzane przy KAŻDYM odczycie, więc opóźnienie zadania
 * wygaszającego nie udostępnia przeterminowanych ofert.
 * Znacznik `sourceCheckedAt` ustawia tylko poprawne sprawdzenie (błąd, logowanie, CAPTCHA go nie odnawiają),
 * a `organizerConfirmedAt` – tylko faktyczne potwierdzenie treści (ponowne pobranie starej strony go nie odnawia).
 */
export function listingFreshness(l: RadarListing, nowMs: number): Freshness {
  const dead = (reason: ExpiryReason): Freshness => ({ live: false, reason, liveSessions: [] });
  if (l.status !== "published") return dead("not_published");
  if (l.signupStatus === "closed") return dead("closed");
  if (l.signupStatus === "cancelled") return dead("cancelled");
  if (l.signupStatus === "full") return dead("full");
  const closes = ms(l.signupClosesAt);
  if (closes !== null && nowMs >= closes) return dead("deadline_passed");
  const checked = ms(l.sourceCheckedAt);
  if (checked === null || nowMs - checked > SOURCE_MAX_AGE_MS) return dead("source_stale");
  if (l.indefinite) {
    const confirmed = ms(l.organizerConfirmedAt);
    if (confirmed === null || nowMs - confirmed > INDEFINITE_MAX_CONFIRM_AGE_MS) return dead("unconfirmed_indefinite");
    return { live: true, liveSessions: [] };
  }
  const liveSessions = l.sessions.filter((s) => sessionIsLive(s, nowMs));
  return liveSessions.length ? { live: true, liveSessions } : dead("no_live_sessions");
}
