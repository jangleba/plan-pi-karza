/**
 * TestProtocolRegistry — jedyne źródło prawdy o protokole KAŻDEGO testu Vision Lab.
 *
 * Rejestr NIE dubluje logiki analizatorów (src/features/vision-analysis/analyzers).
 * Opisuje protokół pomiaru: rodzinę, wymaganą kalibrację, linie, FPS, zdarzenia,
 * protokół prób i warunki oficjalnego wyniku. Adapter (analizator) może ruszyć
 * dopiero po dopasowaniu protokołu (patrz testProtocolRecognizer).
 *
 * Testy pochodzą wyłącznie z realnego kodu (testAnalyzerRegistry + visionTests).
 * Nie dodajemy tu wymyślonych testów.
 */

import type { TestType, CameraSetup } from "./types";
import { testAnalyzerRegistry } from "./testAnalyzerRegistry";

/** Rodzina pomiaru — wspólny model fizyczny i wspólny sposób walidacji. */
export type MeasurementFamily =
  | "VERTICAL_JUMP"
  | "REACTIVE_CONTACT"
  | "GROUND_DISTANCE"
  | "SPRINT_TIMING"
  | "CHANGE_OF_DIRECTION"
  | "DECELERATION";

/** Testy techniczne (coach review) leżą poza rodzinami pomiarowymi. */
export type TestFamily = MeasurementFamily | "TECHNIQUE";

/** Rodzaj wymaganej kalibracji sceny. */
export type RequiredCalibration =
  | "none"
  | "video_homography" // homografia podłoża per-film (odległości na podłożu)
  | "timing_lines"; // linie pomiaru czasu (Timing Plane) + homografia

/** Rodzaj protokołu prób. */
export type AttemptProtocolKind =
  | "SINGLE_MAX_BEST_OF" // najlepszy z prób maksymalnych
  | "BILATERAL_BEST_PER_SIDE" // najlepszy na każdą stronę + asymetria
  | "REPEATED_CONTACT_SERIES" // jedna pełna prawidłowa seria
  | "SINGLE_TECHNIQUE"; // pojedyncze nagranie do oceny trenera

/** Reprezentacja jednego zaimportowanego filmu w protokole. */
export type VideoRepresents = "attempt" | "series";

export interface AttemptProtocol {
  kind: AttemptProtocolKind;
  /** Wymagana liczba PRAWIDŁOWYCH prób (dla bilateralnych: na każdą stronę). */
  requiredValidAttempts: number;
  /** Maksymalna liczba prób (uwzględnia próbę zastępczą za nieważną). */
  maxAttempts: number;
  bilateral: boolean;
  /** Dodatkowa próba/seria WYŁĄCZNIE jako zastępstwo próby nieważnej. */
  replacementOnInvalidOnly: boolean;
  /** Jeden film = jedna próba albo jedna seria. */
  videoRepresents: VideoRepresents;
}

/** Sposób wyboru wyniku końcowego z prób. */
export type ResultSelection = "best" | "best_per_side" | "series_summary" | "coach_review";

export interface OfficialResultRequirements {
  requiresCalibration: boolean;
  requiresTimingLines: boolean;
  requiresProtocolMatch: boolean;
  /** Minimalna liczba prawidłowych prób (na stronę dla bilateralnych). */
  minValidAttempts: number;
  /** Maksymalna względna niepewność wyniku (null = brak wymogu liczbowego). */
  maxRelativeUncertainty: number | null;
}

export interface TestProtocol {
  testType: TestType;
  measurementFamily: TestFamily;
  requiredCalibration: RequiredCalibration;
  /** Liczba wymaganych linii pomiaru czasu na podłożu (0 = brak). */
  requiredLines: number;
  preferredFps: number;
  minimumFps: number;
  requiredCameraSetup: CameraSetup;
  /** Typy zdarzeń, które MUSZĄ wystąpić, by adapter policzył wynik. */
  requiredEvents: string[];
  /** Typy zdarzeń, których obecność unieważnia protokół (np. seria w teście max). */
  forbiddenEvents: string[];
  attemptProtocol: AttemptProtocol;
  resultSelection: ResultSelection;
  officialResultRequirements: OfficialResultRequirements;
  /** Wersja algorytmu = wersja analizatora (źródło: testAnalyzerRegistry). */
  algorithmVersion: string;
  protocolVersion: string;
}

const PROTOCOL_VERSION = "1.0.0";

/** Protokół prób: pojedynczy wynik maksymalny (2 prawidłowe, 3. jako zastępstwo). */
const SINGLE_MAX: AttemptProtocol = {
  kind: "SINGLE_MAX_BEST_OF",
  requiredValidAttempts: 2,
  maxAttempts: 3,
  bilateral: false,
  replacementOnInvalidOnly: true,
  videoRepresents: "attempt",
};

/** Protokół serii reaktywnej: jedna pełna prawidłowa seria (druga po unieważnieniu). */
/** Protokół bilateralny: 2 prawidłowe próby na stronę, najlepszy wynik strony + asymetria. */
const BILATERAL: AttemptProtocol = {
  kind: "BILATERAL_BEST_PER_SIDE",
  requiredValidAttempts: 2,
  maxAttempts: 3,
  bilateral: true,
  replacementOnInvalidOnly: true,
  videoRepresents: "attempt",
};

const SERIES: AttemptProtocol = {
  kind: "REPEATED_CONTACT_SERIES",
  requiredValidAttempts: 1,
  maxAttempts: 2,
  bilateral: false,
  replacementOnInvalidOnly: true,
  videoRepresents: "series",
};

/** Protokół techniki: jedno nagranie, ocena trenera. */
const TECHNIQUE: AttemptProtocol = {
  kind: "SINGLE_TECHNIQUE",
  requiredValidAttempts: 1,
  maxAttempts: 3,
  bilateral: false,
  replacementOnInvalidOnly: false,
  videoRepresents: "series",
};

function algo(testType: TestType): string {
  return testAnalyzerRegistry[testType].analyzerVersion;
}

export const TEST_PROTOCOL_REGISTRY: Record<TestType, TestProtocol> = {
  cmj: {
    testType: "cmj",
    measurementFamily: "VERTICAL_JUMP",
    requiredCalibration: "none",
    requiredLines: 0,
    preferredFps: 120,
    minimumFps: 60,
    requiredCameraSetup: "side",
    requiredEvents: ["takeoff", "landing"],
    forbiddenEvents: ["ground_contact"],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: false,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.05,
    },
    algorithmVersion: algo("cmj"),
    protocolVersion: PROTOCOL_VERSION,
  },
  squat_jump: {
    testType: "squat_jump",
    measurementFamily: "VERTICAL_JUMP",
    requiredCalibration: "none",
    requiredLines: 0,
    preferredFps: 120,
    minimumFps: 60,
    requiredCameraSetup: "side",
    requiredEvents: ["takeoff", "landing"],
    forbiddenEvents: ["ground_contact"],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: false,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.05,
    },
    algorithmVersion: algo("squat_jump"),
    protocolVersion: PROTOCOL_VERSION,
  },
  drop_jump: {
    testType: "drop_jump",
    measurementFamily: "REACTIVE_CONTACT",
    requiredCalibration: "none",
    requiredLines: 0,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["first_contact", "takeoff", "landing"],
    forbiddenEvents: [],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: false,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.08,
    },
    algorithmVersion: algo("drop_jump"),
    protocolVersion: PROTOCOL_VERSION,
  },
  repeated_jumps: {
    testType: "repeated_jumps",
    measurementFamily: "REACTIVE_CONTACT",
    requiredCalibration: "none",
    requiredLines: 0,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["ground_contact"],
    forbiddenEvents: [],
    attemptProtocol: SERIES,
    resultSelection: "series_summary",
    officialResultRequirements: {
      requiresCalibration: false,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 1,
      maxRelativeUncertainty: 0.1,
    },
    algorithmVersion: algo("repeated_jumps"),
    protocolVersion: PROTOCOL_VERSION,
  },
  broad_jump: {
    testType: "broad_jump",
    measurementFamily: "GROUND_DISTANCE",
    requiredCalibration: "video_homography",
    requiredLines: 0,
    preferredFps: 120,
    minimumFps: 60,
    requiredCameraSetup: "side",
    requiredEvents: ["takeoff", "landing"],
    forbiddenEvents: ["ground_contact"],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: true,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.05,
    },
    algorithmVersion: algo("broad_jump"),
    protocolVersion: PROTOCOL_VERSION,
  },
  pogo_jumps: {
    testType: "pogo_jumps",
    measurementFamily: "REACTIVE_CONTACT",
    requiredCalibration: "none",
    requiredLines: 0,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["ground_contact"],
    forbiddenEvents: [],
    attemptProtocol: SERIES,
    resultSelection: "series_summary",
    officialResultRequirements: {
      requiresCalibration: false,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 1,
      maxRelativeUncertainty: 0.08,
    },
    algorithmVersion: algo("pogo_jumps"),
    protocolVersion: PROTOCOL_VERSION,
  },
  sprint_20m: {
    testType: "sprint_20m",
    measurementFamily: "SPRINT_TIMING",
    requiredCalibration: "timing_lines",
    requiredLines: 2,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["start_crossing", "finish_crossing"],
    forbiddenEvents: [],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: true,
      requiresTimingLines: true,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.03,
    },
    algorithmVersion: algo("sprint_20m"),
    protocolVersion: PROTOCOL_VERSION,
  },
  sprint_30m: {
    testType: "sprint_30m",
    measurementFamily: "SPRINT_TIMING",
    requiredCalibration: "timing_lines",
    requiredLines: 2,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["start_crossing", "finish_crossing"],
    forbiddenEvents: [],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: true,
      requiresTimingLines: true,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.03,
    },
    algorithmVersion: algo("sprint_30m"),
    protocolVersion: PROTOCOL_VERSION,
  },
  five_ten_five: {
    testType: "five_ten_five",
    measurementFamily: "CHANGE_OF_DIRECTION",
    requiredCalibration: "timing_lines",
    requiredLines: 3,
    preferredFps: 120,
    minimumFps: 60,
    requiredCameraSetup: "front",
    requiredEvents: ["movement_start", "stop"],
    forbiddenEvents: [],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: true,
      requiresTimingLines: true,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.04,
    },
    algorithmVersion: algo("five_ten_five"),
    protocolVersion: PROTOCOL_VERSION,
  },
  sprint_to_stop: {
    testType: "sprint_to_stop",
    measurementFamily: "DECELERATION",
    requiredCalibration: "timing_lines",
    requiredLines: 2,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["movement_start", "stop"],
    forbiddenEvents: [],
    attemptProtocol: SINGLE_MAX,
    resultSelection: "best",
    officialResultRequirements: {
      requiresCalibration: true,
      requiresTimingLines: true,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.04,
    },
    algorithmVersion: algo("sprint_to_stop"),
    protocolVersion: PROTOCOL_VERSION,
  },
  analyze_gym_exercise: {
    testType: "analyze_gym_exercise",
    measurementFamily: "TECHNIQUE",
    requiredCalibration: "none",
    requiredLines: 0,
    preferredFps: 60,
    minimumFps: 30,
    requiredCameraSetup: "side",
    requiredEvents: ["rep_marker"],
    forbiddenEvents: [],
    attemptProtocol: TECHNIQUE,
    resultSelection: "coach_review",
    officialResultRequirements: {
      requiresCalibration: false,
      requiresTimingLines: false,
      requiresProtocolMatch: false,
      minValidAttempts: 1,
      maxRelativeUncertainty: null,
    },
    algorithmVersion: algo("analyze_gym_exercise"),
    protocolVersion: PROTOCOL_VERSION,
  },
};

export function getTestProtocol(testType: TestType): TestProtocol {
  return TEST_PROTOCOL_REGISTRY[testType];
}

export function listTestProtocols(): TestProtocol[] {
  return Object.values(TEST_PROTOCOL_REGISTRY);
}

/** Wszystkie realne testy Vision Lab (kolejność stabilna wg rejestru). */
export const ALL_TEST_TYPES = Object.keys(TEST_PROTOCOL_REGISTRY) as TestType[];
