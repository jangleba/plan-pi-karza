/**
 * Typy silnika analizy wideo Vision Lab.
 * Format wyniku jest jednolity dla wszystkich testów (patrz VideoAnalysisResult).
 */

export type TestType =
  | "cmj"
  | "broad_jump"
  | "pogo_jumps"
  | "sprint_20m"
  | "sprint_30m"
  | "five_ten_five"
  | "sprint_to_stop"
  | "analyze_gym_exercise";

export type CameraSetup = "side" | "front" | "back" | "45deg" | "top";

export type AnalysisStatus = "completed" | "needs_review" | "invalid_recording" | "failed";

/** Kody powodów odrzucenia / niskiej jakości nagrania. */
export type QualityIssueCode =
  | "LOW_CONFIDENCE"
  | "INVALID_CAMERA_POSITION"
  | "ATHLETE_OUT_OF_FRAME"
  | "MULTIPLE_PEOPLE"
  | "INSUFFICIENT_FPS"
  | "NO_CALIBRATION"
  | "MISSING_START_LINE"
  | "MISSING_FINISH_LINE"
  | "INVALID_TEST_EXECUTION"
  | "EVENTS_NOT_DETECTED"
  | "LOW_RESOLUTION"
  | "POSE_NOT_DETECTED";

export interface VideoMetadata {
  fps: number;
  /** Czy FPS zostało zmierzone z klatek (true) czy przyjęte z deklaracji (false). */
  fpsMeasured: boolean;
  declaredFps: number | null;
  durationSeconds: number;
  frameCount: number;
  width: number;
  height: number;
  orientation: "portrait" | "landscape" | "square";
}

/** Pojedynczy landmark pozy (znormalizowany 0-1 + widoczność). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/** Poza zawodnika w jednej klatce. */
export interface FramePose {
  frameIndex: number;
  mediaTime: number;
  presentationTimestamp: number;
  /** 33 landmarki MediaPipe lub null gdy nie wykryto zawodnika. */
  landmarks: Landmark[] | null;
  /** Liczba wykrytych osób (do detekcji MULTIPLE_PEOPLE). */
  peopleCount: number;
  /** Średnia widoczność kluczowych landmarków 0-1. */
  trackingConfidence: number;
}

/** Ręczna kalibracja przestrzeni / linii (opcjonalna, dla testów dystansowych). */
export interface Calibration {
  /** Dwa punkty znormalizowane i ich rzeczywisty dystans w metrach. */
  referencePoints?: { a: { x: number; y: number }; b: { x: number; y: number }; meters: number };
  startLineX?: number;
  finishLineX?: number;
}

export interface AnalysisContext {
  testType: TestType;
  metadata: VideoMetadata;
  poses: FramePose[];
  cameraSetup: CameraSetup;
  calibration: Calibration | null;
}

export interface ValidationResult {
  ok: boolean;
  status: AnalysisStatus;
  issues: QualityIssueCode[];
  retakeInstructions: string[];
}

export interface DetectedEvent {
  type: string;
  frameIndex: number;
  timestampSeconds: number;
  confidence: number;
}

export interface CalculatedMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  confidence: number;
}

export interface ConfidenceResult {
  overall: number; // 0-1
  perEvent: number[];
}

/** Kontrakt pojedynczego analizatora testu. */
export interface TestAnalyzer {
  testType: TestType;
  analyzerVersion: string;
  requiredCameraSetup: CameraSetup;
  /** Minimalne FPS wymagane przez protokół testu. */
  minimumFps: number;
  /** Czy test wymaga kalibracji przestrzeni/linii do wyniku liczbowego. */
  requiresCalibration: boolean;
  validateRecording(context: AnalysisContext): ValidationResult;
  detectKeyEvents(context: AnalysisContext): Promise<DetectedEvent[]>;
  calculateMetrics(events: DetectedEvent[], context: AnalysisContext): CalculatedMetric[];
  calculateConfidence(events: DetectedEvent[], context: AnalysisContext): ConfidenceResult;
}

/** Jednolity wynik analizy zwracany przez pipeline. */
export interface VideoAnalysisResult {
  analysisId: string;
  testType: TestType;
  status: AnalysisStatus;
  videoMetadata: {
    fps: number;
    durationSeconds: number;
    frameCount: number;
    width: number;
    height: number;
  };
  keyEvents: {
    type: string;
    frameIndex: number;
    timestampSeconds: number;
    confidence: number;
  }[];
  metrics: CalculatedMetric[];
  overallConfidence: number;
  qualityIssues: string[];
  retakeInstructions: string[];
  analyzerVersion: string;
}

/** Progi akceptacji wyniku na podstawie confidence. */
export const CONFIDENCE_THRESHOLDS = {
  autoAccept: 0.85,
  needsReview: 0.65,
} as const;

/** Czytelne opisy powodów jakości (PL) do UI. */
export const QUALITY_ISSUE_LABELS: Record<QualityIssueCode, string> = {
  LOW_CONFIDENCE: "Zbyt niska pewność analizy.",
  INVALID_CAMERA_POSITION: "Nieprawidłowe ustawienie kamery.",
  ATHLETE_OUT_OF_FRAME: "Zawodnik wychodzi poza kadr.",
  MULTIPLE_PEOPLE: "W kadrze widoczna więcej niż jedna osoba.",
  INSUFFICIENT_FPS: "Zbyt niskie FPS dla tego testu.",
  NO_CALIBRATION: "Brak kalibracji przestrzeni / linii.",
  MISSING_START_LINE: "Nie wykryto linii startu.",
  MISSING_FINISH_LINE: "Nie wykryto linii mety.",
  INVALID_TEST_EXECUTION: "Nieprawidłowe wykonanie testu.",
  EVENTS_NOT_DETECTED: "Nie wykryto kluczowych zdarzeń ruchu.",
  LOW_RESOLUTION: "Zbyt niska rozdzielczość nagrania.",
  POSE_NOT_DETECTED: "Nie wykryto sylwetki zawodnika.",
};

/** Indeksy landmarków MediaPipe Pose (podzbiór używany w analizie). */
export const POSE = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;
