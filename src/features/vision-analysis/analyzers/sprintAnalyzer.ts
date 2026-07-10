import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { hipXSeries, timeSeries } from "../poseSeries";
import { movingAverage, interpolateShortGaps } from "../signal";
import {
  interpolateCrossingTime,
  averageSpeed,
  round,
  withinPlausibleRange,
  PLAUSIBLE_RANGES,
} from "../physics";

/**
 * Analizator sprintu na dystansie protokołu. Wynik liczbowy powstaje TYLKO,
 * gdy dostępna jest kalibracja linii (startLineX, finishLineX). Bez linii
 * odniesienia nie zgadujemy czasu — zwracamy NO_CALIBRATION → weryfikacja trenera.
 */
function makeSprint(testType: "sprint_20m" | "sprint_30m", distanceM: number): TestAnalyzer {
  const MIN_FPS = 120;

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const cal = ctx.calibration;
    if (!cal || cal.startLineX == null || cal.finishLineX == null) return [];
    const t = timeSeries(ctx.poses);
    const x = movingAverage(interpolateShortGaps(hipXSeries(ctx.poses)), 3);
    const dir = cal.finishLineX >= cal.startLineX ? 1 : -1;

    const cross = (line: number, type: string): DetectedEvent | null => {
      for (let i = 1; i < x.length; i++) {
        if (!Number.isFinite(x[i]) || !Number.isFinite(x[i - 1])) continue;
        const before = (x[i - 1] - line) * dir;
        const after = (x[i] - line) * dir;
        if (before < 0 && after >= 0) {
          const ts = interpolateCrossingTime(t[i - 1], x[i - 1], t[i], x[i], line);
          return { type, frameIndex: i, timestampSeconds: ts, confidence: 0.8 };
        }
      }
      return null;
    };

    const start = cross(cal.startLineX, "start_crossing");
    const finish = cross(cal.finishLineX, "finish_crossing");
    return [start, finish].filter((e): e is DetectedEvent => !!e);
  }

  function metrics(ev: DetectedEvent[]): CalculatedMetric[] {
    const start = ev.find((e) => e.type === "start_crossing");
    const finish = ev.find((e) => e.type === "finish_crossing");
    if (!start || !finish) return [];
    const time = finish.timestampSeconds - start.timestampSeconds;
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
    const conf = Math.min(start.confidence, finish.confidence);
    return [
      {
        key: "sprint_time_s",
        label: `Czas ${distanceM} m`,
        value: round(time, 2),
        unit: "s",
        confidence: conf,
      },
      {
        key: "avg_speed_ms",
        label: "Prędkość średnia",
        value: spd.ms,
        unit: "m/s",
        confidence: conf,
      },
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
    const cal = ctx.calibration;
    if (!cal || cal.startLineX == null) issues.push("MISSING_START_LINE");
    if (!cal || cal.finishLineX == null) issues.push("MISSING_FINISH_LINE");
    if (issues.length === 0 && events(ctx).length < 2) issues.push("EVENTS_NOT_DETECTED");
    // Brak linii → wymaga kalibracji/trenera (needs_review), nie twardy invalid.
    const hardFail: ValidationResult["issues"] = ["POSE_NOT_DETECTED", "MULTIPLE_PEOPLE"];
    const res = buildValidation(issues, hardFail);
    if (
      res.ok &&
      (issues.includes("MISSING_START_LINE") || issues.includes("MISSING_FINISH_LINE"))
    ) {
      return { ...res, ok: false, status: "needs_review" };
    }
    return res;
  }

  return {
    testType,
    analyzerVersion: `${testType}-1.0.0`,
    requiredCameraSetup: "side",
    minimumFps: MIN_FPS,
    requiresCalibration: true,
    validateRecording: validate,
    detectKeyEvents: async (ctx) => events(ctx),
    calculateMetrics: (ev) => metrics(ev),
    calculateConfidence: (ev) => confidence(ev),
  };
}

export const sprint20mAnalyzer = makeSprint("sprint_20m", 20);
export const sprint30mAnalyzer = makeSprint("sprint_30m", 30);
