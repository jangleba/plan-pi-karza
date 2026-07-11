import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectFlightPhase, flightPhaseEvents, detectCountermovement } from "./jumpDetection";
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

/**
 * Squat Jump: start z zatrzymania w pozycji przysiadu, BEZ dynamicznego zejścia
 * bezpośrednio przed wybiciem. CMJ (z countermovement) NIE może przejść jako
 * Squat Jump — walidacja odrzuca go jako TEST_PROTOCOL_MISMATCH.
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) return [];
  return flightPhaseEvents(phase, ctx.poses);
}

function metrics(ev: DetectedEvent[]): CalculatedMetric[] {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const landing = ev.find((e) => e.type === "landing");
  if (!takeoff || !landing) return [];
  const flightTime = landing.timestampSeconds - takeoff.timestampSeconds;
  if (
    !withinPlausibleRange(flightTime, PLAUSIBLE_RANGES.flight_time_s.min, PLAUSIBLE_RANGES.flight_time_s.max)
  )
    return [];
  const heightCm = flightTimeToHeightCm(flightTime);
  if (
    !withinPlausibleRange(heightCm, PLAUSIBLE_RANGES.jump_height_cm.min, PLAUSIBLE_RANGES.jump_height_cm.max)
  )
    return [];
  const conf = takeoff.confidence;
  return [
    { key: "jump_height_cm", label: "Wysokość wyskoku", value: heightCm, unit: "cm", confidence: conf },
    { key: "flight_time_s", label: "Czas w powietrzu", value: round(flightTime, 3), unit: "s", confidence: conf },
  ];
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = perEvent.length >= 2 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) {
    issues.push("EVENTS_NOT_DETECTED");
  } else {
    const cm = detectCountermovement(ctx.poses, phase.takeoffFrame);
    // Wykryto dynamiczne zejście → to CMJ, nie Squat Jump.
    if (cm.present) issues.push("TEST_PROTOCOL_MISMATCH");
  }
  return buildValidation(issues, [
    "INSUFFICIENT_FPS",
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
    "TEST_PROTOCOL_MISMATCH",
  ]);
}

function accuracy(
  ev: DetectedEvent[],
  mtx: CalculatedMetric[],
  ctx: AnalysisContext,
): { measurement: MeasurementAccuracy; metrics: CalculatedMetric[] } {
  const timestampsUs = ctx.poses
    .map((p) => p.sourceTimestampUs)
    .filter((t): t is number => typeof t === "number");
  const temporal = calcTemporalResolution(timestampsUs);
  const calibration = validateCalibrationQuality({ required: false, present: false });
  const flightTime = mtx.find((m) => m.key === "flight_time_s")?.value ?? 0;
  const evUnc = eventUncertaintyMs({ frameIntervalMs: temporal.frameIntervalMs });
  const flightUncS = summedTimeUncertaintyMs(evUnc, evUnc) / 1000;
  const heightUncCm = jumpHeightUncertaintyCm(flightTime, flightUncS);
  const relUnc = flightTime > 0 ? flightUncS / flightTime : 1;

  const enriched = mtx.map((m) => {
    if (m.key === "flight_time_s") {
      const f = formatResult(m.value, flightUncS, m.unit);
      return { ...m, uncertainty: f.uncertainty, displayPrecision: f.displayPrecision, display: f.display };
    }
    if (m.key === "jump_height_cm") {
      const f = formatResult(m.value, heightUncCm, m.unit);
      return { ...m, uncertainty: f.uncertainty, displayPrecision: f.displayPrecision, display: f.display };
    }
    return m;
  });

  const measurement = computeMeasurementAccuracy({
    domain: "temporal",
    fpsPolicy: JUMP_FPS_POLICY,
    temporal,
    calibration,
    relativeUncertainty: relUnc,
    maxRelativeUncertainty: 0.05,
    repeatability: "verified",
    protocolMatch: ev.length >= 2,
    referenceValidated: false,
  });
  return { measurement, metrics: enriched };
}

export const squatJumpAnalyzer: TestAnalyzer = {
  testType: "squat_jump",
  analyzerVersion: "squat-jump-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev) => metrics(ev),
  calculateConfidence: (ev) => confidence(ev),
  computeAccuracy: (ev, mtx, ctx) => accuracy(ev, mtx, ctx),
};
