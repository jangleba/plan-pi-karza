/** Stan GPS pokazywany biegaczowi – „aktywny” dopiero po świeżym odczycie o dobrej dokładności. */
export type GpsState = "searching" | "active" | "weak" | "stale" | "denied" | "unavailable";

export interface GpsInput {
  /** Ostatni odczyt: czas (ms epoki) i dokładność (m); null przed pierwszym. */
  fix: { at: number; acc: number } | null;
  now: number;
  error: "denied" | "unavailable" | null;
  maxAcc?: number; staleMs?: number;
}

export function gpsState({ fix, now, error, maxAcc = 25, staleMs = 10_000 }: GpsInput): GpsState {
  if (error === "denied") return "denied";
  if (!fix) return error === "unavailable" ? "unavailable" : "searching";
  if (now - fix.at > staleMs) return "stale";
  return fix.acc > maxAcc ? "weak" : "active";
}

export const GPS_LABEL: Record<GpsState, string> = {
  searching: "Szukam GPS…", active: "GPS aktywny", weak: "Słaby sygnał GPS", stale: "Brak aktualizacji GPS", denied: "Brak zgody na GPS", unavailable: "GPS niedostępny",
};
