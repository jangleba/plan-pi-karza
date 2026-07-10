// Vision Lab — typy współdzielone przez cały moduł.

export type VisionTestCategory =
  | "jump"
  | "sprint"
  | "cod"
  | "technique";

export type VisionValidityStatus = "valid" | "caution" | "invalid";

export type VisionConfidenceScore = "high" | "medium" | "low";

export type VisionCameraView =
  | "side"
  | "front"
  | "back"
  | "45deg"
  | "top";

/** Powody, dla których test może być nieważny. */
export type VisionInvalidReason =
  | "low_fps"
  | "poor_lighting"
  | "unstable_camera"
  | "athlete_out_of_frame"
  | "feet_not_visible"
  | "line_not_visible"
  | "wrong_angle"
  | "unclear_ground_contact";

/** Definicja pojedynczego testu. */
export interface VisionTest {
  id: string;
  name: string;
  category: VisionTestCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  cameraView: VisionCameraView;
  minimumFps: number;
  recommendedFps: number;
  attempts: number;
  restSeconds: number;
  goal: string;
  whatItMeasures: string;
  setupInstructions: string[];
  validRules: string[];
  measuredMetrics: string[];
}

/** Pojedyncza zmierzona metryka. */
export interface VisionMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
}

/** Flagi jakości / ważności nagrania. */
export interface VisionValidityFlags {
  fpsOk: boolean;
  lightingOk: boolean;
  cameraStable: boolean;
  athleteInFrame: boolean;
  feetVisible: boolean;
  lineVisible: boolean;
  angleOk: boolean;
  groundContactClear: boolean;
  reasons: VisionInvalidReason[];
}

/** Informacja zwrotna AI (demo lub prawdziwa). */
export interface VisionFeedback {
  good: string;
  limitingFactor: string;
  improve: string;
  accuracy: "accurate" | "estimated" | "invalid";
}

/** Struktura pod przyszłe sygnały do planu treningowego. */
export interface VisionSignals {
  power_drop: boolean;
  sprint_drop: boolean;
  braking_issue: boolean;
  asymmetry_flag: boolean;
  landing_control_issue: boolean;
}

/** Wynik pojedynczego testu — kształt zgodny z tabelą vision_tests. */
export interface VisionTestResult {
  id: string;
  userId: string;
  testType: string;
  testCategory: VisionTestCategory;
  testName: string;
  videoUrl: string | null;
  captureMode: string;
  fps: number | null;
  cameraView: VisionCameraView | null;
  validityStatus: VisionValidityStatus;
  confidenceScore: VisionConfidenceScore;
  mainResultValue: number | null;
  mainResultUnit: string | null;
  measuredMetrics: VisionMetric[];
  validityFlags: VisionValidityFlags;
  aiFeedback: VisionFeedback;
  comparisonToPrevious: VisionComparison | null;
  signals?: VisionSignals;
  savedToProgress: boolean;
  createdAt: string;

  // Coach Review + „Jak powstał wynik?”
  reviewStatus: ReviewStatus;
  reviewType: ReviewType | null;
  coachId: string | null;
  coachNote: string | null;
  coachFeedback: CoachFeedback | null;
  coachVerified: boolean;
  coachCorrected: boolean;
  coachCorrectedFrames: CoachFrames | null;
  calculationMethod: string | null;
  calculationBasis: CalculationBasis | null;
  manualOverride: boolean;
  manualOverrideReason: string | null;
  paidReviewRequested: boolean;
  paidReviewStatus: PaidReviewStatus;
}

/** Porównanie wyniku do poprzedniego / najlepszego. */
export interface VisionComparison {
  vsPrevious: string | null;
  vsBest: string | null;
  label: "improvement" | "regression" | "unchanged" | "none";
  techniqueNote: string | null;
}

export const CATEGORY_LABELS: Record<VisionTestCategory, string> = {
  jump: "Jump Lab",
  sprint: "Sprint Lab",
  cod: "COD & Braking Lab",
  technique: "Technique Room",
};

export const CONFIDENCE_LABELS: Record<VisionConfidenceScore, string> = {
  high: "Wysoka",
  medium: "Średnia",
  low: "Niska",
};

export const VALIDITY_LABELS: Record<VisionValidityStatus, string> = {
  valid: "Poprawny",
  caution: "Z zastrzeżeniem",
  invalid: "Nieważny",
};

export const INVALID_REASON_LABELS: Record<VisionInvalidReason, string> = {
  low_fps: "Za niski FPS",
  poor_lighting: "Słabe oświetlenie",
  unstable_camera: "Niestabilna kamera",
  athlete_out_of_frame: "Zawodnik poza kadrem",
  feet_not_visible: "Stopy niewidoczne",
  line_not_visible: "Linia niewidoczna",
  wrong_angle: "Zły kąt kamery",
  unclear_ground_contact: "Niejasny kontakt z podłożem",
};

export const CAMERA_VIEW_LABELS: Record<VisionCameraView, string> = {
  side: "Z boku",
  front: "Z przodu",
  back: "Z tyłu",
  "45deg": "Pod kątem 45°",
  top: "Z góry",
};
