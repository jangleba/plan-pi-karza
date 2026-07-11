import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
  QualityIssueCode,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { averageSpeed, round, withinPlausibleRange, PLAUSIBLE_RANGES } from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { SPRINT_FPS_POLICY } from "../measurementAccuracy";
import {
  detectCalibratedCrossings,
  elapsedSeconds,
  type LineCrossing,
  type CrossingResult,
} from "../calibratedLineCrossing";

/**
 * Sprint na dystansie protokołu (20 / 30 m).
 *
 * Pomiar czasu opiera się WYŁĄCZNIE na CalibratedLineCrossingEngine:
 *  - skalibrowane linie startu i mety leżą na podłożu (Timing Plane),
 *  - stały punkt tułowia przecina rzut linii,
 *  - moment przecięcia interpolowany między rzeczywistymi sourceTimestampUs.
 *
 * Bez ściśle zgodnej kalibracji, widocznej linii i poprawnej geometrii kamery
 * test jest BLOKOWANY — nie zwracamy wyniku orientacyjnego.
 */
function makeSprint(testType: "sprint_20m" | "sprint_30m", distanceM: number): TestAnalyzer {
  const MIN_FPS = 120;

  function runEngine(ctx: AnalysisContext): CrossingResult {
    return detectCalibratedCrossings({
      poses: ctx.poses,
      homography: ctx.calibration?.homography ?? null,
      timingLines: ctx.calibration?.timingLines,
      width: ctx.metadata.width,
      height: ctx.metadata.height,
      cameraStable: ctx.calibration?.cameraMoved ? false : true,
    });
  }

  /** Sortuje przecięcia po interpolowanym czasie — start = pierwsze, meta = ostatnie. */
  function ordered(crossings: LineCrossing[]): LineCrossing[] {
    return [...crossings].sort((a, b) => a.crossingTimestampUs - b.crossingTimestampUs);
  }

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const res = runEngine(ctx);
    vlog(`${testType} line_crossing`, res.ok ? "OK" : res.code, res.debug);
    if (!res.ok || res.crossings.length < 2) return [];
    const [start, finish] = ordered(res.crossings);
    const conf = 0.9;
    return [
      {
        type: "start_crossing",
        frameIndex: start.frameAfterIndex,
        timestampSeconds: start.crossingTimestampUs / 1_000_000,
        confidence: conf,
      },
      {
        type: "finish_crossing",
        frameIndex: finish.frameAfterIndex,
        timestampSeconds: finish.crossingTimestampUs / 1_000_000,
        confidence: conf,
      },
    ];
  }

  function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
    const res = runEngine(ctx);
    if (!res.ok || res.crossings.length < 2) return [];
    const [start, finish] = ordered(res.crossings);
    const time = elapsedSeconds(start, finish);
    if (time <= 0) return [];
    const spd = averageSpeed(distanceM, time);
    if (
      !withinPlausibleRange(
        spd.ms,
        PLAUSIBLE_RANGES.sprint_speed_ms.min,
        PLAUSIBLE_RANGES.sprint_speed_ms.max,
      )
    )
      return [];
    const conf = Math.min(...ev.map((e) => e.confidence));
    return [
      { key: "sprint_time_s", label: `Czas ${distanceM} m`, value: round(time, 2), unit: "s", confidence: conf },
      { key: "avg_speed_ms", label: "Prędkość średnia", value: spd.ms, unit: "m/s", confidence: conf },
      { key: "avg_speed_kmh", label: "Prędkość", value: spd.kmh, unit: "km/h", confidence: conf },
    ];
  }

  function confidence(ev: DetectedEvent[]): ConfidenceResult {
    const perEvent = ev.map((e) => e.confidence);
    const overall = ev.length >= 2 ? Math.min(...perEvent) : 0;
    return { overall: round(overall, 2), perEvent };
  }

  function validate(ctx: AnalysisContext): ValidationResult {
    const { issues } = baseValidation(ctx, MIN_FPS);
    const res = runEngine(ctx);
    if (!res.ok) issues.push(res.code as QualityIssueCode);
    const hardFail: QualityIssueCode[] = [
      "POSE_NOT_DETECTED",
      "MULTIPLE_PEOPLE",
      "TIMING_LINE_NOT_CALIBRATED",
      "TIMING_PLANE_CALIBRATION_FAILED",
      "LINE_CROSSING_NOT_DETECTED",
      "WRONG_CROSSING_DIRECTION",
      "CROSSING_UNCERTAINTY_TOO_HIGH",
      "CALIBRATION_CAMERA_MOVED",
    ];
    return buildValidation(issues, hardFail);
  }

  return {
    testType,
    analyzerVersion: `${testType}-3.0.0`,
    requiredCameraSetup: "side",
    minimumFps: MIN_FPS,
    requiresCalibration: true,
    validateRecording: validate,
    detectKeyEvents: async (ctx) => events(ctx),
    calculateMetrics: (ev, ctx) => metrics(ev, ctx),
    calculateConfidence: (ev) => confidence(ev),
    computeAccuracy: (ev, mtx, ctx) =>
      temporalAccuracy({
        ev,
        metrics: mtx,
        ctx,
        fpsPolicy: SPRINT_FPS_POLICY,
        timeKey: "sprint_time_s",
        distanceM,
      }),
  };
}

export const sprint20mAnalyzer = makeSprint("sprint_20m", 20);
export const sprint30mAnalyzer = makeSprint("sprint_30m", 30);
