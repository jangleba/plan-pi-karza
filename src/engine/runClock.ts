/**
 * Czas aktywny biegu liczony ze znaczników czasu i okresów pauzy (nie z liczby tyknięć interwału).
 * `startedAt` i granice pauz to milisekundy epoki (Date.now()).
 */
export interface Pause { from: number; to?: number }
export interface ClockState { startedAt: number | null; pauses: Pause[] }

export const emptyClock = (): ClockState => ({ startedAt: null, pauses: [] });

/** Czas aktywny (ms) do chwili `at`, bez okresów pauzy. */
export function activeMs(c: ClockState, at: number): number {
  if (c.startedAt === null) return 0;
  const end = Math.max(at, c.startedAt);
  let paused = 0;
  for (const p of c.pauses) {
    const from = Math.max(p.from, c.startedAt), to = Math.min(p.to ?? end, end);
    if (to > from) paused += to - from;
  }
  return Math.max(0, end - c.startedAt - paused);
}

export const isPaused = (c: ClockState): boolean => c.pauses.length > 0 && c.pauses[c.pauses.length - 1]!.to === undefined;

export function startClock(at: number): ClockState { return { startedAt: at, pauses: [] }; }
export function pauseClock(c: ClockState, at: number): ClockState { return c.startedAt === null || isPaused(c) ? c : { ...c, pauses: [...c.pauses, { from: at }] }; }
export function resumeClock(c: ClockState, at: number): ClockState {
  if (!isPaused(c)) return c;
  const pauses = c.pauses.slice(); const last = pauses[pauses.length - 1]!;
  pauses[pauses.length - 1] = { from: last.from, to: Math.max(at, last.from) };
  return { ...c, pauses };
}
