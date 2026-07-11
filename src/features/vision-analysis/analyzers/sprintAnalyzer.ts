import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
  QualityIssueCode,
  TimingLineRole,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { averageSpeed, round, withinPlausibleRange, PLAUSIBLE_RANGES } from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { SPRINT_FPS_POLICY } from "../measurementAccuracy";
import { vlog } from "../devLog";
import { elapsedSeconds } from "../calibratedLineCrossing";
import {
  TimingLineRegistry,
  detectTimingPlaneCrossings,
  type TimingPlaneResult,
  type TimingPlaneCrossing,
} from "../timingPlane";

/**
 * Silnik sprintu z importowanego filmu — wspólny dla wszystkich testów sprintu.
 *
 * Cały pomiar czasu przechodzi przez Timing Plane:
 *  - TimingLineRegistry dostarcza linie z rolami (START/FINISH/TIMING_A/TIMING_B)
 *    i znanymi punktami podłoża (mm),
 *  - TimingPlaneCrossingEngine wykrywa przecięcie płaszczyzny pomiarowej stałym
 *    punktem tułowia (nie rzutuje barków przez homografię podłoża),
 *  - CrossingUncertaintyCalculator wylicza niepewność z realnych sourceTimestampUs.
 *
 * Dystans NIE wynika z rozmiaru sylwetki. Sprint 20/30 m ma dystans fizycznie
 * znany (protokół); Flying Sprint pobiera dystans wyłącznie z kalibracji linii.
 *
 * Wynik jest OFFICIAL / ESTIMATED (przy podwyższonej niepewności) albo test jest
 * BLOKOWANY (REJECTED) — nigdy nie udajemy oficjalnego czasu.
 */

type SprintVariant = "sprint_20m" | "sprint_30m" | "flying_sprint";

interface SprintConfig {
  testType: SprintVariant;
  roles: [TimingLineRole, TimingLineRole];
  /** Dystans fizycznie znany z protokołu (m) lub null — wtedy tylko z kalibracji. */
  protocolDistanceM: number | null;
  timeKey: string;
  timeLabel: string;
}

function makeSprint(cfg: SprintConfig): TestAnalyzer {
  const MIN_FPS = 120;

  function runEngine(ctx: AnalysisContext): TimingPlaneResult {
    const registry = TimingLineRegistry.from(ctx.calibration?.timingLines);
    return detectTimingPlaneCrossings({
      poses: ctx.poses,
      homography: ctx.calibration?.homography ?? null,
      registry,
      requiredRoles: cfg.roles,
      width: ctx.metadata.width,
      height: ctx.metadata.height,
      cameraStable: ctx.calibration?.cameraMoved ? false : true,
      protocolDistanceMm: cfg.protocolDistanceM != null ? cfg.protocolDistanceM * 1000 : null,
    });
  }

  function ordered(crossings: TimingPlaneCrossing[]): TimingPlaneCrossing[] {
    return [...crossings].sort((a, b) => a.crossingTimestampUs - b.crossingTimestampUs);
  }

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const res = runEngine(ctx);
    vlog(
      `${cfg.testType} timing_plane`,
      res.ok ? `${res.resultQuality} d=${res.distanceMm}mm` : res.code,
      res.debug,
    );
    if (!res.ok || res.crossings.length < 2) return [];
    const [start, finish] = ordered(res.crossings);
    // ESTIMATED nadal daje zdarzenia, ale z obniżoną pewnością.
    const conf = res.resultQuality === "OFFICIAL" ? 0.9 : 0.7;
    const startType = cfg.testType === "flying_sprint" ? "timing_a_crossing" : "start_crossing";
    const finishType = cfg.testType === "flying_sprint" ? "timing_b_crossing" : "finish_crossing";
    return [
      {
        type: startType,
        frameIndex: start.frameAfterIndex,
        timestampSeconds: start.crossingTimestampUs / 1_000_000,
        confidence: conf,
      },
      {
        type: finishType,
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
    const distanceM = round(res.distanceMm / 1000, 3);
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
    const timeUncS = round(res.elapsedUncertaintyMs / 1000, 4);
    return [
      {
        key: cfg.timeKey,
        label: cfg.timeLabel,
        value: round(time, 2),
        unit: "s",
        confidence: conf,
        uncertainty: timeUncS,
      },
      { key: "distance_m", label: "Dystans", value: distanceM, unit: "m", confidence: conf },
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
      "MISSING_TIMING_LINE",
      "ATHLETE_TOO_SMALL",
      "TORSO_OCCLUDED",
      "INVALID_CAMERA_GEOMETRY",
      "DISTANCE_UNKNOWN",
    ];
    return buildValidation(issues, hardFail);
  }

  return {
    testType: cfg.testType,
    analyzerVersion: `${cfg.testType}-4.0.0`,
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
        timeKey: cfg.timeKey,
        distanceM: cfg.protocolDistanceM ?? undefined,
      }),
  };
}

export const sprint20mAnalyzer = makeSprint({
  testType: "sprint_20m",
  roles: ["START", "FINISH"],
  protocolDistanceM: 20,
  timeKey: "sprint_time_s",
  timeLabel: "Czas 20 m",
});

export const sprint30mAnalyzer = makeSprint({
  testType: "sprint_30m",
  roles: ["START", "FINISH"],
  protocolDistanceM: 30,
  timeKey: "sprint_time_s",
  timeLabel: "Czas 30 m",
});

export const flyingSprintAnalyzer = makeSprint({
  testType: "flying_sprint",
  roles: ["TIMING_A", "TIMING_B"],
  protocolDistanceM: null,
  timeKey: "flying_time_s",
  timeLabel: "Czas latającego odcinka",
});
