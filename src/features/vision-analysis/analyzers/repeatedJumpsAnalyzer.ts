import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectRepeatedCycles } from "./jumpDetection";
import {
  flightTimeToHeightCm,
  round,
  withinPlausibleRange,
  PLAUSIBLE_RANGES,
} from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { JUMP_FPS_POLICY } from "../measurementAccuracy";

const MIN_FPS = 120;
/** Wymagana liczba pełnych, prawidłowych cykli (bez niepełnego 1. i ostatniego). */
export const REQUIRED_REPEATED_CYCLES = 5;

/**
 * Repeated Jumps: jedna pełna seria wymaganej liczby cykli. Niepełny pierwszy i
 * ostatni cykl są odrzucane. Wynik dla każdego powtórzenia + podsumowanie serii.
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  const { cycles } = detectRepeatedCycles(ctx.poses);
  return cycles.map((c) => ({
    type: "ground_contact",
    frameIndex: 0,
    timestampSeconds: round(c.takeoffTime, 3),
    confidence: round(c.confidence, 2),
  }));
}

function metrics(ctx: AnalysisContext): CalculatedMetric[] {
  const { cycles } = detectRepeatedCycles(ctx.poses);
  if (cycles.length < REQUIRED_REPEATED_CYCLES) return [];

  const flights = cycles.map((c) => c.flightSeconds);
  const validFlight = flights.every((f) =>
    withinPlausibleRange(f, PLAUSIBLE_RANGES.flight_time_s.min, PLAUSIBLE_RANGES.flight_time_s.max),
  );
  if (!validFlight) return [];

  const heights = flights.map((f) => flightTimeToHeightCm(f));
  const avgFlight = flights.reduce((a, b) => a + b, 0) / flights.length;
  const bestHeight = Math.max(...heights);
  const mean = avgFlight;
  const variance = flights.reduce((a, b) => a + (b - mean) ** 2, 0) / flights.length;
  const cv = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
  const conf = round(Math.min(...cycles.map((c) => c.confidence)), 2);

  return [
    { key: "rep_count", label: "Liczba cykli", value: cycles.length, unit: "", confidence: conf },
    { key: "avg_flight_s", label: "Średni czas lotu", value: round(avgFlight, 3), unit: "s", confidence: conf },
    { key: "best_jump_height_cm", label: "Najlepszy cykl", value: round(bestHeight, 1), unit: "cm", confidence: conf },
    { key: "flight_cv", label: "Zmienność serii", value: round(cv, 1), unit: "%", confidence: conf },
  ];
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = perEvent.length >= REQUIRED_REPEATED_CYCLES ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const { cycles } = detectRepeatedCycles(ctx.poses);
  if (cycles.length === 0) issues.push("EVENTS_NOT_DETECTED");
  else if (cycles.length < REQUIRED_REPEATED_CYCLES) issues.push("WRONG_REPETITION_COUNT");
  return buildValidation(issues, [
    "INSUFFICIENT_FPS",
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
    "WRONG_REPETITION_COUNT",
  ]);
}

export const repeatedJumpsAnalyzer: TestAnalyzer = {
  testType: "repeated_jumps",
  analyzerVersion: "repeated-jumps-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (_ev, ctx) => metrics(ctx),
  calculateConfidence: (ev) => confidence(ev),
  computeAccuracy: (ev, mtx, ctx) =>
    temporalAccuracy({ ev, metrics: mtx, ctx, fpsPolicy: JUMP_FPS_POLICY, timeKey: "avg_flight_s" }),
};
