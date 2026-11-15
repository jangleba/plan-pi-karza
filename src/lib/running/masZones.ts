export interface PaceRange {
  /** Szybsza granica zakresu (mniej sekund na kilometr). */
  fastestSecPerKm: number;
  /** Wolniejsza granica zakresu (więcej sekund na kilometr). */
  slowestSecPerKm: number;
  label: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatPaceTarget(secondsPerKm: number): string {
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

export function paceRangeFromMas(
  fieldMasKmh: number,
  minPercent: number,
  maxPercent: number,
): PaceRange | null {
  if (!Number.isFinite(fieldMasKmh) || fieldMasKmh <= 0) return null;
  const low = clamp(Math.min(minPercent, maxPercent), 40, 130) / 100;
  const high = clamp(Math.max(minPercent, maxPercent), 40, 130) / 100;
  const fastestSecPerKm = Math.round(3600 / (fieldMasKmh * high));
  const slowestSecPerKm = Math.round(3600 / (fieldMasKmh * low));
  return {
    fastestSecPerKm,
    slowestSecPerKm,
    label: `${formatPaceTarget(fastestSecPerKm).replace("/km", "")}–${formatPaceTarget(slowestSecPerKm)}`,
  };
}

/**
 * Training zones derived from the 5-minute field test (MAS = distance in 5 min / 300 s × 3.6).
 * One source for the plan's run recipes and for the paces shown after the test.
 * The percentages are the app's existing product rules, not an individual threshold measurement.
 */
export const MAS_ZONES = {
  easy: {
    label: "Spokojny bieg tlenowy",
    energy: "tlenowy, niska intensywność",
    percent: [65, 75] as [number, number],
    example: "20–30 min biegu ciągłego",
  },
  tempo: {
    label: "Tempo tlenowe",
    energy: "tlenowy, umiarkowana intensywność",
    percent: [80, 86] as [number, number],
    example: "3–4 × 6 min, przerwa 2 min truchtu",
  },
  aerobicIntervals: {
    label: "Interwały tlenowe",
    energy: "tlenowy, wysoka intensywność",
    percent: [90, 95] as [number, number],
    example: "4 × 3–4,5 min, przerwa 2 min truchtu",
  },
  shortHiit: {
    label: "Krótkie interwały",
    energy: "na poziomie MAS i powyżej: duży udział beztlenowy",
    percent: [100, 105] as [number, number],
    example: "6 × 1 min biegu / 1 min truchtu",
  },
} as const;
export type MasZoneId = keyof typeof MAS_ZONES;

export interface MasTrainingPace {
  id: MasZoneId;
  label: string;
  energy: string;
  percent: [number, number];
  pace: PaceRange;
  /** Speed range in km/h (slower, faster). */
  speedKmh: [number, number];
  example: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Every training pace the plan derives from one MAS result; null without a valid result. */
export function masTrainingPaces(masKmh: number | null | undefined): MasTrainingPace[] | null {
  if (typeof masKmh !== "number" || !Number.isFinite(masKmh) || masKmh <= 0) return null;
  const out: MasTrainingPace[] = [];
  for (const id of Object.keys(MAS_ZONES) as MasZoneId[]) {
    const zone = MAS_ZONES[id];
    const pace = paceRangeFromMas(masKmh, ...zone.percent);
    if (!pace) return null;
    out.push({
      id,
      label: zone.label,
      energy: zone.energy,
      percent: [...zone.percent],
      pace,
      speedKmh: [
        round1((masKmh * zone.percent[0]) / 100),
        round1((masKmh * zone.percent[1]) / 100),
      ],
      example: zone.example,
    });
  }
  return out;
}

/** The 5-minute result itself: distance, MAS speed and the pace that speed means. */
export function masResultSummary(distanceM: number, masKmh: number) {
  return {
    distanceM: Math.round(distanceM),
    masKmh: round1(masKmh),
    paceSecPerKm: Math.round(3600 / masKmh),
  };
}
