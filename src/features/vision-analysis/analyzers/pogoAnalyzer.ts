import type {
  TestAnalyzer,
  AnalysisContext,
  DetectedEvent,
  CalculatedMetric,
  ConfidenceResult,
  ValidationResult,
} from "../types";
import { baseValidation, buildValidation } from "./validation";
import {
  detectFlightPhase,
  detectGroundContacts,
  detectRepeatedCycles,
} from "./jumpDetection";
import { flightTimeToHeightCm, reactiveStrengthIndex, round } from "../physics";
import { temporalAccuracy } from "./temporalAccuracy";
import { JUMP_FPS_POLICY } from "../measurementAccuracy";
import { hipYSeries, timeSeries } from "../poseSeries";

const MIN_FPS = 60;
/** Wymagana liczba PRAWIDŁOWYCH cykli, żeby zaliczyć oficjalny wynik Pogo. */
export const POGO_REQUIRED_CYCLES = 10;

/** Pojedynczy cykl Pogo: CONTACT → TAKEOFF → FLIGHT → LANDING. */
export interface PogoCycle {
  index: number;
  contactStartSeconds: number;
  takeoffSeconds: number;
  landingSeconds: number;
  takeoffTimestampUs: number;
  landingTimestampUs: number;
  contactTimeMs: number;
  flightTimeMs: number;
  validRep: boolean;
  invalidReason: string | null;
}

/** Zakresy zgodności dla Pogo: krótki kontakt, rytmiczny, płytkie zgięcie. */
const MAX_CONTACT_S = 0.4;
const MIN_FLIGHT_S = 0.05;
const MAX_FLIGHT_S = 0.6;

/** Zgrubna miara „głębokiego countermovement" — max zakres pionowy bioder. */
function hipVerticalRange(ctx: AnalysisContext): number {
  const hip = hipYSeries(ctx.poses).filter((v) => Number.isFinite(v));
  if (hip.length < 4) return 0;
  return Math.max(...hip) - Math.min(...hip);
}

function extractCycles(ctx: AnalysisContext): PogoCycle[] {
  const { cycles } = detectRepeatedCycles(ctx.poses);
  return cycles
    .filter((c) => c.contactSeconds != null && c.flightSeconds > 0)
    .map((c, i) => {
      const contact = c.contactSeconds ?? 0;
      const flight = c.flightSeconds;
      let invalidReason: string | null = null;
      if (contact <= 0 || contact > MAX_CONTACT_S) invalidReason = "CONTACT_OUT_OF_RANGE";
      else if (flight < MIN_FLIGHT_S || flight > MAX_FLIGHT_S) invalidReason = "FLIGHT_OUT_OF_RANGE";
      return {
        index: i,
        contactStartSeconds: c.takeoffTime - contact,
        takeoffSeconds: c.takeoffTime,
        landingSeconds: c.landingTime,
        takeoffTimestampUs: Math.round(c.takeoffTime * 1_000_000),
        landingTimestampUs: Math.round(c.landingTime * 1_000_000),
        contactTimeMs: round(contact * 1000, 1),
        flightTimeMs: round(flight * 1000, 1),
        validRep: invalidReason == null,
        invalidReason,
      };
    });
}

function findFrameNear(times: number[], t: number): number {
  if (times.length === 0) return 0;
  let best = 0;
  let bestDiff = Math.abs(times[0] - t);
  for (let i = 1; i < times.length; i++) {
    const d = Math.abs(times[i] - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

function events(ctx: AnalysisContext): DetectedEvent[] {
  const cycles = extractCycles(ctx);
  if (cycles.length === 0) {
    // Fallback: pokaż wykryte kontakty (do diagnostyki, nie do wyniku).
    return detectGroundContacts(ctx.poses);
  }
  const t = timeSeries(ctx.poses);
  const out: DetectedEvent[] = [];
  for (const c of cycles) {
    const conf = c.validRep ? 0.9 : 0.5;
    out.push({
      type: "ground_contact",
      frameIndex: findFrameNear(t, c.contactStartSeconds),
      timestampSeconds: c.contactStartSeconds,
      confidence: conf,
    });
    out.push({
      type: "takeoff",
      frameIndex: findFrameNear(t, c.takeoffSeconds),
      timestampSeconds: c.takeoffSeconds,
      confidence: conf,
    });
    out.push({
      type: "landing",
      frameIndex: findFrameNear(t, c.landingSeconds),
      timestampSeconds: c.landingSeconds,
      confidence: conf,
    });
  }
  return out;
}

function metrics(_ev: DetectedEvent[], ctx: AnalysisContext): CalculatedMetric[] {
  const cycles = extractCycles(ctx);
  const valid = cycles.filter((c) => c.validRep);
  // Oficjalny wynik dopiero po komplecie prawidłowych cykli.
  if (valid.length < POGO_REQUIRED_CYCLES) return [];

  const avgContact = valid.reduce((a, b) => a + b.contactTimeMs / 1000, 0) / valid.length;
  const avgFlight = valid.reduce((a, b) => a + b.flightTimeMs / 1000, 0) / valid.length;
  const heightCm = flightTimeToHeightCm(avgFlight);
  const rsi = reactiveStrengthIndex(heightCm / 100, avgContact);
  const first = valid[0];
  const last = valid[valid.length - 1];
  const totalTime = last.landingSeconds - first.contactStartSeconds;
  const rhythm = totalTime > 0 ? valid.length / totalTime : 0;
  const conf = ctx.metadata.fps >= 120 ? 0.9 : 0.7;

  return [
    { key: "rsi", label: "RSI", value: round(rsi, 2), unit: "", confidence: conf },
    {
      key: "ground_contact_s",
      label: "Czas kontaktu",
      value: round(avgContact, 3),
      unit: "s",
      confidence: conf,
    },
    {
      key: "jump_height_cm",
      label: "Wysokość",
      value: round(heightCm, 1),
      unit: "cm",
      confidence: conf,
    },
    {
      key: "contact_rhythm",
      label: "Rytm kontaktów",
      value: round(rhythm, 2),
      unit: "/s",
      confidence: conf,
    },
    { key: "valid_reps", label: "Prawidłowe odbicia", value: valid.length, unit: "", confidence: 1 },
    { key: "detected_reps", label: "Wykryte odbicia", value: cycles.length, unit: "", confidence: 1 },
  ];
}

function confidence(ev: DetectedEvent[]): ConfidenceResult {
  const perEvent = ev.map((e) => e.confidence);
  const overall = ev.length >= 3 ? Math.min(...perEvent) : 0;
  return { overall: round(overall, 2), perEvent };
}

/**
 * Rozpoznanie Pogo: minimum 2 kolejne rytmiczne odbicia, krótkie kontakty,
 * brak pojedynczego głębokiego countermovement (bo to CMJ).
 */
function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const contacts = detectGroundContacts(ctx.poses);
  const flight = detectFlightPhase(ctx.poses);
  const cycles = extractCycles(ctx);
  const validCycles = cycles.filter((c) => c.validRep).length;

  // Zbyt mało kontaktów: to nie jest seria Pogo.
  if (contacts.length < 2 || cycles.length < 2) {
    if (flight) issues.push("TEST_PROTOCOL_MISMATCH");
    else issues.push("EVENTS_NOT_DETECTED");
    return buildValidation(issues, hardFail());
  }

  // Głębokie countermovement + tylko jeden dominujący lot → to CMJ, nie Pogo.
  const hipRange = hipVerticalRange(ctx);
  if (cycles.length < 3 && hipRange > 0.12 && flight) {
    issues.push("TEST_PROTOCOL_MISMATCH");
    return buildValidation(issues, hardFail());
  }

  if (validCycles < POGO_REQUIRED_CYCLES) {
    issues.push("WRONG_REPETITION_COUNT");
  }
  return buildValidation(issues, hardFail());
}

function hardFail() {
  return [
    "POSE_NOT_DETECTED",
    "ATHLETE_OUT_OF_FRAME",
    "MULTIPLE_PEOPLE",
    "TEST_PROTOCOL_MISMATCH",
    "EVENTS_NOT_DETECTED",
    "WRONG_REPETITION_COUNT",
  ] as const as unknown as import("../types").QualityIssueCode[];
}

export const pogoAnalyzer: TestAnalyzer = {
  testType: "pogo_jumps",
  analyzerVersion: "pogo-2.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
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
      timeKey: "ground_contact_s",
    }),
};

/** Eksport pomocniczy — używany przez runVideoAnalysis do raportowania cykli. */
export function extractPogoCycles(ctx: AnalysisContext): PogoCycle[] {
  return extractCycles(ctx);
}
