/** Dane najbliższej sesji treningowej używane przez Fuel. */

export type SessionKind =
  "match" | "strength" | "speed" | "endurance" | "football" | "recovery" | "none";

export type SessionIntensity = "niska" | "umiarkowana" | "wysoka";

/** Najbliższa jednostka — czytana z modułu Plan przez adapter (read-only). */
export interface FuelSessionInput {
  kind: SessionKind;
  intensity: SessionIntensity | null;
  durationMin: number | null;
  /** Minuty pozostałe do startu (>= 0) — null, gdy aplikacja nie zna godziny. */
  minutesToStart: number | null;
  title: string | null;
  subtitle: string | null;
  date: string | null;
  /** Godzina startu w formacie HH:MM, jeśli faktycznie istnieje w danych. */
  startClock: string | null;
  dayLabel: string | null;
  /** Stabilny klucz używany wyłącznie do lokalnego zapamiętania godziny. */
  scheduleKey?: string | null;
  slot?: 1 | 2;
  timeSource?: "session" | "remembered" | null;
}
