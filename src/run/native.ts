/**
 * Adapter rejestracji lokalizacji w tle (warstwa natywna).
 * W repozytorium nie ma projektu natywnego (brak Capacitor/innego wrappera), więc w przeglądarce adapter jest niedostępny
 * i GPS działa tylko przy włączonym ekranie. Docelowy wrapper ma wystawić obiekt `window.BallWiseNative.tracker`
 * zgodny z `NativeTracker` – szczegóły w docs/BIEG-W-TLE.md.
 */
export interface NativeSample { lat: number; lon: number; acc: number; /** ms epoki */ timestamp: number; speed?: number | null; heading?: number | null }
export interface NativeTracker {
  /** Uruchamia serwis lokalizacji w tle (iOS: Background Modes → Location updates; Android: foreground service typu location). */
  start(): Promise<void>;
  /** Zatrzymuje serwis i zwalnia zasoby. */
  stop(): Promise<void>;
  /** Zwraca punkty zebrane od ostatniego wywołania (trwały zapis po stronie natywnej, niezależny od React). */
  drain(): Promise<NativeSample[]>;
}

export function getNativeTracker(): NativeTracker | null {
  try {
    const t = (globalThis as unknown as { BallWiseNative?: { tracker?: NativeTracker } }).BallWiseNative?.tracker;
    return t && typeof t.start === "function" && typeof t.stop === "function" && typeof t.drain === "function" ? t : null;
  } catch { return null; }
}
