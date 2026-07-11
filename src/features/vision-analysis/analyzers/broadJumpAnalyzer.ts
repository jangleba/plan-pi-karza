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
import { estimateScaleFromHeight } from "../autoCalibration";
import { groundDistanceMm } from "../homographyGeometry";
import {
  calcTemporalResolution,
  computeMeasurementAccuracy,
  distanceUncertaintyMm,
  formatResult,
  validateCalibrationQuality,
  SPRINT_FPS_POLICY,
  type MeasurementAccuracy,
} from "../measurementAccuracy";

const MIN_FPS = 60;

/**
 * Broad Jump — długość skoku w cm. Skalę pikseli na metry uzyskujemy z:
 *  A) ręcznej kalibracji (referencePoints o znanej odległości), albo
 *  B) auto-kalibracji z rzeczywistego wzrostu zawodnika.
 * Bez żadnej z tych podstaw nie przeliczamy pikseli na cm → needs_review.
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  const phase = detectFlightPhase(ctx.poses);
  if (!phase) return [];
  return flightPhaseEvents(phase, ctx.poses);
}

/** Zwraca metry na piksel z profilu kalibracji, kalibracji ręcznej lub auto (wzrost). */
function metersPerPixel(ctx: AnalysisContext): { mpp: number; confMul: number } | null {
  // Automatycznie dopasowany profil kalibracji (najwyższa wiarygodność).
  const mppProfile = ctx.calibration?.metersPerPixel;
  if (mppProfile && mppProfile > 0) {
    const confMul = ctx.calibration?.profileMatch?.exact === false ? 0.85 : 1;
    return { mpp: mppProfile, confMul };
  }
  const ref = ctx.calibration?.referencePoints;
  if (ref) {
    const dxPx = Math.hypot(
      (ref.b.x - ref.a.x) * ctx.metadata.width,
      (ref.b.y - ref.a.y) * ctx.metadata.height,
    );
    if (dxPx > 0) return { mpp: ref.meters / dxPx, confMul: 1 };
  }
  const scale = estimateScaleFromHeight(
    ctx.poses,
    ctx.athleteHeightCm,
    ctx.metadata.width,
    ctx.metadata.height,
  );
  if (scale) return { mpp: scale.metersPerPixel, confMul: scale.confidence };
  return null;
}

/** Piksel stopy (u,v) w danej klatce — średnia z lewej/prawej stopy. */
function footPixel(ctx: AnalysisContext, frameIndex: number): { u: number; v: number } | null {
  const lm = ctx.poses[frameIndex]?.landmarks;
  if (!lm) return null;
  const u = ((lm[31].x + lm[32].x) / 2) * ctx.metadata.width;
  const v = ((lm[31].y + lm[32].y) / 2) * ctx.metadata.height;
  return { u, v };
}

/** Długość skoku (cm) — homografia ma pierwszeństwo, inaczej skala/piksele. */
function jumpDistanceCm(
  ev: DetectedEvent[],
  ctx: AnalysisContext,
): { cm: number; viaHomography: boolean; confMul: number } | null {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const landing = ev.find((e) => e.type === "landing");
  if (!takeoff || !landing) return null;

  // Tryb podstawowy: rzut pikseli stóp na płaszczyznę podłoża przez homografię.
  const H = ctx.calibration?.homography;
  if (H) {
    const a = footPixel(ctx, takeoff.frameIndex);
    const b = footPixel(ctx, landing.frameIndex);
    if (a && b) {
      const mm = groundDistanceMm(H, a, b);
      if (mm != null && mm > 0) {
        const cm = round(mm / 10, 0);
        if (cm >= 80 && cm <= 380) return { cm, viaHomography: true, confMul: 1 };
      }
    }
  }

  // Tryb zapasowy (nieoficjalny): skala metry/piksel.
  const startX = ctx.poses[takeoff.frameIndex]?.landmarks
    ? (ctx.poses[takeoff.frameIndex]!.landmarks![31].x +
        ctx.poses[takeoff.frameIndex]!.landmarks![32].x) /
      2
    : null;
  const endX = ctx.poses[landing.frameIndex]?.landmarks
    ? (ctx.poses[landing.frameIndex]!.landmarks![31].x +
        ctx.poses[landing.frameIndex]!.landmarks![32].x) /
      2
    : null;
  if (startX == null || endX == null) return null;
  const scale = metersPerPixel(ctx);
  if (!scale) return null;
  const dxPx = Math.abs(endX - startX) * ctx.metadata.width;
  const meters = dxPx * scale.mpp;
  if (meters <= 0) return null;
  const cm = round(meters * 100, 0);
  if (cm < 80 || cm > 380) return null;
  return { cm, viaHomography: false, confMul: scale.confMul };
}

function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  const takeoff = ev.find((e) => e.type === "takeoff");
  const d = jumpDistanceCm(ev, ctx);
  if (!takeoff || !d) return [];
  return [
    {
      key: "distance_cm",
      label: "Długość skoku",
      value: d.cm,
      unit: "cm",
      confidence: round(takeoff.confidence * 0.9 * d.confMul, 2),
    },
  ];
}

/**
 * Warstwa niepewności przestrzennej. Sumuje (RSS) źródła błędu w mm:
 * reprojekcja kalibracji, detekcja landmarków stóp i rozmycie ruchu.
 */
function accuracy(
  ev: DetectedEvent[],
  mtx: CalculatedMetric[],
  ctx: AnalysisContext,
): { measurement: MeasurementAccuracy; metrics: CalculatedMetric[] } {
  const timestampsUs = ctx.poses
    .map((p) => p.sourceTimestampUs)
    .filter((t): t is number => typeof t === "number");
  const temporal = calcTemporalResolution(timestampsUs);

  const H = ctx.calibration?.homography;
  const reproPx = ctx.calibration?.profileMatch?.reprojectionErrorPx ?? null;
  const mmPerPx = ctx.calibration?.metersPerPixel
    ? ctx.calibration.metersPerPixel * 1000
    : 3; // ~3 mm/px konserwatywnie, gdy brak profilu
  const calibration = validateCalibrationQuality({
    required: true,
    present: !!H,
    reprojectionErrorPx: reproPx,
  });

  const dist = mtx.find((m) => m.key === "distance_cm");
  const distMm = (dist?.value ?? 0) * 10;

  // Źródła niepewności (mm).
  const reprojectionErrorMm = (reproPx ?? 1) * mmPerPx;
  const markerDetectionErrorMm = 2 * mmPerPx; // ±2 px na zaznaczenie markera
  const landmarkDetectionErrorMm = 3 * mmPerPx; // ±3 px na landmark stopy
  const motionBlurErrorMm = 2 * mmPerPx; // rozmycie przy szybkim ruchu
  const totalDistanceUncertaintyMm = distanceUncertaintyMm([
    reprojectionErrorMm,
    markerDetectionErrorMm,
    landmarkDetectionErrorMm,
    motionBlurErrorMm,
  ]);
  const relUnc = distMm > 0 ? totalDistanceUncertaintyMm / distMm : 1;

  const enriched = mtx.map((m) => {
    if (m.key !== "distance_cm") return m;
    const uncCm = totalDistanceUncertaintyMm / 10;
    const f = formatResult(m.value, uncCm, m.unit);
    return { ...m, uncertainty: f.uncertainty, displayPrecision: f.displayPrecision, display: f.display };
  });

  const measurement = computeMeasurementAccuracy({
    domain: "spatial",
    fpsPolicy: SPRINT_FPS_POLICY,
    temporal,
    spatial: { mmPerPixel: round(mmPerPx, 4), spatialResolutionMm: round(mmPerPx, 4), reliable: !!H },
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
  const hasEvents = events(ctx).length >= 2;
  const hasScale = metersPerPixel(ctx) != null;
  if (!hasEvents) issues.push("EVENTS_NOT_DETECTED");
  if (!hasScale) issues.push("NO_CALIBRATION");
  const res = buildValidation(issues, [
    "POSE_NOT_DETECTED",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
  ]);
  if (res.ok && !hasScale) return { ...res, ok: false, status: "needs_review" };
  return res;
}

export const broadJumpAnalyzer: TestAnalyzer = {
  testType: "broad_jump",
  analyzerVersion: "broad_jump-2.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev, ctx) => metrics(ev, ctx),
  calculateConfidence: (ev) => confidence(ev),
};
