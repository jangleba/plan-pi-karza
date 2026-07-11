/**
 * Vision Analysis — jeden wspólny silnik (fasada modułów).
 *
 * To NIE jest drugi Vision Lab. Ten plik spina istniejące moduły w jeden,
 * nazwany zestaw silników, tak aby cały pipeline miał jedno wejście:
 *
 *   VideoAnalysisEngine        → runVideoAnalysis (pełny pipeline)
 *   TestProtocolRegistry       → testProtocols (definicje testów)
 *   TestProtocolRecognizer     → testProtocolRecognizer (gate przed adapterem)
 *   VideoCalibrationEngine     → videoCalibration (+ per-video store)
 *   MovementEventEngine        → analizatory (detectKeyEvents / metrics)
 *   AttemptSessionManager      → attemptSessionManager (protokół prób)
 *   MeasurementUncertaintyEngine → measurementAccuracy (niepewność)
 *   EvidenceReportBuilder      → evidenceReportBuilder (raport dowodowy)
 *   VisionErrorMapper          → visionErrorMapper (kody → komunikaty)
 *
 * Każdy adapter testu żyje dalej w analyzers/ i jest wybierany przez
 * testAnalyzerRegistry. Determinizm: te same wejścia zawsze dają ten sam wynik.
 */

// --- VideoAnalysisEngine ---
export {
  runVideoAnalysis,
  SPATIAL_TESTS,
  type RunOptions,
  type AnalysisPhase,
} from "./runVideoAnalysis";

// --- TestProtocolRegistry ---
export {
  TEST_PROTOCOL_REGISTRY,
  ALL_TEST_TYPES,
  getTestProtocol,
  listTestProtocols,
  type TestProtocol,
  type MeasurementFamily,
  type TestFamily,
  type AttemptProtocol,
  type AttemptProtocolKind,
  type RequiredCalibration,
  type ResultSelection,
  type OfficialResultRequirements,
} from "./testProtocols";

// --- TestProtocolRecognizer ---
export {
  recognizeMovement,
  recognizeTestProtocol,
  SIGNATURE_FAMILIES,
  type MovementSignature,
  type ProtocolRecognition,
} from "./testProtocolRecognizer";

// --- MovementEventEngine (adaptery) ---
export { testAnalyzerRegistry, getAnalyzer, hasAnalyzer } from "./testAnalyzerRegistry";

// --- AttemptSessionManager ---
export {
  AttemptSessionManager,
  createAttemptSession,
  type AttemptRecord,
  type SessionState,
  type SideResult,
  type Side,
} from "./attemptSessionManager";

// --- MeasurementUncertaintyEngine ---
export {
  computeMeasurementAccuracy,
  calcTemporalResolution,
  calcSpatialResolution,
  validateCalibrationQuality,
  formatResult,
  type MeasurementAccuracy,
  type QualityTier,
} from "./measurementAccuracy";

// --- EvidenceReportBuilder ---
export { buildEvidenceReport, type EvidenceReport, type EvidenceMetric } from "./evidenceReportBuilder";

// --- UnifiedReportBuilder (jeden format raportu dla wszystkich testów) ---
export {
  buildUnifiedReport,
  RESULT_STATUS_LABELS,
  UNIFIED_QUALITY_TIER_LABELS,
  type UnifiedVisionReport,
  type ResultStatus,
  type UnifiedQualityTier,
  type ReportMetric,
  type HowMeasuredStep,
  type ReportAttempt,
} from "./unifiedReport";



// --- BrakingEngine (Sprint-to-Stop / DECELERATION) ---
export {
  detectBraking,
  type BrakingResult,
  type BrakingSuccess,
  type BrakingFailure,
  type BrakingMode,
  type BrakingErrorCode,
  type BrakingResultQuality,
  type BodyControlMetrics,
} from "./brakingEngine";

// --- VisionErrorMapper ---
export {
  mapVisionError,
  mapVisionErrors,
  type MappedVisionError,
  type VisionErrorAction,
} from "./visionErrorMapper";

// --- VideoCalibrationEngine (per-film, powiązanie z videoHash) ---
export type { CalibrationRecord } from "./videoCalibration";
export {
  saveVideoCalibration,
  findVideoCalibration,
  deleteVideoCalibration,
  listVideoCalibrations,
} from "@/lib/vision/videoCalibrationStore";

// --- Wspólne typy silnika ---
export type {
  TestType,
  VideoAnalysisResult,
  AnalysisStatus,
  CalculatedMetric,
  DetectedEvent,
  QualityIssueCode,
} from "./types";
export { QUALITY_ISSUE_LABELS } from "./types";
