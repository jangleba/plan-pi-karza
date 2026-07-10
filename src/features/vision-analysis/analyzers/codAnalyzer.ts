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

/**
 * COD / Braking (5-10-5, Sprint to Stop). Wykrywa fazę hamowania z prędkości
 * poziomej bioder: hamowanie = gwałtowny spadek prędkości do ~0 (i zwrot).
 * Czas hamowania jest liczony z rzeczywistych timestampów. Poprawność
 * kolejności linii i wykonania protokołu weryfikuje trener → needs_review.
 */
function makeCod(testType: "five_ten_five" | "sprint_to_stop", camera: "front" | "side"): TestAnalyzer {
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

    // Początek hamowania = gdy prędkość spada poniżej 60% szczytu po szczycie.
    const peakV = vSmooth[peakIdx];
    let brakeIdx = peakIdx;
    for (let i = peakIdx; i <= stopIdx; i++) {
      if (vSmooth[i] < peakV * 0.6) {
        brakeIdx = i;
        break;
      }
    }
    return [
      { type: "peak_speed", frameIndex: peakIdx, timestampSeconds: t[peakIdx] ?? 0, confidence: 0.6 },
      { type: "braking_start", frameIndex: brakeIdx, timestampSeconds: t[brakeIdx] ?? 0, confidence: 0.6 },
      { type: "stop", frameIndex: stopIdx, timestampSeconds: t[stopIdx] ?? 0, confidence: 0.6 },
    ];
  }

  function metrics(ev: DetectedEvent[]): CalculatedMetric[] {
    const brake = ev.find((e) => e.type === "braking_start");
    const stop = ev.find((e) => e.type === "stop");
    if (!brake || !stop) return [];
    const brakingTime = stop.timestampSeconds - brake.timestampSeconds;
    if (brakingTime <= 0 || brakingTime > 3) return [];
    return [
      {
        key: "braking_time_s",
        label: "Czas hamowania",
        value: round(brakingTime, 2),
        unit: "s",
        confidence: 0.6,
      },
    ];
  }

  function confidence(ev: DetectedEvent[]): ConfidenceResult {
    const perEvent = ev.map((e) => e.confidence);
    const overall = ev.length >= 3 ? Math.min(...perEvent) : 0;
    return { overall: round(overall, 2), perEvent };
  }

  function validate(ctx: AnalysisContext): ValidationResult {
    const { issues } = baseValidation(ctx, MIN_FPS);
    if (events(ctx).length < 3) issues.push("EVENTS_NOT_DETECTED");
    const res = buildValidation(issues, [
      "POSE_NOT_DETECTED",
      "MULTIPLE_PEOPLE",
      "EVENTS_NOT_DETECTED",
    ]);
    // COD wymaga weryfikacji kolejności linii/wykonania przez trenera.
    if (res.ok) return { ...res, ok: false, status: "needs_review" };
    return res;
  }

  return {
    testType,
    analyzerVersion: `${testType}-1.0.0`,
    requiredCameraSetup: camera,
    minimumFps: MIN_FPS,
    requiresCalibration: true,
    validateRecording: validate,
    detectKeyEvents: async (ctx) => events(ctx),
    calculateMetrics: (ev) => metrics(ev),
    calculateConfidence: (ev) => confidence(ev),
  };
}

export const fiveTenFiveAnalyzer = makeCod("five_ten_five", "front");
export const sprintToStopAnalyzer = makeCod("sprint_to_stop", "side");
