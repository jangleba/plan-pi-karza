import type { AnalysisStatus, QualityIssueCode } from "./types";
import { CONFIDENCE_THRESHOLDS } from "./types";

export interface StatusInput {
  validationStatus: AnalysisStatus; // z analizatora: completed | needs_review | invalid_recording
  metricsCount: number;
  confidence: number;
}

export interface StatusDecision {
  status: AnalysisStatus;
  extraIssues: QualityIssueCode[];
}

/**
 * Jedyne źródło prawdy o statusie wyniku. Twarda zasada bezpieczeństwa:
 * status NIE może być "completed", jeśli nie ma policzalnych metryk.
 */
export function resolveAnalysisStatus(input: StatusInput): StatusDecision {
  const { validationStatus, metricsCount, confidence } = input;

  if (validationStatus === "invalid_recording") {
    return { status: "invalid_recording", extraIssues: [] };
  }
  if (validationStatus === "calibration_required") {
    return { status: "calibration_required", extraIssues: [] };
  }
  // Tryb tylko-technika: zachowujemy status, o ile są policzalne metryki
  // (np. czas hamowania i kontakty) — bez cm/m/prędkości.
  if (validationStatus === "technique_only" && metricsCount > 0) {
    return { status: "technique_only", extraIssues: [] };
  }
  if (validationStatus === "needs_review") {
    return { status: "needs_review", extraIssues: [] };
  }
  if (metricsCount === 0) {
    return { status: "needs_review", extraIssues: ["EVENTS_NOT_DETECTED"] };
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.autoAccept) {
    return { status: "completed", extraIssues: [] };
  }
  return { status: "needs_review", extraIssues: ["LOW_CONFIDENCE"] };
}
