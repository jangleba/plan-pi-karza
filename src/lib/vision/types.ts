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

  // ---- Analiza ćwiczeń z planu (Gym Technique) ----
  linkedPlanId: string | null;
  linkedWorkoutId: string | null;
  linkedExerciseId: string | null;
  linkedExerciseName: string | null;
  linkedTrainingDay: string | null;
  exerciseCategory: string | null;
  techniqueReview: TechniqueReview | null;
  reviewMode: ReviewMode | null;

  // ---- Real Frame Analyzer ----
  frameAnalysisStatus?: FrameAnalysisStatus | null;
  markedBy?: MarkedBy | null;
  frameDerived?: FrameDerived | null;
  frameMarkers?: Partial<Record<FrameMarkerKey, number>> | null;

  // ---- Podział widoków: player vs coach ----
  analysisStatus: AnalysisStatus;
  visibilityStatus: VisibilityStatus;
}

/** Status analizy filmu — od uploadu do gotowego raportu. */
export type AnalysisStatus =
  | "uploaded"
  | "waiting_for_analysis"
  | "in_review"
  | "completed"
  | "invalid_video";

/** Czy zawodnik widzi wynik. */
export type VisibilityStatus = "hidden_from_player" | "visible_to_player";

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  uploaded: "Przesłany",
  waiting_for_analysis: "Waiting for analysis",
  in_review: "In review",
  completed: "Completed",
  invalid_video: "Invalid video / repeat required",
};

export const ANALYSIS_STATUS_DESCRIPTIONS: Record<AnalysisStatus, string> = {
  uploaded: "Film został przesłany.",
  waiting_for_analysis:
    "Film czeka na analizę klatkową na podstawie FPS i protokołu testu.",
  in_review: "Trener analizuje Twój film klatka po klatce.",
  completed: "Analiza gotowa. Zobacz swój raport.",
  invalid_video:
    "Film nie spełnia wymagań pomiaru. Powtórz nagranie zgodnie z instrukcją.",
};

/** Tryb analizy ćwiczenia z planu. */
export type ReviewMode =
  | "frame_analysis"
  | "self_review"
  | "coach_review"
  | "ai_future";

/** Status recenzji ćwiczenia z planu (Gym Technique). */
export type GymReviewStatus =
  | "self_review"
  | "coach_review_requested"
  | "coach_reviewed"
  | "invalid_video";

export const GYM_REVIEW_STATUS_LABELS: Record<GymReviewStatus, string> = {
  self_review: "Self Review",
  coach_review_requested: "Coach Review Requested",
  coach_reviewed: "Coach Reviewed",
  invalid_video: "Invalid Video",
};

/** Sygnał z analizy techniki — nigdy nie zmienia planu automatycznie. */
export type GymTechniqueSignal =
  | "technique_issue"
  | "coach_confirmed_issue"
  | "invalid_execution"
  | "good_execution";

/** Ocena techniki ćwiczenia z planu (formularz self/coach review). */
export interface TechniqueReview {
  trunk_position?: string;
  knee_control?: string;
  hip_control?: string;
  foot_position?: string;
  range_of_motion?: string;
  tempo_control?: string;
  stability?: string;
  main_issue?: string;
  coaching_cue?: string;
  coach_note?: string;
  signal?: GymTechniqueSignal;
}

export const GYM_TECHNIQUE_MESSAGE =
  "Na tym etapie analiza ćwiczeń z planu działa jako frame review i/lub coach review. Automatyczna analiza AI zostanie podłączona później.";


/** Porównanie wyniku do poprzedniego / najlepszego. */
export interface VisionComparison {
  vsPrevious: string | null;
  vsBest: string | null;
  label: "improvement" | "regression" | "unchanged" | "none";
  techniqueNote: string | null;
}

// ===================== Coach Review =====================

/** Status recenzji wyniku — od automatu AI po weryfikację trenera. */
export type ReviewStatus =
  | "ai_result"
  | "ai_estimated"
  | "ai_high_confidence"
  | "coach_verified"
  | "coach_corrected"
  | "coach_feedback_added"
  | "invalid_by_ai"
  | "invalid_by_coach";

/** Rodzaj zamówionej usługi trenerskiej. */
export type ReviewType =
  | "coach_check"
  | "technique_review"
  | "performance_consultation";

/** Status płatnej analizy trenera. */
export type PaidReviewStatus =
  | "not_requested"
  | "requested"
  | "paid"
  | "in_review"
  | "completed"
  | "rejected_invalid_video";

/** Kluczowe klatki — używane do przeliczenia wyniku. */
export interface CoachFrames {
  start_frame?: number | null;
  end_frame?: number | null;
  takeoff_frame?: number | null;
  landing_frame?: number | null;
  first_contact_frame?: number | null;
  last_contact_frame?: number | null;
  finish_frame?: number | null;
}

/** Analiza techniki dodana przez trenera. */
export interface CoachFeedback {
  techniqueSummary?: string;
  errors?: string[];
  recommendations?: string[];
  nextSessionNote?: string;
}

/** Pojedyncza pozycja w sekcji „Jak powstał wynik?”. */
export interface CalculationBasisItem {
  label: string;
  value: string;
}

/** Podstawa obliczeń — jak system doszedł do wyniku. */
export interface CalculationBasis {
  method: string;
  items: CalculationBasisItem[];
  coachVerifiedFrames: boolean;
  /**
   * Sprint Performance Scan — rozszerzenie istniejącego rekordu wyniku.
   * Pole opcjonalne: starsze rekordy bez niego działają bez zmian.
   */
  sprintScan?: import("@/features/vision-analysis/sprint/types").SprintPerformanceScan;
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  ai_result: "AI Result",
  ai_estimated: "AI Estimated",
  ai_high_confidence: "AI High Confidence",
  coach_verified: "Coach Verified",
  coach_corrected: "Coach Corrected",
  coach_feedback_added: "Coach Feedback Added",
  invalid_by_ai: "Invalid by AI",
  invalid_by_coach: "Invalid by Coach",
};

export const REVIEW_STATUS_DESCRIPTIONS: Record<ReviewStatus, string> = {
  ai_result: "Wynik policzony automatycznie na podstawie nagrania.",
  ai_estimated:
    "Wynik orientacyjny. Nagranie nie spełnia wszystkich warunków dokładnego pomiaru.",
  ai_high_confidence:
    "Wynik automatyczny z wysoką pewnością. Nagranie spełnia wymagania testu.",
  coach_verified:
    "Trener sprawdził poprawność testu, ustawienie kamery, widoczność kluczowych momentów i sens wyniku.",
  coach_corrected:
    "Trener poprawił kluczowe klatki lub dane wejściowe. System przeliczył wynik na podstawie poprawionych danych.",
  coach_feedback_added: "Trener dodał analizę techniki i zalecenia treningowe.",
  invalid_by_ai:
    "System uznał nagranie za niespełniające warunków pomiaru. Powtórz test zgodnie z instrukcją.",
  invalid_by_coach:
    "Trener uznał test za nieważny. Powtórz nagranie zgodnie z instrukcją.",
};

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  coach_check: "Coach Check",
  technique_review: "Coach Technique Review",
  performance_consultation: "Performance Consultation",
};

export const PAID_REVIEW_STATUS_LABELS: Record<PaidReviewStatus, string> = {
  not_requested: "Nie zamówiono",
  requested: "Zamówiono",
  paid: "Opłacono",
  in_review: "W trakcie analizy",
  completed: "Zakończono",
  rejected_invalid_video: "Odrzucono — słabe nagranie",
};

export const COACH_REVIEW_DISCLAIMER =
  "Coach Review nie zastępuje profesjonalnego sprzętu laboratoryjnego. Jego celem jest weryfikacja jakości testu, analiza techniki i poprawa interpretacji wyniku.";


export const CATEGORY_LABELS: Record<VisionTestCategory, string> = {
  jump: "Jump Lab",
  sprint: "Sprint Lab",
  cod: "COD / Braking",
  technique: "Gym Technique",
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

// ===================== Real Frame Analyzer =====================

/** Status realnej analizy klatkowej. */
export type FrameAnalysisStatus =
  | "frame_verified"
  | "user_marked"
  | "coach_verified"
  | "estimated"
  | "invalid";

export const FRAME_STATUS_LABELS: Record<FrameAnalysisStatus, string> = {
  frame_verified: "Frame Verified",
  user_marked: "User Marked",
  coach_verified: "Coach Verified",
  estimated: "Estimated",
  invalid: "Invalid",
};

export const FRAME_STATUS_DESCRIPTIONS: Record<FrameAnalysisStatus, string> = {
  frame_verified:
    "Wynik policzony z filmu na podstawie zaznaczonych klatek i FPS.",
  user_marked: "Klatki zaznaczone przez użytkownika.",
  coach_verified: "Trener sprawdził klatki i zatwierdził wynik.",
  estimated: "Wynik orientacyjny. FPS albo klatki mogą być niedokładne.",
  invalid: "Nie można obliczyć wyniku. Brakuje FPS albo kluczowych klatek.",
};

/** Kto oznaczył kluczowe klatki. */
export type MarkedBy = "user" | "coach" | "ai";

/** Klucz pojedynczego markera klatkowego. */
export type FrameMarkerKey =
  | "takeoff_frame"
  | "landing_frame"
  | "start_frame"
  | "finish_frame"
  | "first_contact_frame"
  | "last_contact_frame"
  | "entry_frame"
  | "braking_start_frame"
  | "stop_frame"
  | "exit_frame";

/** Definicja markera wymaganego przez dany test. */
export interface FrameMarkerDef {
  key: FrameMarkerKey;
  label: string;
  required: boolean;
}

/** Zaznaczony marker (numer klatki). */
export interface FrameMarker {
  key: FrameMarkerKey;
  frame: number;
}

/** Ocena jakościowa (manual/coach). */
export type FrameQuality = "good" | "medium" | "poor";

export const FRAME_QUALITY_LABELS: Record<FrameQuality, string> = {
  good: "Dobra",
  medium: "Średnia",
  poor: "Słaba",
};

/** Ręczne dane wejściowe (dystans, jakość, oceny techniki COD). */
export interface FrameManualInputs {
  distance_cm?: number | null;
  landing_quality?: FrameQuality | null;
  number_of_contacts?: number | null;
  knee_control?: FrameQuality | null;
  trunk_control?: FrameQuality | null;
  foot_placement?: FrameQuality | null;
  braking_steps?: number | null;
}

/** Wyliczone wartości pochodne analizy klatkowej. */
export interface FrameDerived {
  frameCount?: number | null;
  flightTime?: number | null;
  sprintTime?: number | null;
  brakingTime?: number | null;
  totalTime?: number | null;
  jumpHeightCm?: number | null;
  distanceM?: number | null;
  distanceCm?: number | null;
  speedMs?: number | null;
  speedKmh?: number | null;
  numberOfContacts?: number | null;
  contactRhythm?: number | null;
}

/** Kompletny wynik realnej analizy klatkowej (przed zapisem). */
export interface FrameAnalysisResult {
  testId: string;
  category: VisionTestCategory;
  fps: number;
  markers: Partial<Record<FrameMarkerKey, number>>;
  manual: FrameManualInputs;
  status: FrameAnalysisStatus;
  error: string | null;
  mainResultValue: number | null;
  mainResultUnit: string | null;
  method: string;
  markedBy: MarkedBy;
  derived: FrameDerived;
  basis: CalculationBasis;
}
