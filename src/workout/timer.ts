/**
 * Odliczanie liczone od zegara (znaczniki czasu), a nie od tyknięć `setInterval`.
 * Przeglądarka usypia stronę w tle albo przy zablokowanym ekranie, więc tyknięcia giną; czas liczony z różnicy
 * `teraz − start` jest poprawny po każdym powrocie. Stan to zwykły obiekt (zapisywany razem z treningiem).
 */
export interface Countdown {
  durationMs: number;
  /** Chwila ostatniego wznowienia (ms od epoki) albo null, gdy zatrzymane. */
  runningSince: number | null;
  /** Czas, który już upłynął przed ostatnim wznowieniem. */
  elapsedMs: number;
  label?: string;
}

export function countdown(durationMs: number, label?: string): Countdown {
  return { durationMs: Math.max(0, Math.round(durationMs)), runningSince: null, elapsedMs: 0, ...(label ? { label } : {}) };
}

export const isRunning = (c: Countdown): boolean => c.runningSince !== null;

/** Upłynęło (z ochroną przed cofniętym zegarem urządzenia: ujemny odcinek liczy się jako 0). */
export function elapsed(c: Countdown, now: number): number {
  const live = c.runningSince === null ? 0 : Math.max(0, now - c.runningSince);
  return Math.min(c.durationMs, c.elapsedMs + live);
}

export const remaining = (c: Countdown, now: number): number => Math.max(0, c.durationMs - elapsed(c, now));
export const isDone = (c: Countdown, now: number): boolean => remaining(c, now) === 0;

export function start(c: Countdown, now: number): Countdown {
  if (c.runningSince !== null || isDone(c, now)) return c;
  return { ...c, runningSince: now };
}

export function pause(c: Countdown, now: number): Countdown {
  if (c.runningSince === null) return c;
  return { ...c, runningSince: null, elapsedMs: elapsed(c, now) };
}

/** Dodaj/odejmij czas (np. +15 s przerwy); nie schodzi poniżej już upłynionego czasu. */
export function adjust(c: Countdown, deltaMs: number, now: number): Countdown {
  return { ...c, durationMs: Math.max(elapsed(c, now), c.durationMs + deltaMs) };
}

/** Sekundy do wyświetlenia: zaokrąglenie w górę, żeby „0:00” pokazało się dopiero na końcu. */
export function display(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Poprawny odczyt zapisanego stanu (dane z pamięci urządzenia mogą być uszkodzone albo ze starszej wersji). */
export function parseCountdown(v: unknown): Countdown | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  if (!num(o.durationMs) || !num(o.elapsedMs) || !(o.runningSince === null || num(o.runningSince))) return null;
  return { durationMs: o.durationMs as number, elapsedMs: o.elapsedMs as number, runningSince: o.runningSince as number | null, ...(typeof o.label === "string" ? { label: o.label } : {}) };
}
