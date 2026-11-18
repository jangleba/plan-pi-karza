/** MAS (maximal aerobic speed) z testu biegowego; domyślnie 5 minut. */
export interface Mas {
  ms: number;
  kmh: number;
  /** Tempo na km w sekundach. */
  paceSecPerKm: number;
}

export const MAS_TEST_SECONDS = 300;

export function calcMas(distanceM: number, durationS: number = MAS_TEST_SECONDS): Mas {
  if (!(distanceM > 0) || !(durationS > 0)) {
    throw new RangeError("Dystans i czas muszą być dodatnie");
  }
  const ms = distanceM / durationS;
  const kmh = ms * 3.6;
  return { ms, kmh, paceSecPerKm: 1000 / ms };
}

export function speedAtPercent(mas: Mas, percent: number): Mas {
  const ms = mas.ms * (percent / 100);
  return { ms, kmh: ms * 3.6, paceSecPerKm: 1000 / ms };
}

export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/** Strefy dawkowania wg MAS (hipoteza robocza do akceptacji). */
export const MAS_ZONES = {
  easy: { from: 60, to: 75 },
  long: { from: 85, to: 95 },
  short: { from: 100, to: 110 },
} as const;

/** Dystans odcinka interwałowego przy danej intensywności. */
export function intervalDistanceM(mas: Mas, percent: number, durationS: number): number {
  return Math.round(speedAtPercent(mas, percent).ms * durationS);
}

/** Test MAS do powtórzenia po 8–10 tygodniach. */
export function masRetestDue(lastTestISO: string, todayISO: string, weeks = 9): boolean {
  const diff = (Date.parse(todayISO) - Date.parse(lastTestISO)) / 86_400_000;
  return diff >= weeks * 7;
}
