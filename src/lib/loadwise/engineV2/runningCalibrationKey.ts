import type { Profile } from "../types";

/** Derived server values, not the athlete's settings. A changed test or level needs new runs. */
export function runningCalibrationKey(p: Profile): string {
  return JSON.stringify([
    p.fieldMasSourceSessionId ?? null,
    p.fieldMasTestedAt ?? null,
    p.fieldMasKmh ?? null,
    p.runningProgressionLevel ?? 0,
  ]);
}
