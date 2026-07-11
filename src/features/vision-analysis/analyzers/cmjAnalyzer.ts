import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectFlightPhase, flightPhaseEvents } from "./jumpDetection";
import { hipYSeries, timeSeries } from "../poseSeries";
import { meanFinite, argMax } from "../signal";
import { flightTimeToHeightCm, round, withinPlausibleRange, PLAUSIBLE_RANGES } from "../physics";
import {
  calcTemporalResolution,
  computeMeasurementAccuracy,
  eventUncertaintyMs,
  formatResult,
  jumpHeightUncertaintyCm,
  summedTimeUncertaintyMs,
  validateCalibrationQuality,
  JUMP_FPS_POLICY,
  type MeasurementAccuracy,
} from "../measurementAccuracy";


const MIN_FPS = 60;

function events(ctx: AnalysisContext): DetectedEvent[] {
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) return [];
  return flightPhaseEvents(phase, ctx.poses);
}

function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const landing = ev.find((e) => e.type === "landing");
  const lowest = ev.find((e) => e.type === "lowest_position");
  if (!takeoff || !landing) return [];
  const flightTime = landing.timestampSeconds - takeoff.timestampSeconds;
  if (
    !withinPlausibleRange(
      flightTime,
      PLAUSIBLE_RANGES.flight_time_s.min,
      PLAUSIBLE_RANGES.flight_time_s.max,
    )
  )
    return [];
  const heightCm = flightTimeToHeightCm(flightTime);
  if (
    !withinPlausibleRange(
      heightCm,
      PLAUSIBLE_RANGES.jump_height_cm.min,
      PLAUSIBLE_RANGES.jump_height_cm.max,
    )
  )
    return [];

  const conf = takeoff.confidence;
  const out: CalculatedMetric[] = [
    {
      key: "jump_height_cm",
      label: "Wysokość wyskoku",
      value: heightCm,
      unit: "cm",
      confidence: conf,
    },
    {
      key: "flight_time_s",
      label: "Czas w powietrzu",
      value: round(flightTime, 3),
      unit: "s",
      confidence: conf,
    },
  ];

  // Głębokość zejścia (countermovement) względem pozycji stojącej.
  if (lowest) {
    const hip = hipYSeries(ctx.poses);
    const standing = meanFinite(hip.slice(0, Math.max(2, Math.floor(hip.length * 0.1))));
    const depth = (hip[lowest.frameIndex] ?? standing) - standing; // Y rośnie w dół
    out.push({
      key: "countermovement_depth",
      label: "Głębokość zejścia",
      value: round(Math.max(0, depth) * 100, 1),
      unit: "% wys.",
      confidence: conf * 0.8,
    });
  }
  return out;
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = perEvent.length >= 2 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  if (events(ctx).length < 2) issues.push("EVENTS_NOT_DETECTED");
  return buildValidation(issues, [
    "INSUFFICIENT_FPS",
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
  ]);
}

export const cmjAnalyzer: TestAnalyzer = {
  testType: "cmj",
  analyzerVersion: "cmj-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev, ctx) => metrics(ev, ctx),
  calculateConfidence: (ev) => confidence(ev),
};

// argMax re-eksport używany w testach jednostkowych scenariuszy.
export { argMax };
