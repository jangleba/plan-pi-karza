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

const MIN_FPS = 30;

/**
 * Analiza techniki ćwiczenia siłowego. NIE zwraca fałszywego pomiaru AI —
 * technika jest zawsze weryfikowana przez trenera (needs_review). Wykrywamy
 * jedynie liczbę powtórzeń (kontaktów/cykli) jako pomoc, bez oceny "na oko".
 */
function events(ctx: AnalysisContext): DetectedEvent[] {
  return detectGroundContacts(ctx.poses).map((e) => ({ ...e, type: "rep_marker" }));
}

function validate(ctx: AnalysisContext): ValidationResult {
  const { issues } = baseValidation(ctx, MIN_FPS);
  const res = buildValidation(issues, ["POSE_NOT_DETECTED", "MULTIPLE_PEOPLE"]);
  if (res.ok) return { ...res, ok: false, status: "needs_review" };
  return res;
}

export const gymAnalyzer: TestAnalyzer = {
  testType: "analyze_gym_exercise",
  analyzerVersion: "gym-1.0.0",
  requiredCameraSetup: "side",
  minimumFps: MIN_FPS,
  requiresCalibration: false,
  validateRecording: validate,
  detectKeyEvents: async (ctx) => events(ctx),
  // Technika nie generuje wartości liczbowej z AI — pusta lista metryk.
  calculateMetrics: (): CalculatedMetric[] => [],
  calculateConfidence: (ev): ConfidenceResult => ({
    overall: 0,
    perEvent: ev.map((e) => e.confidence),
  }),
};
