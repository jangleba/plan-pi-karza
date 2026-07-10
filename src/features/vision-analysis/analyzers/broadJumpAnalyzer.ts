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
import { round } from "../physics";

const MIN_FPS = 60;

/**
 * Broad Jump — dystans w cm wymaga kalibracji przestrzeni (dwa punkty o znanej
 * odległości). Fazę odbicia/lądowania wykrywamy z pozy, ale bez kalibracji
 * NIE przeliczamy pikseli na centymetry → NO_CALIBRATION (weryfikacja trenera).
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) return [];
  return flightPhaseEvents(phase, ctx.poses);
}

function pxToMeters(ctx: AnalysisContext, dxNorm: number): number | null {
  const ref = ctx.calibration?.referencePoints;
  if (!ref) return null;
  const refDxNorm = Math.hypot(ref.b.x - ref.a.x, ref.b.y - ref.a.y);
  if (refDxNorm <= 0) return null;
  const metersPerNorm = ref.meters / refDxNorm;
  return dxNorm * metersPerNorm;
}

function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const landing = ev.find((e) => e.type === "landing");
  if (!takeoff || !landing) return [];
  const poses = ctx.poses;
  const startX = poses[takeoff.frameIndex]?.landmarks
    ? (poses[takeoff.frameIndex]!.landmarks![31].x + poses[takeoff.frameIndex]!.landmarks![32].x) / 2
    : null;
  const endX = poses[landing.frameIndex]?.landmarks
    ? (poses[landing.frameIndex]!.landmarks![31].x + poses[landing.frameIndex]!.landmarks![32].x) / 2
    : null;
  if (startX == null || endX == null) return [];
  const meters = pxToMeters(ctx, Math.abs(endX - startX));
  if (meters == null || meters <= 0) return []; // brak kalibracji → brak wyniku liczbowego
  const cm = round(meters * 100, 0);
  if (cm < 80 || cm > 380) return [];
  return [{ key: "distance_cm", label: "Długość skoku", value: cm, unit: "cm", confidence: takeoff.confidence * 0.7 }];
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = ev.length >= 2 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  if (events(ctx).length < 2) issues.push("EVENTS_NOT_DETECTED");
  if (!ctx.calibration?.referencePoints) issues.push("NO_CALIBRATION");
  const res = buildValidation(issues, ["POSE_NOT_DETECTED", "MULTIPLE_PEOPLE", "EVENTS_NOT_DETECTED"]);
  if (res.ok && issues.includes("NO_CALIBRATION")) return { ...res, ok: false, status: "needs_review" };
  return res;
}

export const broadJumpAnalyzer: TestAnalyzer = {
  testType: "broad_jump",
  analyzerVersion: "broad_jump-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: true,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev, ctx) => metrics(ev, ctx),
  calculateConfidence: (ev) => confidence(ev),
};
