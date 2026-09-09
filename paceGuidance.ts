export type PaceGuidance = "on_target" | "speed_up" | "slow_down" | "unavailable";

export const SPEED_UP_VIBRATION = [90, 70, 90] as const;
export const SLOW_DOWN_VIBRATION = [650] as const;

export function classifyPace(
  actualSecPerKm: number | null,
  fastestSecPerKm: number,
  slowestSecPerKm: number,
  toleranceSec = 5,
): PaceGuidance {
  if (actualSecPerKm == null || !Number.isFinite(actualSecPerKm) || actualSecPerKm <= 0) {
    return "unavailable";
  }
  if (actualSecPerKm > slowestSecPerKm + toleranceSec) return "speed_up";
  if (actualSecPerKm < fastestSecPerKm - toleranceSec) return "slow_down";
  return "on_target";
}

export function vibrationForPace(guidance: PaceGuidance): number[] | null {
  if (guidance === "speed_up") return [...SPEED_UP_VIBRATION];
  if (guidance === "slow_down") return [...SLOW_DOWN_VIBRATION];
  return null;
}
