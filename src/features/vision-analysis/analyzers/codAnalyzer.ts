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
import { movingAverage, interpolateShortGaps, derivative, argMax, argMin } from "../signal";
import { round } from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { SPRINT_FPS_POLICY, JUMP_FPS_POLICY } from "../measurementAccuracy";

/**
 * COD / Braking (5-10-5, Sprint to Stop). Wykrywa ruszenie, szczyt prędkości,
 * początek hamowania i zatrzymanie z poziomej prędkości bioder. Wszystkie
 * metryki są CZASOWE (nie wymagają kalibracji przestrzeni), więc zawodnik
 * dostaje gotowy wynik automatycznie — bez czekania na trenera.
 */
function makeCod(
  testType: "five_ten_five" | "sprint_to_stop",
  camera: "front" | "side",
): TestAnalyzer {
  const MIN_FPS = testType === "sprint_to_stop" ? 120 : 60;

  function events(ctx: AnalysisContext): DetectedEvent[] {
    const t = timeSeries(ctx.poses);
    const x = movingAverage(interpolateShortGaps(hipXSeries(ctx.poses)), 5);
    const vel = derivative(x, t).map(Math.abs);
    if (vel.filter((v) => Number.isFinite(v)).length < 8) return [];
    const vSmooth = movingAverage(vel, 5);

    const peakIdx = argMax(vSmooth); // maksymalna prędkość (przed hamowaniem)
    if (peakIdx < 0) return [];
    // Zatrzymanie = minimum prędkości po szczycie.
    const after = vSmooth.slice(peakIdx);
    const stopRel = argMin(after);
    const stopIdx = peakIdx + (stopRel < 0 ? 0 : stopRel);
    if (stopIdx <= peakIdx) return [];

    const peakV = vSmooth[peakIdx];
    // Ruszenie = pierwsza klatka, w której prędkość przekracza 20% szczytu.
    let startIdx = 0;
    for (let i = 0; i <= peakIdx; i++) {
      if (Number.isFinite(vSmooth[i]) && vSmooth[i] >= peakV * 0.2) {
        startIdx = i;
        break;
      }
    }

    // Początek hamowania = gdy prędkość spada poniżej 60% szczytu po szczycie.
    let brakeIdx = peakIdx;
    for (let i = peakIdx; i <= stopIdx; i++) {
      if (vSmooth[i] < peakV * 0.6) {
        brakeIdx = i;
        break;
      }
    }

    const CONF = 0.78;
    return [
      {
        type: "movement_start",
        frameIndex: startIdx,
        timestampSeconds: t[startIdx] ?? 0,
        confidence: CONF,
      },
      { type: "peak_speed", frameIndex: peakIdx, timestampSeconds: t[peakIdx] ?? 0, confidence: CONF },
      {
        type: "braking_start",
        frameIndex: brakeIdx,
        timestampSeconds: t[brakeIdx] ?? 0,
        confidence: CONF,
      },
      { type: "stop", frameIndex: stopIdx, timestampSeconds: t[stopIdx] ?? 0, confidence: CONF },
    ];
  }

  function metrics(ev: DetectedEvent[]): CalculatedMetric[] {
    const start = ev.find((e) => e.type === "movement_start");
    const brake = ev.find((e) => e.type === "braking_start");
    const stop = ev.find((e) => e.type === "stop");
    if (!brake || !stop) return [];
    const out: CalculatedMetric[] = [];

    if (start) {
      const totalTime = stop.timestampSeconds - start.timestampSeconds;
      if (totalTime > 0 && totalTime <= 20) {
        out.push({
          key: "total_time_s",
          label: "Czas całkowity",
          value: round(totalTime, 2),
          unit: "s",
          confidence: 0.78,
        });
      }
    }

    const brakingTime = stop.timestampSeconds - brake.timestampSeconds;
    if (brakingTime > 0 && brakingTime <= 3) {
      out.push({
        key: "braking_time_s",
        label: "Czas hamowania",
        value: round(brakingTime, 2),
        unit: "s",
        confidence: 0.78,
      });
    }
    return out;
  }

  function confidence(ev: DetectedEvent[]): ConfidenceResult {
    const perEvent = ev.map((e) => e.confidence);
    const overall = ev.length >= 3 ? Math.min(...perEvent) : 0;
    return { overall: round(overall, 2), perEvent };
  }

  function validate(ctx: AnalysisContext): ValidationResult {
    const { issues } = baseValidation(ctx, MIN_FPS);
    if (events(ctx).length < 3) issues.push("EVENTS_NOT_DETECTED");
    return buildValidation(issues, [
      "POSE_NOT_DETECTED",
      "MULTIPLE_PEOPLE",
      "EVENTS_NOT_DETECTED",
    ]);
  }

  return {
    testType,
    analyzerVersion: `${testType}-2.0.0`,
    requiredCameraSetup: camera,
    minimumFps: MIN_FPS,
    requiresCalibration: false,
    validateRecording: validate,
    detectKeyEvents: async (ctx) => events(ctx),
    calculateMetrics: (ev) => metrics(ev),
    calculateConfidence: (ev) => confidence(ev),
  };
}

export const fiveTenFiveAnalyzer = makeCod("five_ten_five", "front");
export const sprintToStopAnalyzer = makeCod("sprint_to_stop", "side");
