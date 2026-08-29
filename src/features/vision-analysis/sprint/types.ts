/**
 * Sprint Performance Scan — wspólny model danych jednej „Analizy sprintu”.
 *
 * To NIE jest drugi silnik. Scan jest warstwą raportową zbudowaną wyłącznie
 * z rzeczywistych wyjść istniejących modułów: poseEngine (landmarki),
 * calibratedLineCrossing / timingPlane (czas i linie), homografii (dystans).
 *
 * Zasada nadrzędna: każda liczba w scanie pochodzi z realnego pomiaru tego
 * filmu. Gdy warunki nie są spełnione, metryka jest POMIJANA — nigdy nie jest
 * estymowana dekoracyjnie ani wypełniana wartością domyślną.
 */

import type { TestType } from "../types";

/** Protokół w ramach jednej karty „Analiza sprintu”. */
export type SprintProtocolId = "sprint_20m" | "sprint_30m" | "flying_sprint";

export const SPRINT_SCAN_TESTS: ReadonlySet<TestType> = new Set<TestType>([
  "sprint_20m",
  "sprint_30m",
  "flying_sprint",
]);

export function isSprintScanTest(t: TestType | string): t is SprintProtocolId {
  return SPRINT_SCAN_TESTS.has(t as TestType);
}

// ---------------------------------------------------------------------------
// Splity
// ---------------------------------------------------------------------------

/** Pojedynczy skalibrowany split (linia pośrednia lub meta). */
export interface SprintSplit {
  /** Rola linii, z której pochodzi split. */
  role: string;
  label: string;
  /** Dystans od linii startowej (m) — wyłącznie z kalibracji lub protokołu. */
  distanceM: number;
  /** Czas skumulowany od startu (s). */
  cumulativeTimeS: number;
  /** Czas odcinka od poprzedniego splitu (s). */
  segmentTimeS: number | null;
  /** Prędkość odcinkowa (m/s) — null, gdy poza zakresem fizycznym. */
  segmentSpeedMs: number | null;
  segmentSpeedKmh: number | null;
  /** Niepewność czasu skumulowanego (s). */
  cumulativeUncertaintyS: number;
  frameBeforeIndex: number;
  frameAfterIndex: number;
}

/** Profil prędkości — publikowany tylko przy wystarczającej liczbie splitów. */
export interface SprintVelocityProfile {
  basis: "calibrated_splits";
  segments: number;
  peakSegmentSpeedMs: number;
  peakSegmentSpeedKmh: number;
  peakSegmentLabel: string;
  /** Czy szczyt wystąpił na ostatnim odcinku (bieg nadal przyspieszał). */
  peakAtLastSegment: boolean;
}

export type SplitBlockCode =
  | "NO_CALIBRATION"
  | "NO_START_LINE"
  | "NO_SPLIT_LINES"
  | "CROSSINGS_NOT_DETECTED";

export interface SprintSplitResult {
  splits: SprintSplit[];
  velocityProfile: SprintVelocityProfile | null;
  /** Powód braku splitów / profilu — jawny, bez zgadywania. */
  blockedBy: SplitBlockCode | null;
}

// ---------------------------------------------------------------------------
// Fazy
// ---------------------------------------------------------------------------

export type SprintPhaseId = "start" | "first_steps" | "acceleration" | "high_speed";

export const SPRINT_PHASE_LABELS: Record<SprintPhaseId, string> = {
  start: "Start",
  first_steps: "Pierwsze kroki",
  acceleration: "Akceleracja",
  high_speed: "Przejście do wyższej prędkości",
};

export interface SprintPhase {
  id: SprintPhaseId;
  label: string;
  startTimeS: number;
  endTimeS: number;
  frameStart: number;
  frameEnd: number;
  /** Pewność wyznaczenia fazy (0-1) z liczby klatek i jakości śledzenia. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Mechanika
// ---------------------------------------------------------------------------

export type MechanicMetricKey =
  | "trunk_lean_deg"
  | "shank_angle_deg"
  | "hip_extension_deg"
  | "knee_flexion_deg"
  | "foot_strike_offset_pct"
  | "step_rate_hz"
  | "step_asymmetry_pct";

export interface MechanicMetric {
  key: MechanicMetricKey;
  label: string;
  unit: string;
  /** Mediana z klatek spełniających bramki jakości. */
  value: number;
  /** Przedział obserwacji (percentyl 10-90), nie „dokładny kąt”. */
  rangeMin: number;
  rangeMax: number;
  samples: number;
  confidence: number;
  phase: SprintPhaseId | null;
  /** Klatka dowodowa — najbliższa medianie. */
  evidenceFrameIndex: number | null;
}

export type MechanicsAvailability =
  | "AVAILABLE"
  | "ATHLETE_TOO_SMALL_FOR_MECHANICS"
  | "LOW_VISIBILITY"
  | "NOT_ENOUGH_FRAMES";

export interface SprintMechanics {
  availability: MechanicsAvailability;
  metrics: MechanicMetric[];
  framesUsed: number;
  medianSilhouetteFraction: number;
  medianVisibility: number;
}

// ---------------------------------------------------------------------------
// Limiter + zalecenia
// ---------------------------------------------------------------------------

export type SprintLimiterId =
  | "acceleration_position"
  | "braking_contact"
  | "step_rhythm"
  | "side_asymmetry";

export interface LimiterEvidence {
  metricKey: MechanicMetricKey;
  label: string;
  value: number;
  unit: string;
  phase: SprintPhaseId | null;
  frameIndex: number | null;
}

export interface SprintLimiter {
  id: SprintLimiterId;
  label: string;
  summary: string;
  evidence: LimiterEvidence[];
  confidence: number;
}

export interface SprintRecommendation {
  limiterId: SprintLimiterId;
  cue: string;
  /** Identyfikatory istniejących ćwiczeń. Vision NIGDY nie zmienia planu. */
  exerciseIds: string[];
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export const SPRINT_SCAN_VERSION = "sprint-scan-1.0.0";

export interface SprintPerformanceScan {
  version: string;
  protocol: SprintProtocolId;
  /** Czy czas główny został policzony (splity mogą istnieć niezależnie). */
  timingAvailable: boolean;
  splits: SprintSplit[];
  velocityProfile: SprintVelocityProfile | null;
  splitsBlockedBy: SplitBlockCode | null;
  phases: SprintPhase[];
  mechanics: SprintMechanics;
  limiter: SprintLimiter | null;
  /** Uczciwy powód, gdy limiter nie został wskazany. */
  limiterReason: string;
  recommendation: SprintRecommendation | null;
  /** Czas poprawny, ale sylwetka za mała → zaproponuj dogranie ujęcia bliżej. */
  needsCloseUpForMechanics: boolean;
}
