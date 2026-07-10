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
import { movingAverage, interpolateShortGaps, derivative } from "../signal";
import {
  interpolateCrossingTime,
  averageSpeed,
  round,
  withinPlausibleRange,
  PLAUSIBLE_RANGES,
} from "../physics";
import { estimateScaleFromHeight } from "../autoCalibration";

/**
 * Analizator sprintu na dystansie protokołu (20 / 30 m).
 *
 * Wynik liczbowy powstaje w jednym z dwóch trybów:
 *  A) kalibracja linii (startLineX, finishLineX) — przecięcie linii z klatek,
 *  B) auto-kalibracja skali z wzrostu zawodnika — start = moment ruszenia,
 *     meta = klatka, w której zawodnik pokonał znany dystans.
 *
 * Bez żadnej z tych podstaw nie zgadujemy czasu → needs_review (trener).
 */
function makeSprint(testType: "sprint_20m" | "sprint_30m", distanceM: number): TestAnalyzer {
  const MIN_FPS = 120;

  // --- Tryb A: przecięcia linii ---
  function lineEvents(ctx: AnalysisContext): DetectedEvent[] {
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
          return { type, frameIndex: i, timestampSeconds: ts, confidence: 0.85 };
        }
      }
      return null;
    };

    const start = cross(cal.startLineX, "start_crossing");
    const finish = cross(cal.finishLineX, "finish_crossing");
    return [start, finish].filter((e): e is DetectedEvent => !!e);
  }

  // --- Tryb B: auto-kalibracja z wzrostu ---
  function autoEvents(ctx: AnalysisContext): DetectedEvent[] {
    const scale = estimateScaleFromHeight(
      ctx.poses,
      ctx.athleteHeightCm,
      ctx.metadata.width,
      ctx.metadata.height,
    );
    if (!scale) return [];

    const t = timeSeries(ctx.poses);
    const x = movingAverage(interpolateShortGaps(hipXSeries(ctx.poses)), 3);
    const vel = derivative(x, t);
    const finiteVel = vel.filter((v) => Number.isFinite(v));
    if (finiteVel.length < 8) return [];

    // Kierunek biegu = znak mediany prędkości ruchu.
    const sorted = [...finiteVel].sort((a, b) => a - b);
    const medVel = sorted[Math.floor(sorted.length / 2)];
    const dir = medVel >= 0 ? 1 : -1;
    // Próg ruszenia = 20% szczytowej prędkości w kierunku biegu.
    const peakVel = Math.max(...vel.map((v) => (Number.isFinite(v) ? v * dir : 0)));
    if (peakVel <= 0) return [];
    const onset = peakVel * 0.2;

    let startIdx = -1;
    for (let i = 0; i < vel.length; i++) {
      if (Number.isFinite(vel[i]) && vel[i] * dir >= onset) {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0 || !Number.isFinite(x[startIdx])) return [];

    // Meta = pierwsza klatka, w której pokonano dystans protokołu.
    const startX = x[startIdx];
    let finishIdx = -1;
    for (let i = startIdx + 1; i < x.length; i++) {
      if (!Number.isFinite(x[i])) continue;
      const meters = Math.abs(x[i] - startX) * ctx.metadata.width * scale.metersPerPixel;
      if (meters >= distanceM) {
        finishIdx = i;
        break;
      }
    }
    if (finishIdx < 0) return [];

    const conf = round(0.7 * scale.confidence + 0.15, 2);
    return [
      {
        type: "start_crossing",
        frameIndex: startIdx,
        timestampSeconds: t[startIdx] ?? 0,
        confidence: conf,
      },
      {
        type: "finish_crossing",
        frameIndex: finishIdx,
        timestampSeconds: t[finishIdx] ?? 0,
        confidence: conf,
      },
    ];
  }

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const line = lineEvents(ctx);
    if (line.length >= 2) return line;
    return autoEvents(ctx);
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
    const hasEvents = events(ctx).length >= 2;
    if (!hasEvents) issues.push("EVENTS_NOT_DETECTED");
    const hardFail: ValidationResult["issues"] = ["POSE_NOT_DETECTED", "MULTIPLE_PEOPLE"];
    const res = buildValidation(issues, hardFail);
    // Brak policzalnego czasu (ani linii, ani auto-skali) → weryfikacja trenera.
    if (res.ok && !hasEvents) {
      return { ...res, ok: false, status: "needs_review" };
    }
    return res;
  }

  return {
    testType,
    analyzerVersion: `${testType}-2.0.0`,
    requiredCameraSetup: "side",
    minimumFps: MIN_FPS,
    requiresCalibration: false,
    validateRecording: validate,
    detectKeyEvents: async (ctx) => events(ctx),
    calculateMetrics: (ev) => metrics(ev),
    calculateConfidence: (ev) => confidence(ev),
  };
}

export const sprint20mAnalyzer = makeSprint("sprint_20m", 20);
export const sprint30mAnalyzer = makeSprint("sprint_30m", 30);
