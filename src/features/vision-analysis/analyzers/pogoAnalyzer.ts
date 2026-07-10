import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import { detectGroundContacts } from "./jumpDetection";
import { flightTimeToHeightCm, reactiveStrengthIndex, round } from "../physics";

const MIN_FPS = 120;

function events(ctx: AnalysisContext): DetectedEvent[] {
  return detectGroundContacts(ctx.poses);
}

/**
 * Pogo: z serii kontaktów liczymy rytm, średni czas lotu między kontaktami,
 * wysokość i RSI. Kontakt→lot→kontakt: czas lotu ≈ odstęp między kontaktami
 * minus szacowany czas kontaktu. Bez wysokiego FPS wynik oznaczamy niżej.
 */
function metrics(ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  if (ev.length < 3) return [];
  const times = ev.map((e) => e.timestampSeconds);
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  const totalTime = times[times.length - 1] - times[0];
  if (totalTime <= 0) return [];

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  // Przybliżony podział cyklu: ~30% kontakt, ~70% lot dla reaktywnych odbić.
  const groundContact = round(avgInterval * 0.3, 3);
  const flightTime = round(avgInterval * 0.7, 3);
  const heightCm = flightTimeToHeightCm(flightTime);
  const rsi = reactiveStrengthIndex(heightCm / 100, groundContact);
  const rhythm = round(ev.length / totalTime, 2);
  const conf = Math.min(...ev.map((e) => e.confidence)) * (ctx.metadata.fps >= 120 ? 1 : 0.7);

  if (heightCm < 2) return [];

  return [
    { key: "rsi", label: "RSI", value: rsi, unit: "", confidence: round(conf, 2) },
    {
      key: "ground_contact_s",
      label: "Czas kontaktu",
      value: groundContact,
      unit: "s",
      confidence: round(conf, 2),
    },
    {
      key: "jump_height_cm",
      label: "Wysokość",
      value: heightCm,
      unit: "cm",
      confidence: round(conf, 2),
    },
    {
      key: "contact_rhythm",
      label: "Rytm kontaktów",
      value: rhythm,
      unit: "/s",
      confidence: round(conf, 2),
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
  return buildValidation(issues, [
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "EVENTS_NOT_DETECTED",
  ]);
}

export const pogoAnalyzer: TestAnalyzer = {
  testType: "pogo_jumps",
  analyzerVersion: "pogo-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  calculateMetrics: (ev, ctx) => metrics(ev, ctx),
  calculateConfidence: (ev) => confidence(ev),
};
