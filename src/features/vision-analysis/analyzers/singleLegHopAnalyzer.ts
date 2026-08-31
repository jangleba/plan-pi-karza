import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { POSE } from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectFlightPhase, flightPhaseEvents } from "./jumpDetection";
import { round } from "../physics";
import { measureGroundHorizontalDistance } from "../horizontalDistance";
import {
  calcTemporalResolutionNearEvents,
  computeMeasurementAccuracy,
  distanceUncertaintyMm,
  formatResult,
  validateCalibrationQuality,
  SPRINT_FPS_POLICY,
  type MeasurementAccuracy,
} from "../measurementAccuracy";

const MIN_FPS = 60;

/**
 * Single Leg Hop for Distance — poziomy skok w dal z jednej nogi.
 * Rodzina GROUND_DISTANCE, protokół bilateralny (lewa/prawa strona osobno,
 * 2 prawidłowe próby na stronę, najlepszy wynik strony, asymetria L/R).
 *
 * Pomiar identyczny jak Broad Jump: pięta lądowania → homografia → mm →
 * prostopadła odległość od linii wybicia. Skok jednonóż: wybicie i lądowanie
 * na TEJ SAMEJ nodze — wykrywamy dominującą stronę (widoczność stóp).
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) return [];
  return flightPhaseEvents(phase, ctx.poses);
}

/** Wykrywa nogę odbicia/lądowania (side) z widoczności stóp w fazie kontaktu. */
function detectHopSide(ctx: AnalysisContext, ev: DetectedEvent[]): "left" | "right" | null {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const landing = ev.find((e) => e.type === "landing");
  if (!takeoff || !landing) return null;
  let leftVis = 0;
  let rightVis = 0;
  for (const idx of [takeoff.frameIndex, landing.frameIndex]) {
    const lm = ctx.poses[idx]?.landmarks;
    if (!lm) continue;
    leftVis += (lm[POSE.LEFT_HEEL]?.visibility ?? 0) + (lm[POSE.LEFT_FOOT_INDEX]?.visibility ?? 0);
    rightVis +=
      (lm[POSE.RIGHT_HEEL]?.visibility ?? 0) + (lm[POSE.RIGHT_FOOT_INDEX]?.visibility ?? 0);
  }
  if (leftVis === 0 && rightVis === 0) return null;
  return leftVis >= rightVis ? "left" : "right";
}

function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  const takeoff = ev.find((e) => e.type === "takeoff");
  if (!takeoff) return [];
  const heel = measureGroundHorizontalDistance(ctx, ev);
  if (!heel.ok) return [];
  const side = detectHopSide(ctx, ev) ?? heel.side;
  return [
    {
      key: "distance_cm",
      label: "Długość hopa",
      value: heel.distanceCm,
      unit: "cm",
      confidence: round(takeoff.confidence * 0.9, 2),
    },
    {
      key: "side",
      label: "Noga",
      value: side === "left" ? 0 : 1,
      unit: side === "left" ? "L" : "P",
      confidence: round(takeoff.confidence, 2),
    },
  ];
}

function accuracy(
  ev: DetectedEvent[],
  mtx: CalculatedMetric[],
  ctx: AnalysisContext,
): { measurement: MeasurementAccuracy; metrics: CalculatedMetric[] } {
  const temporal = calcTemporalResolutionNearEvents(ctx.poses, ev);

  const record = ctx.calibrationRecord ?? null;
  const H = record?.homographyMatrix ?? ctx.calibration?.homography ?? null;
  const reproPx =
    record?.reprojectionErrorPx ?? ctx.calibration?.profileMatch?.reprojectionErrorPx ?? null;
  const mmPerPx = ctx.calibration?.metersPerPixel ? ctx.calibration.metersPerPixel * 1000 : 3;
  const calibration = validateCalibrationQuality({
    required: true,
    present: !!H,
    reprojectionErrorPx: reproPx,
  });

  const dist = mtx.find((m) => m.key === "distance_cm");
  const distMm = (dist?.value ?? 0) * 10;

  const reprojectionErrorMm = (reproPx ?? 1) * mmPerPx;
  const landmarkDetectionErrorMm = 3 * mmPerPx;
  const motionBlurErrorMm = 2 * mmPerPx;
  const totalDistanceUncertaintyMm = distanceUncertaintyMm([
    reprojectionErrorMm,
    landmarkDetectionErrorMm,
    motionBlurErrorMm,
  ]);
  const relUnc = distMm > 0 ? totalDistanceUncertaintyMm / distMm : 1;

  const enriched = mtx.map((m) => {
    if (m.key !== "distance_cm") return m;
    const uncCm = totalDistanceUncertaintyMm / 10;
    const f = formatResult(m.value, uncCm, m.unit);
    return {
      ...m,
      uncertainty: f.uncertainty,
      displayPrecision: f.displayPrecision,
      display: f.display,
    };
  });

  const measurement = computeMeasurementAccuracy({
    domain: "spatial",
    fpsPolicy: SPRINT_FPS_POLICY,
    temporal,
    spatial: {
      mmPerPixel: round(mmPerPx, 4),
      spatialResolutionMm: round(mmPerPx, 4),
      reliable: !!H,
    },
    calibration,
    relativeUncertainty: relUnc,
    maxRelativeUncertainty: 0.05,
    repeatability: "verified",
    protocolMatch: ev.length >= 2,
    referenceValidated: false,
  });

  return { measurement, metrics: enriched };
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = ev.length >= 2 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const ev = events(ctx);
  const hasEvents = ev.length >= 2;
  const hasHomography =
    !!(ctx.calibrationRecord?.homographyMatrix ?? ctx.calibration?.homography) &&
    !!ctx.calibrationRecord?.takeoffLinePx;
  if (!hasEvents) issues.push("EVENTS_NOT_DETECTED");
  if (!hasHomography) issues.push("NO_CALIBRATION");
  const res = buildValidation(issues, [
    "POSE_NOT_DETECTED",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
  ]);
  if (res.ok && !hasHomography) return { ...res, ok: false, status: "needs_review" };
  return res;
}

export const singleLegHopAnalyzer: TestAnalyzer = {
  testType: "single_leg_hop",
  analyzerVersion: "single_leg_hop-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: true,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev, ctx) => metrics(ev, ctx),
  calculateConfidence: (ev) => confidence(ev),
  computeAccuracy: (ev, mtx, ctx) => accuracy(ev, mtx, ctx),
};
