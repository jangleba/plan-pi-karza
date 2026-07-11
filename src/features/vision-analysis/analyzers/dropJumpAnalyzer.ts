import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectDropJumpPhases } from "./jumpDetection";
import { timeSeries } from "../poseSeries";
import {
  flightTimeToHeightCm,
  reactiveStrengthIndex,
  round,
  withinPlausibleRange,
  PLAUSIBLE_RANGES,
} from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { JUMP_FPS_POLICY } from "../measurementAccuracy";

const MIN_FPS = 60; // 60 FPS dozwolone → wynik estymowany z niepewnością (bez globalnej blokady 120)

/**
 * Drop Jump: zejście ze skrzyni → pierwszy kontakt → wybicie → drugi lot →
 * końcowe lądowanie. Bez skrzyni (pojedynczy skok z podłoża) nagranie NIE jest
 * Drop Jumpem i zostaje odrzucone.
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  const phases = detectDropJumpPhases(ctx.poses);
  if (!phases) return [];
  const t = timeSeries(ctx.poses);
  return [
    {
      type: "first_contact",
      frameIndex: phases.contactFrame,
      timestampSeconds: phases.boxDescentLandingTime,
      confidence: phases.confidence,
    },
    {
      type: "takeoff",
      frameIndex: phases.takeoffFrame,
      timestampSeconds: phases.reboundTakeoffTime,
      confidence: phases.confidence,
    },
    {
      type: "landing",
      frameIndex: phases.landingFrame,
      timestampSeconds: phases.reboundLandingTime,
      confidence: phases.confidence,
    },
  ];
}

function metrics(ctx: AnalysisContext): CalculatedMetric[] {
  const phases = detectDropJumpPhases(ctx.poses);
  if (!phases) return [];
  const { groundContactSeconds, flightSeconds } = phases;
  if (
    !withinPlausibleRange(flightSeconds, PLAUSIBLE_RANGES.flight_time_s.min, PLAUSIBLE_RANGES.flight_time_s.max)
  )
    return [];
  if (
    !withinPlausibleRange(
      groundContactSeconds,
      PLAUSIBLE_RANGES.ground_contact_s.min,
      PLAUSIBLE_RANGES.ground_contact_s.max,
    )
  )
    return [];
  const heightCm = flightTimeToHeightCm(flightSeconds);
  if (
    !withinPlausibleRange(heightCm, PLAUSIBLE_RANGES.jump_height_cm.min, PLAUSIBLE_RANGES.jump_height_cm.max)
  )
    return [];
  const rsi = reactiveStrengthIndex(heightCm / 100, groundContactSeconds);
  const conf = round(phases.confidence, 2);
  return [
    { key: "ground_contact_s", label: "Czas kontaktu", value: round(groundContactSeconds, 3), unit: "s", confidence: conf },
    { key: "flight_time_s", label: "Czas w powietrzu", value: round(flightSeconds, 3), unit: "s", confidence: conf },
    { key: "jump_height_cm", label: "Wysokość odbicia", value: heightCm, unit: "cm", confidence: conf },
    { key: "rsi", label: "RSI", value: rsi, unit: "", confidence: conf },
  ];
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = perEvent.length >= 3 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const phases = detectDropJumpPhases(ctx.poses);
  if (!phases) {
    // Brak zejścia ze skrzyni + odbicia — najczęściej zwykły skok bez skrzyni.
    issues.push("INVALID_TEST_EXECUTION");
  }
  return buildValidation(issues, [
    "INSUFFICIENT_FPS",
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "INVALID_TEST_EXECUTION",
  ]);
}

export const dropJumpAnalyzer: TestAnalyzer = {
  testType: "drop_jump",
  analyzerVersion: "drop-jump-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (_ev, ctx) => metrics(ctx),
  calculateConfidence: (ev) => confidence(ev),
  computeAccuracy: (ev, mtx, ctx) =>
    temporalAccuracy({ ev, metrics: mtx, ctx, fpsPolicy: JUMP_FPS_POLICY, timeKey: "ground_contact_s" }),
};
