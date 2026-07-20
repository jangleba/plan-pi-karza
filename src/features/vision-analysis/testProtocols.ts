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
  /** Minimalna oczekiwana długość okna ruchu w nagraniu (s). */
  minMovementDurationSeconds?: number;
  /** Maksymalna oczekiwana długość okna ruchu w nagraniu (s). */
  maxMovementDurationSeconds?: number;
  /** Zakres oczekiwanej liczby powtórzeń (dla serii; [1,1] dla pojedynczych). */
  expectedRepCountRange?: [number, number];
  /** Minimalny margines spokoju przed właściwym ruchem (s). */
  leadingMarginSeconds?: number;
  /** Minimalny margines spokoju po ruchu (s). */
  trailingMarginSeconds?: number;
  /** Krótkie, konkretne instrukcje nagrania — pokazywane przed uploadem. */
  recordingInstructions?: string[];
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
  single_leg_hop: {
    testType: "single_leg_hop",
    measurementFamily: "GROUND_DISTANCE",
    requiredCalibration: "video_homography",
    requiredLines: 0,
    preferredFps: 120,
    minimumFps: 60,
    requiredCameraSetup: "side",
    requiredEvents: ["takeoff", "landing"],
    forbiddenEvents: ["ground_contact"],
    attemptProtocol: BILATERAL,
    resultSelection: "best_per_side",
    officialResultRequirements: {
      requiresCalibration: true,
      requiresTimingLines: false,
      requiresProtocolMatch: true,
      minValidAttempts: 2,
      maxRelativeUncertainty: 0.05,
    },
    algorithmVersion: algo("single_leg_hop"),
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
  flying_sprint: {
    testType: "flying_sprint",
    measurementFamily: "SPRINT_TIMING",
    requiredCalibration: "timing_lines",
    requiredLines: 2,
    preferredFps: 240,
    minimumFps: 120,
    requiredCameraSetup: "side",
    requiredEvents: ["timing_a_crossing", "timing_b_crossing"],
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
    algorithmVersion: algo("flying_sprint"),
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

/**
 * Parametry realnego okna ruchu i instrukcji nagrania per test. Trzymane osobno,
 * żeby nie ruszać istniejących analizatorów. Wartości wynikają z protokołów
 * pomiaru (nie zgadujemy — używamy zakresów realnych dla danej rodziny testów).
 */
const PROTOCOL_EXTRAS: Record<TestType, Required<Pick<TestProtocol,
  "minMovementDurationSeconds" | "maxMovementDurationSeconds" | "expectedRepCountRange"
  | "leadingMarginSeconds" | "trailingMarginSeconds" | "recordingInstructions">>> = {
  cmj: {
    minMovementDurationSeconds: 0.6, maxMovementDurationSeconds: 3.5,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Nagraj z boku, całą sylwetkę i stopy w kadrze.",
      "Zalecane 120 FPS (60 FPS = wynik estymowany).",
      "Zostaw 2 s spokoju przed odbiciem i 2 s po lądowaniu.",
      "Jedno odbicie w nagraniu (bez próbnych powtórzeń).",
    ],
  },
  squat_jump: {
    minMovementDurationSeconds: 0.4, maxMovementDurationSeconds: 3.0,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Bez zamachu w dół — start z pozycji półprzysiadu.",
      "Nagraj z boku, całą sylwetkę i stopy w kadrze.",
      "Zalecane 120 FPS. Zostaw 2 s zapasu przed i po skoku.",
    ],
  },
  drop_jump: {
    minMovementDurationSeconds: 0.5, maxMovementDurationSeconds: 3.5,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Nagraj z boku. Wymagane 120–240 FPS (krótki kontakt z podłożem).",
      "Widoczne wejście z podwyższenia i pełne lądowanie.",
      "Zostaw 2 s zapasu przed startem i po lądowaniu.",
    ],
  },
  repeated_jumps: {
    minMovementDurationSeconds: 4, maxMovementDurationSeconds: 20,
    expectedRepCountRange: [4, 30], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Nagraj całą serię jednym ujęciem, bez cięcia.",
      "Wymagane 120–240 FPS. Kamera z boku, stopy w kadrze.",
      "2 s spokoju przed pierwszym i po ostatnim odbiciu.",
    ],
  },
  broad_jump: {
    minMovementDurationSeconds: 0.5, maxMovementDurationSeconds: 3.5,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Skalibruj podłoże w tym filmie (linia wybicia + obszar lądowania).",
      "Nagraj z boku, pełna trajektoria skoku i pięta lądowania widoczne.",
      "Zostaw 2 s zapasu przed i po skoku.",
    ],
  },
  single_leg_hop: {
    minMovementDurationSeconds: 0.5, maxMovementDurationSeconds: 3.5,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Osobne nagrania dla lewej i prawej nogi (po 2 prawidłowe próby).",
      "Skalibruj podłoże w tym filmie. Pięta lądowania musi być widoczna.",
      "2 s spokoju przed skokiem i po lądowaniu.",
    ],
  },
  pogo_jumps: {
    minMovementDurationSeconds: 4, maxMovementDurationSeconds: 15,
    expectedRepCountRange: [10, 30], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Seria szybkich, krótkich odbić — kolana prawie proste.",
      "Wymagane 120–240 FPS. Nagraj z boku, stopy w kadrze.",
      "2 s spokoju przed pierwszym i po ostatnim odbiciu.",
    ],
  },
  sprint_20m: {
    minMovementDurationSeconds: 2.5, maxMovementDurationSeconds: 6.5,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Skalibruj linię START i FINISH na podłożu (Timing Plane).",
      "Kamera z boku, prostopadle do osi biegu, nieruchoma.",
      "Cała sylwetka widoczna od startu do mety. 2 s zapasu z każdej strony.",
    ],
  },
  sprint_30m: {
    minMovementDurationSeconds: 3.5, maxMovementDurationSeconds: 8,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Skalibruj linię START i FINISH (30 m) na podłożu.",
      "Kamera z boku, prostopadle do osi biegu, nieruchoma.",
      "2 s zapasu przed startem i po minięciu mety.",
    ],
  },
  flying_sprint: {
    minMovementDurationSeconds: 1.5, maxMovementDurationSeconds: 5,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Skalibruj bramki TIMING_A i TIMING_B (odcinek pomiarowy).",
      "Wejdź w odcinek z pełną prędkością (rozbieg poza bramką A).",
      "Kamera nieruchoma, prostopadle do osi biegu.",
    ],
  },
  five_ten_five: {
    minMovementDurationSeconds: 4, maxMovementDurationSeconds: 10,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Skalibruj 3 linie: CENTER, TURN_LEFT, TURN_RIGHT.",
      "Kamera z przodu, prostopadle do linii środkowej, nieruchoma.",
      "Osobne próby dla zwrotu w prawo i w lewo.",
    ],
  },
  sprint_to_stop: {
    minMovementDurationSeconds: 2.5, maxMovementDurationSeconds: 7,
    expectedRepCountRange: [1, 1], leadingMarginSeconds: 2, trailingMarginSeconds: 2,
    recordingInstructions: [
      "Skalibruj: BRAKING_ENTRY, STOP_ZONE_START, STOP_ZONE_END.",
      "Wbiegnij z pełną prędkością i zatrzymaj się w strefie.",
      "Kamera z boku, nieruchoma. 2 s zapasu przed i po zatrzymaniu.",
    ],
  },
  analyze_gym_exercise: {
    minMovementDurationSeconds: 1, maxMovementDurationSeconds: 60,
    expectedRepCountRange: [1, 20], leadingMarginSeconds: 1, trailingMarginSeconds: 1,
    recordingInstructions: [
      "Nagraj całe ćwiczenie z jednej stabilnej pozycji.",
      "Widoczna cała sylwetka wykonawcy w każdej powtórce.",
      "60 FPS wystarczy — kluczowa jest czytelność techniki.",
    ],
  },
};

export function getTestProtocol(testType: TestType): TestProtocol {
  const base = TEST_PROTOCOL_REGISTRY[testType];
  const extras = PROTOCOL_EXTRAS[testType];
  return { ...base, ...extras };
}

export function listTestProtocols(): TestProtocol[] {
  return (Object.keys(TEST_PROTOCOL_REGISTRY) as TestType[]).map(getTestProtocol);
}

/** Wszystkie realne testy Vision Lab (kolejność stabilna wg rejestru). */
export const ALL_TEST_TYPES = Object.keys(TEST_PROTOCOL_REGISTRY) as TestType[];
