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
import { round } from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { SPRINT_FPS_POLICY, JUMP_FPS_POLICY } from "../measurementAccuracy";
import { vlog } from "../devLog";
import { TimingLineRegistry } from "../timingPlane";
import { detectBraking, type BrakingResult } from "../brakingEngine";
import { detectCodFiveTenFive, type CodResult } from "../codEngine";

/**
 * COD / Braking (5-10-5, Sprint-to-Stop).
 *
 * 5-10-5 przechodzi przez wspólny CodEngine (CENTER + TURN_LEFT + TURN_RIGHT):
 * ścisła sekwencja start → zwrot → środek → zwrot → środek. Zwykły bieg bez
 * zwrotu NIE może przejść jako COD.
 *
 * Sprint-to-Stop (hamowanie, DECELERATION) mierzy czas między skalibrowanymi
 * liniami przez CalibratedLineCrossingEngine (bez wymogu zwrotu).
 *
 * TUŁÓW → pomiar przecięć płaszczyzny czasowej. STOPA → potwierdzenie dotarcia
 * do linii/strefy zwrotu, kontakt nogi zwrotnej, poprawność strefy.
 */

// ---------------------------------------------------------------------------
// 5-10-5 — przez wspólny CodEngine
// ---------------------------------------------------------------------------

function makeFiveTenFive(): TestAnalyzer {
  const testType = "five_ten_five" as const;
  const MIN_FPS = 60;

  function runEngine(ctx: AnalysisContext): CodResult {
    return detectCodFiveTenFive({
      poses: ctx.poses,
      homography: ctx.calibration?.homography ?? null,
      registry: TimingLineRegistry.from(ctx.calibration?.timingLines),
      width: ctx.metadata.width,
      height: ctx.metadata.height,
      cameraStable: ctx.calibration?.cameraMoved ? false : true,
    });
  }

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const res = runEngine(ctx);
    vlog(`${testType} cod`, res.ok ? `${res.resultQuality} t=${res.totalTimeS}s` : res.code, res.debug);
    if (!res.ok) return [];
    const conf = res.resultQuality === "OFFICIAL" ? 0.9 : 0.7;
    const [start, , final] = res.crossings;
    return [
      {
        type: "movement_start",
        frameIndex: start.frameAfterIndex,
        timestampSeconds: start.crossingTimestampUs / 1_000_000,
        confidence: conf,
      },
      {
        type: "stop",
        frameIndex: final.frameAfterIndex,
        timestampSeconds: final.crossingTimestampUs / 1_000_000,
        confidence: conf,
      },
    ];
  }

  function metrics(_ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
    const res = runEngine(ctx);
    if (!res.ok) return [];
    const total = res.totalTimeS;
    if (!(total > 0 && total <= 20)) return [];
    const conf = res.resultQuality === "OFFICIAL" ? 0.9 : 0.7;
    return [
      {
        key: "total_time_s",
        label: "Czas całkowity",
        value: round(total, 2),
        unit: "s",
        confidence: conf,
        uncertainty: round(res.elapsedUncertaintyMs / 1000, 4),
      },
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
      "TIMING_LINES_REQUIRED",
      "TIMING_PLANE_CALIBRATION_FAILED",
      "TURN_NOT_DETECTED",
      "TURN_LINE_NOT_REACHED",
      "WRONG_LINE_SEQUENCE",
      "WRONG_CROSSING_DIRECTION",
      "WRONG_TURNING_SIDE",
      "CROSSING_UNCERTAINTY_TOO_HIGH",
      "CALIBRATION_CAMERA_MOVED",
    ];
    return buildValidation(issues, hardFail);
  }

  return {
    testType,
    analyzerVersion: `${testType}-4.0.0`,
    requiredCameraSetup: "front",
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
        fpsPolicy: JUMP_FPS_POLICY,
        timeKey: "total_time_s",
      }),
  };
}

// ---------------------------------------------------------------------------
// Sprint-to-Stop — hamowanie (DECELERATION), dwie skalibrowane linie
// ---------------------------------------------------------------------------

function makeSprintToStop(): TestAnalyzer {
  const testType = "sprint_to_stop" as const;
  const MIN_FPS = 120;

  function runEngine(ctx: AnalysisContext): BrakingResult {
    return detectBraking({
      poses: ctx.poses,
      homography: ctx.calibration?.homography ?? null,
      registry: TimingLineRegistry.from(ctx.calibration?.timingLines),
      width: ctx.metadata.width,
      height: ctx.metadata.height,
      cameraStable: ctx.calibration?.cameraMoved ? false : true,
      knownEntrySpeedMs: ctx.calibration?.knownEntrySpeedMs ?? null,
    });
  }

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const res = runEngine(ctx);
    vlog(
      `${testType} braking`,
      res.ok ? `${res.mode} ${res.resultQuality} brakingTime=${res.brakingTimeS}s` : res.code,
      res.debug,
    );
    if (!res.ok) return [];
    const conf = res.resultQuality === "OFFICIAL" ? 0.9 : res.resultQuality === "ESTIMATED" ? 0.75 : 0.6;
    const frameAt = (tsUs: number) => {
      let best = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < ctx.poses.length; i++) {
        const t = ctx.poses[i]?.sourceTimestampUs;
        if (typeof t !== "number") continue;
        const d = Math.abs(t - tsUs);
        if (d < bestDiff) {
          bestDiff = d;
          best = i;
        }
      }
      return best;
    };
    return [
      {
        type: "movement_start",
        frameIndex: frameAt(res.brakingStartTimestampUs),
        timestampSeconds: res.brakingStartTimestampUs / 1_000_000,
        confidence: conf,
      },
      {
        type: "stop",
        frameIndex: frameAt(res.stopTimestampUs),
        timestampSeconds: res.stopTimestampUs / 1_000_000,
        confidence: conf,
      },
    ];
  }

  function metrics(_ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
    const res = runEngine(ctx);
    if (!res.ok) return [];
    const conf = res.resultQuality === "OFFICIAL" ? 0.9 : res.resultQuality === "ESTIMATED" ? 0.75 : 0.6;
    const out: CalculatedMetric[] = [];
    // Czas hamowania jest dozwolony także w trybie TECHNIQUE_ONLY.
    if (res.brakingTimeS > 0 && res.brakingTimeS <= 20) {
      out.push({
        key: "braking_time_s",
        label: "Czas hamowania",
        value: round(res.brakingTimeS, 2),
        unit: "s",
        confidence: conf,
        uncertainty: round(res.elapsedUncertaintyMs / 1000, 4),
      });
    }
    out.push({
      key: "braking_contacts",
      label: "Kontakty hamujące",
      value: res.contactsDuringBraking,
      unit: "",
      confidence: conf,
    });
    // Prędkość, metry i droga hamowania TYLKO przy pełnej kalibracji.
    if (res.mode === "CALIBRATED") {
      if (res.entrySpeedMs != null && res.entrySpeedMs > 0) {
        out.push({
          key: "entry_speed_ms",
          label: "Prędkość wejściowa",
          value: round(res.entrySpeedMs, 2),
          unit: "m/s",
          confidence: conf,
        });
      }
      if (res.brakingDistanceMm != null && res.brakingDistanceMm > 0) {
        out.push({
          key: "braking_distance_m",
          label: "Droga hamowania",
          value: round(res.brakingDistanceMm / 1000, 2),
          unit: "m",
          confidence: conf,
        });
      }
    }
    return out;
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
      "BRAKING_ZONE_REQUIRED",
      "TIMING_PLANE_CALIBRATION_FAILED",
      "ENTRY_SPEED_UNKNOWN",
      "INVALID_APPROACH_SPRINT",
      "NO_SPEED_REDUCTION",
      "STOP_NOT_DETECTED",
      "STOP_OUT_OF_ZONE",
      "DIRECTION_CHANGE_NOT_STOP",
      "CROSSING_UNCERTAINTY_TOO_HIGH",
      "CALIBRATION_CAMERA_MOVED",
    ];
    const built = buildValidation(issues, hardFail);
    // Tryb bez kalibracji, ale z poprawnie wykrytym hamowaniem → technique_only.
    if (built.ok && res.ok && res.mode === "TECHNIQUE_ONLY") {
      return { ...built, status: "technique_only" };
    }
    return built;
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
        timeKey: "total_time_s",
      }),
  };
}

export const fiveTenFiveAnalyzer = makeFiveTenFive();
export const sprintToStopAnalyzer = makeSprintToStop();
