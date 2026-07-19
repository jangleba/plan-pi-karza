/**
 * Typy silnika analizy wideo Vision Lab.
 * Format wyniku jest jednolity dla wszystkich testów (patrz VideoAnalysisResult).
 */

export type TestType =
  | "cmj"
  | "squat_jump"
  | "drop_jump"
  | "repeated_jumps"
  | "broad_jump"
  | "single_leg_hop"
  | "pogo_jumps"
  | "sprint_20m"
  | "sprint_30m"
  | "flying_sprint"
  | "five_ten_five"
  | "sprint_to_stop"
  | "analyze_gym_exercise";

export type CameraSetup = "side" | "front" | "back" | "45deg" | "top";

export type AnalysisStatus =
  | "completed"
  | "needs_review"
  | "invalid_recording"
  | "failed"
  /** Ruch rozpoznany, ale brak kalibracji przestrzennej tego filmu. */
  | "calibration_required"
  /** Wynik bez skali — tylko technika (bez cm/m/prędkości). */
  | "technique_only";

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
  | "TEST_PROTOCOL_MISMATCH"
  | "EVENTS_NOT_DETECTED"
  | "LOW_RESOLUTION"
  | "POSE_NOT_DETECTED"
  | "CALIBRATION_PROFILE_MISMATCH"
  | "CALIBRATION_CAMERA_MOVED"
  | "TIMING_LINE_NOT_CALIBRATED"
  | "TIMING_PLANE_CALIBRATION_FAILED"
  | "LINE_CROSSING_NOT_DETECTED"
  | "WRONG_CROSSING_DIRECTION"
  | "CROSSING_UNCERTAINTY_TOO_HIGH"
  | "WRONG_REPETITION_COUNT"
  | "CAMERA_SETUP_CHANGED"
  | "LANDING_OUT_OF_CALIBRATION_AREA"
  | "HEEL_OCCLUDED"
  | "MISSING_TIMING_LINE"
  | "ATHLETE_TOO_SMALL"
  | "TORSO_OCCLUDED"
  | "INVALID_CAMERA_GEOMETRY"
  | "DISTANCE_UNKNOWN"
  | "TIMING_LINES_REQUIRED"
  | "TURN_NOT_DETECTED"
  | "TURN_LINE_NOT_REACHED"
  | "WRONG_LINE_SEQUENCE"
  | "WRONG_TURNING_SIDE"
  | "BRAKING_ZONE_REQUIRED"
  | "ENTRY_SPEED_UNKNOWN"
  | "INVALID_APPROACH_SPRINT"
  | "NO_SPEED_REDUCTION"
  | "STOP_NOT_DETECTED"
  | "STOP_OUT_OF_ZONE"
  | "DIRECTION_CHANGE_NOT_STOP"
  | "TEST_WINDOW_INCOMPLETE";

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
  /** Kontener rozpoznany z MIME/nazwy pliku (mp4, mov, webm…), gdy dostępny. */
  container?: string | null;
  /** Typ MIME nagrania (video/mp4, video/quicktime…), gdy dostępny. */
  codec?: string | null;
  /** Realne timestampy pierwszych klatek (mediaTime w sekundach). */
  frameTimestamps?: number[];
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
  /** Stabilny indeks źródłowej klatki (deterministyczny między uruchomieniami). */
  sourceFrameIndex?: number;
  mediaTime: number;
  presentationTimestamp: number;
  /** Rzeczywisty timestamp klatki w filmie — używany do obliczeń sportowych. */
  sourceTimestampMs?: number;
  /** Rzeczywisty timestamp źródłowej klatki w mikrosekundach (pełna precyzja). */
  sourceTimestampUs?: number;
  /** Techniczny, monotoniczny timestamp przekazany do MediaPipe. */
  mediaPipeTimestampMs?: number;
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
  /** Skala przestrzenna (metry/piksel) z dopasowanego profilu kalibracji. */
  metersPerPixel?: number;
  /** Klucz użytego profilu kalibracji (urządzenie|obiektyw|orientacja|fps|zoom). */
  profileKey?: string;
  /** Metadane dopasowania profilu do bieżącego nagrania. */
  profileMatch?: {
    exact: boolean;
    score: number;
    reprojectionErrorPx: number;
    reasons: string[];
  };
  /** Homografia world(mm)→image(px) z dopasowanego profilu (do przeliczeń podłoża). */
  homography?: [number, number, number, number, number, number, number, number, number];
  /** Identyfikator wybranego profilu (do debugu). */
  profileId?: string;
  /** Skrót/hash konfiguracji profilu (do debugu). */
  calibrationHash?: string;
  /** Kod niezgodności profilu — jeśli ustawiony, wynik przestrzenny jest zablokowany. */
  mismatchCode?: "CALIBRATION_PROFILE_MISMATCH" | "CALIBRATION_CAMERA_MOVED";
  /** Czy wykryto ruch kamery po kalibracji. */
  cameraMoved?: boolean;
  /**
   * Skalibrowane linie pomiaru czasu (Timing Plane) leżące na podłożu.
   * Każda linia jest zdefiniowana współrzędną świata worldXmm (mm) i przez
   * homografię rzutowana na obraz. Punkt tułowia NIGDY nie jest rzutowany przez
   * homografię — porównywany jest jego piksel z rzutem linii podłoża.
   */
  timingLines?: TimingLineSpec[];
  /** Znana prędkość wejściowa (m/s) dla testów hamowania, gdy mierzona bramką. */
  knownEntrySpeedMs?: number | null;
}

/** Rola linii pomiaru czasu / strefy w protokole. */
export type TimingLineRole =
  | "START"
  | "FINISH"
  | "TIMING_A"
  | "TIMING_B"
  | "TURN_LINE"
  | "CENTER"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "BRAKING_ENTRY"
  | "STOP_ZONE_START"
  | "STOP_ZONE_END";

/** Definicja pojedynczej linii pomiaru czasu na podłożu (world plane). */
export interface TimingLineSpec {
  id: string;
  /** Rola linii w protokole pomiaru (START/FINISH/TIMING_A/TIMING_B). */
  role?: TimingLineRole;
  /** Położenie linii wzdłuż osi ruchu w świecie (mm) — legacy / pojedyncza oś. */
  worldXmm?: number;
  /** Pierwszy punkt linii na podłożu (mm) — definiuje płaszczyznę pomiarową. */
  groundStartPointMm?: { x: number; y: number };
  /** Drugi punkt linii na podłożu (mm). */
  groundEndPointMm?: { x: number; y: number };
  /** Oczekiwany kierunek przecięcia względem osi ruchu. */
  direction?: "forward" | "backward" | "any";
}


export interface AnalysisContext {
  testType: TestType;
  metadata: VideoMetadata;
  poses: FramePose[];
  cameraSetup: CameraSetup;
  calibration: Calibration | null;
  /** Rzeczywisty wzrost zawodnika (cm) z profilu — do auto-kalibracji skali. */
  athleteHeightCm?: number | null;
  /** Kalibracja sceny przypisana do tego filmu (linia wybicia, obszar lądowania, homografia). */
  calibrationRecord?: import("./videoCalibration").CalibrationRecord | null;
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
  /** Bezwzględna niepewność pomiaru w tej samej jednostce co value (±). */
  uncertainty?: number;
  /** Liczba miejsc po przecinku dopasowana do niepewności. */
  displayPrecision?: number;
  /** Sformatowany wynik z niepewnością, np. "35.9 ± 0.8". */
  display?: string;
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
  /**
   * Warstwa rzetelności pomiaru — poziom jakości, niepewność, powtarzalność.
   * Zwraca też metryki wzbogacone o niepewność (± i dopasowana precyzja).
   */
  computeAccuracy?(
    events: DetectedEvent[],
    metrics: CalculatedMetric[],
    context: AnalysisContext,
  ): {
    measurement: import("./measurementAccuracy").MeasurementAccuracy;
    metrics: CalculatedMetric[];
  };
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
  /** Liczba klatek zdekodowanych z filmu (rzeczywiste, nie deklarowane). */
  decodedFrames?: number;
  /** Liczba klatek, w których faktycznie wykryto sylwetkę i analizowano pozę. */
  analyzedFrames?: number;
  /** Podsumowanie rozpoznania protokołu (gate przed adapterem). */
  recognition?: {
    selectedTestType: TestType;
    detectedSignature: string;
    detectedTestConfidence: number;
    protocolMatch: boolean;
  };
  /** Warstwa rzetelności pomiaru: poziom jakości, niepewność, powtarzalność. */
  measurement?: import("./measurementAccuracy").MeasurementAccuracy;
  /** Podsumowanie kalibracji użytej w tym wyniku (debug + UI zaufania). */
  calibration?: {
    /** Czy adapter przestrzenny rzeczywiście użył homografii profilu. */
    usedHomography: boolean;
    profileId: string | null;
    calibrationHash: string | null;
    reprojectionErrorPx: number | null;
    mismatchCode: QualityIssueCode | null;
    cameraMoved: boolean;
    /** Homografia world→image (do panelu debug). */
    homography: number[] | null;
  };
}

/** Progi akceptacji wyniku na podstawie confidence. */
export const CONFIDENCE_THRESHOLDS = {
  autoAccept: 0.6,
  needsReview: 0.45,
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
  TEST_PROTOCOL_MISMATCH:
    "Wybrano test Pogo Jumps, ale nagranie przedstawia prawdopodobnie CMJ. Pogo Jumps wymaga serii szybkich odbić z krótkim kontaktem z podłożem.",
  EVENTS_NOT_DETECTED: "Nie wykryto kluczowych zdarzeń ruchu.",
  LOW_RESOLUTION: "Zbyt niska rozdzielczość nagrania.",
  POSE_NOT_DETECTED: "Nie wykryto sylwetki zawodnika.",
  CALIBRATION_PROFILE_MISMATCH:
    "Brak profilu kalibracji dokładnie zgodnego z tym nagraniem (urządzenie, aparat, obiektyw, orientacja, rozdzielczość, FPS, zoom). Wykonaj kalibrację dla tej konfiguracji.",
  CALIBRATION_CAMERA_MOVED:
    "Kamera poruszyła się po kalibracji — profil został unieważniony dla tego nagrania. Ustaw telefon nieruchomo i nagraj ponownie.",
  TIMING_LINE_NOT_CALIBRATED:
    "Brak skalibrowanej linii pomiaru czasu (Timing Plane). Wykonaj kalibrację z widoczną linią startu/mety na podłożu.",
  TIMING_PLANE_CALIBRATION_FAILED:
    "Nie udało się zbudować płaszczyzny pomiarowej z kalibracji (homografia nieodwracalna lub linia poza kadrem).",
  LINE_CROSSING_NOT_DETECTED:
    "Nie wykryto przecięcia linii pomiaru czasu. Upewnij się, że zawodnik przekracza całą linię w kadrze.",
  WRONG_CROSSING_DIRECTION:
    "Zawodnik przekroczył linię w niewłaściwym kierunku względem protokołu testu.",
  CROSSING_UNCERTAINTY_TOO_HIGH:
    "Niepewność momentu przecięcia zbyt wysoka. Nagraj z wyższym FPS i nieruchomą kamerą.",
  WRONG_REPETITION_COUNT:
    "Nagranie zawiera nieprawidłową liczbę prób lub powtórzeń dla tego protokołu. Jeden film to jedna próba (lub jedna pełna seria).",
  CAMERA_SETUP_CHANGED:
    "Ustawienie kamery zmieniło się względem kalibracji (markery, tło, skala, obrót lub kadr). Wykonaj nową kalibrację tego filmu.",
  LANDING_OUT_OF_CALIBRATION_AREA:
    "Lądowanie znajduje się poza skalibrowanym obszarem podłoża. Rozszerz kalibrację o strefę lądowania.",
  HEEL_OCCLUDED:
    "Pięta lądowania jest zasłonięta lub niewidoczna. Nagraj tak, aby pięta była wyraźnie widoczna w kadrze.",
  MISSING_TIMING_LINE:
    "Brak wymaganej linii pomiaru czasu (START/FINISH lub TIMING_A/TIMING_B) w kalibracji tego filmu.",
  ATHLETE_TOO_SMALL:
    "Sylwetka zawodnika jest zbyt mała w kadrze, aby wiarygodnie wykryć przecięcie. Nagraj z bliższej odległości lub węższym kadrem.",
  TORSO_OCCLUDED:
    "Punkt referencyjny tułowia jest zasłonięty w momencie przecięcia. Zapewnij widoczność tułowia w całym biegu.",
  INVALID_CAMERA_GEOMETRY:
    "Geometria kamery jest niewłaściwa dla pomiaru czasu (linia rzutuje się poziomo). Ustaw kamerę prostopadle do osi ruchu.",
  DISTANCE_UNKNOWN:
    "Dystans nie jest znany. Podaj dystans protokołu lub skalibruj linie o znanej odległości na podłożu.",
  TIMING_LINES_REQUIRED:
    "Test zmiany kierunku wymaga skalibrowanych linii/stref (np. TIMING_A + linia zwrotu lub CENTER + TURN_LEFT + TURN_RIGHT).",
  TURN_NOT_DETECTED:
    "Nie wykryto zmiany kierunku. Zwykły bieg bez zwrotu nie jest testem COD.",
  TURN_LINE_NOT_REACHED:
    "Zawodnik nie dotarł stopą do linii/strefy zwrotu. Wykonaj pełny zwrot przy linii.",
  WRONG_LINE_SEQUENCE:
    "Niewłaściwa kolejność przekroczeń linii dla tego protokołu COD.",
  WRONG_TURNING_SIDE:
    "Zwrot wykonano na niewłaściwą nogę względem wybranej strony próby.",
  BRAKING_ZONE_REQUIRED:
    "Test hamowania wymaga skalibrowanej strefy: BRAKING_ENTRY, STOP_ZONE_START i STOP_ZONE_END na podłożu.",
  ENTRY_SPEED_UNKNOWN:
    "Nie można wyznaczyć prędkości wejściowej. Podaj znaną prędkość lub skalibruj strefę jej pomiaru.",
  INVALID_APPROACH_SPRINT:
    "Brak prawidłowego sprintu przed hamowaniem. Wejdź w strefę z pełną prędkością.",
  NO_SPEED_REDUCTION:
    "Nie wykryto wyraźnej redukcji prędkości. To zwykły bieg, nie hamowanie.",
  STOP_NOT_DETECTED:
    "Nie wykryto zatrzymania. Zatrzymaj się w pełni w strefie i pozostań w kadrze.",
  STOP_OUT_OF_ZONE:
    "Zatrzymanie nastąpiło poza wymaganą strefą (STOP_ZONE_START–STOP_ZONE_END).",
  DIRECTION_CHANGE_NOT_STOP:
    "Wykryto zmianę kierunku zamiast zatrzymania. Test hamowania wymaga pełnego zatrzymania.",
  TEST_WINDOW_INCOMPLETE:
    "Nagranie nie zawiera pełnego okna testu (za mały margines przed lub po ruchu). Zostaw min. 2 s spokoju z każdej strony właściwego ruchu.",
};

/** Indeksy landmarków MediaPipe Pose (podzbiór używany w analizie). */
export const POSE = {
  NOSE: 0,
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
