/**
 * Logi developerskie pipeline'u analizy wideo + narzędzia odporności
 * (timeout / watchdog), aby żaden etap nie mógł trwać w nieskończoność.
 */

const DEV =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV === true;

/**
 * Tymczasowy, developerski przełącznik Phase 1 diagnostyki. Włączony
 * WYŁĄCZNIE w trybie developerskim Vision Lab — nigdy w produkcji.
 * Nie steruje logiką pomiarową, wyłącznie tym, czy `RunOptions.debugDiagnostics`
 * jest ustawione i czy wynik trafia do konsoli przeglądarki.
 */
export const isDevDiagnosticsEnabled = DEV;

/** Log etapu analizy (tylko w trybie developerskim). */
export function vlog(stage: string, ...args: unknown[]): void {
  if (!DEV) return;
  // eslint-disable-next-line no-console
  console.log(`%c[VisionLab] ${stage}`, "color:#16a34a;font-weight:bold", ...args);
}

/**
 * Zrzuca snapshot diagnostyczny Phase 1 (`VisionDiagnostics`) do konsoli
 * przeglądarki — WYŁĄCZNIE w trybie developerskim. Brak persystencji: nic
 * nie trafia do Supabase ani localStorage, wynik istnieje tylko w pamięci
 * konsoli deweloperskiej.
 */
export function logDiagnostics(diagnostics: unknown): void {
  if (!DEV || !diagnostics) return;
  // eslint-disable-next-line no-console
  console.log(
    "%c[VisionLab] diagnostics (Phase 1, dev-only)",
    "color:#2563eb;font-weight:bold",
    diagnostics,
  );
}

/** Log błędu analizy (zawsze widoczny — potrzebny do diagnostyki produkcyjnej). */
export function vwarn(stage: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(`[VisionLab] ${stage}`, ...args);
}

export class TimeoutError extends Error {
  code = "TIMEOUT";
  constructor(label: string, ms: number) {
    super(`Etap "${label}" przekroczył limit ${Math.round(ms / 1000)} s.`);
    this.name = "TimeoutError";
  }
}

/**
 * Owija obietnicę twardym limitem czasu. Po przekroczeniu odrzuca z
 * TimeoutError — dzięki temu żaden stan maszyny nie zawiesza się na zawsze.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      vwarn(`TIMEOUT: ${label}`, `${ms}ms`);
      reject(new TimeoutError(label, ms));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
