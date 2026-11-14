import type { MasTestEvidence } from "../masQuality";
import type { RunningIntervalResult } from "../types";
export const masEvidence = (distanceM = 1300): MasTestEvidence => ({
  version: 1,
  recipeId: "v2:mas-test:2026-11-14",
  source: "gps",
  interrupted: false,
  startElapsedSec: 0,
  durationSec: 300,
  wallDurationSec: 300,
  coverageSec: 300,
  maxGapSec: 2,
  maxAccuracyM: 4,
  pointCount: 151,
  discontinuities: 0,
  distanceM,
});
export const masResult = (distanceM = 1300): RunningIntervalResult => ({
  stepId: "mas-test",
  kind: "work",
  label: "Test 5 min",
  phase: "main",
  repeatIndex: 1,
  repeatTotal: 1,
  targetMode: "time",
  targetValue: 300,
  targetLabel: "5 min",
  durationSec: 300,
  distanceM,
  paceSecPerKm: 300 / (distanceM / 1000),
  completed: true,
  recipeId: "v2:mas-test:2026-11-14",
  startElapsedSec: 0,
});
