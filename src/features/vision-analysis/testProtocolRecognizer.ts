/**
 * TestProtocolRecognizer — jedyna ścieżka rozpoznania testu po uploadzie.
 *
 * Pipeline (jedyny):
 *   MovementEventExtractor (analyzeJumpField + detectGroundContacts +
 *     detectRepeatedCycles + detectDropJumpPhases + hipXSeries)
 *   → MovementSignatureBuilder (recognizeMovement)
 *   → SelectedTestValidator (recognizeTestProtocol)
 *   → TestAdapter.
 *
 * Determinizm: rozpoznanie korzysta wyłącznie z deterministycznej matematyki
 * pozy — ten sam plik zawsze daje identyczny wynik.
 */

import type { FramePose, QualityIssueCode } from "./types";
import type { TestType } from "./types";
import type { MeasurementFamily, TestFamily } from "./testProtocols";
import { getTestProtocol } from "./testProtocols";
import {
  detectFlightPhase,
  detectGroundContacts,
  detectDropJumpPhases,
  analyzeJumpField,
  detectRepeatedCycles,
} from "./analyzers/jumpDetection";
import { hipXSeries } from "./poseSeries";

export type MovementSignature =
  | "SINGLE_FLIGHT"
  | "DROP_REBOUND"
  | "REPEATED_CONTACTS"
  | "LOCOMOTION"
  | "TECHNIQUE"
  | "UNKNOWN";

const SIGNATURE_FAMILIES: Record<MovementSignature, TestFamily[]> = {
  SINGLE_FLIGHT: ["VERTICAL_JUMP", "GROUND_DISTANCE"],
  DROP_REBOUND: ["REACTIVE_CONTACT"],
  REPEATED_CONTACTS: ["REACTIVE_CONTACT"],
  LOCOMOTION: ["SPRINT_TIMING", "CHANGE_OF_DIRECTION", "DECELERATION"],
  TECHNIQUE: ["TECHNIQUE"],
  UNKNOWN: [],
};

export interface ProtocolRecognition {
  selectedTestType: TestType;
  selectedFamily: TestFamily;
  detectedSignature: MovementSignature;
  detectedFamilies: TestFamily[];
  detectedTestConfidence: number;
  /** Etykieta wykrytego typu ruchu (POGO / CMJ / DROP_JUMP / SPRINT / …). */
  detectedTestType: string;
  contactCount: number;
  flightCount: number;
  detectedRepetitions: number;
  requiredRepetitions: number;
  protocolMatch: boolean;
  repetitionCountValid: boolean;
  errorCode: QualityIssueCode | null;
  reason: string;
}

const SIGNATURE_TO_TEST_LABEL: Record<MovementSignature, string> = {
  SINGLE_FLIGHT: "CMJ",
  DROP_REBOUND: "DROP_JUMP",
  REPEATED_CONTACTS: "POGO",
  LOCOMOTION: "SPRINT",
  TECHNIQUE: "TECHNIQUE",
  UNKNOWN: "UNKNOWN",
};

function horizontalRange(poses: FramePose[]): number {
  const xs = hipXSeries(poses).filter((v) => Number.isFinite(v));
  if (xs.length < 4) return 0;
  return Math.max(...xs) - Math.min(...xs);
}

// MediaPipe Pose landmark indices.
const HIP_LEFT = 23;
const HIP_RIGHT = 24;
const FOOT_INDICES = [27, 28, 31, 32];
const MIN_LANDMARK_VISIBILITY = 0.5;
const MIN_RELIABLE_FRAME_FRACTION = 0.4;

/**
 * Klatka jest wiarygodna dla klasyfikacji ruchu, jeżeli mamy landmark obu bioder
 * ORAZ co najmniej jednej stopy z widocznością >= progu. Bez bioder/stóp
 * silnik NIE ma prawa zwracać sygnatury innej niż UNKNOWN.
 */
function hasReliableHipsAndFeet(poses: FramePose[]): boolean {
  if (poses.length === 0) return false;
  let reliable = 0;
  for (const p of poses) {
    const lm = p.landmarks;
    if (!lm) continue;
    const hipL = lm[HIP_LEFT];
    const hipR = lm[HIP_RIGHT];
    if (!hipL || !hipR) continue;
    if (hipL.visibility < MIN_LANDMARK_VISIBILITY) continue;
    if (hipR.visibility < MIN_LANDMARK_VISIBILITY) continue;
    const footVisible = FOOT_INDICES.some(
      (i) => lm[i] && lm[i].visibility >= MIN_LANDMARK_VISIBILITY,
    );
    if (!footVisible) continue;
    reliable++;
  }
  return reliable / poses.length >= MIN_RELIABLE_FRAME_FRACTION;
}

/**
 * Deterministyczne rozpoznanie sygnatury ruchu. Łączy:
 *  - segmenty lotu z analyzeJumpField (najbardziej niezawodne dla serii),
 *  - liczbę kontaktów z podłożem,
 *  - detektor Drop Jump,
 *  - zakres poziomy bioder (lokomocja).
 *
 * Gate: bez wiarygodnych bioder i stóp zwracamy UNKNOWN — recognizer nie
 * może zgadywać ruchu na podstawie samego szumu MediaPipe.
 */
export function recognizeMovement(poses: FramePose[]): {
  signature: MovementSignature;
  confidence: number;
  contactCount: number;
  flightCount: number;
} {
  if (!hasReliableHipsAndFeet(poses)) {
    return { signature: "UNKNOWN", confidence: 0, contactCount: 0, flightCount: 0 };
  }
  const contacts = detectGroundContacts(poses);

  const flight = detectFlightPhase(poses);
  const dropJump = detectDropJumpPhases(poses);
  const field = analyzeJumpField(poses);
  const airSegments = field?.segments.length ?? 0;
  const hRange = horizontalRange(poses);

  if (dropJump) {
    return {
      signature: "DROP_REBOUND",
      confidence: dropJump.confidence,
      contactCount: Math.max(1, contacts.length),
      flightCount: 2,
    };
  }

  // REPEATED_CONTACTS: >=2 loty ALBO >=3 kontakty. Bardziej odporne niż sam
  // licznik kontaktów — w krótkim Pogo pierwszy/ostatni kontakt bywa ucięty.
  const repeatedSignal = Math.max(airSegments, contacts.length);
  if (airSegments >= 2 || contacts.length >= 3) {
    const conf = Math.min(1, 0.6 + repeatedSignal * 0.1);
    return {
      signature: "REPEATED_CONTACTS",
      confidence: conf,
      contactCount: contacts.length,
      flightCount: airSegments,
    };
  }

  if (!flight && hRange >= 0.25) {
    const conf = Math.min(1, hRange / 0.5);
    return { signature: "LOCOMOTION", confidence: conf, contactCount: contacts.length, flightCount: 0 };
  }

  if (flight) {
    return {
      signature: "SINGLE_FLIGHT",
      confidence: flight.confidence,
      contactCount: contacts.length,
      flightCount: 1,
    };
  }

  if (hRange >= 0.12) {
    return { signature: "LOCOMOTION", confidence: 0.4, contactCount: contacts.length, flightCount: 0 };
  }

  return { signature: "UNKNOWN", confidence: 0, contactCount: contacts.length, flightCount: 0 };
}

/**
 * Pełne rozpoznanie protokołu dla wybranego testu.
 *
 * HIERARCHIA BŁĘDÓW (kolejność ważności):
 *   1. Brak danych / sylwetki (UNKNOWN sygnatura) → EVENTS_NOT_DETECTED.
 *   2. Zła liczba powtórzeń → WRONG_REPETITION_COUNT (dla rodziny testu).
 *   3. Realna niezgodność testu → TEST_PROTOCOL_MISMATCH (tylko przy
 *      confidence >= 0.85 i jednoznacznie innej rodzinie ruchu).
 *
 * CMJ NIE jest fallbackiem. Jeżeli wybrany test to POGO i widać cokolwiek
 * przypominającego odbicia, zwracamy WRONG_REPETITION_COUNT z realną liczbą
 * wykrytych cykli, nie MISMATCH.
 */
export function recognizeTestProtocol(
  selectedTestType: TestType,
  poses: FramePose[],
): ProtocolRecognition {
  const protocol = getTestProtocol(selectedTestType);
  const selectedFamily = protocol.measurementFamily;
  const requiredRepetitions = protocol.expectedRepCountRange?.[0] ?? 1;

  if (selectedFamily === "TECHNIQUE") {
    return {
      selectedTestType,
      selectedFamily,
      detectedSignature: "TECHNIQUE",
      detectedFamilies: ["TECHNIQUE"],
      detectedTestConfidence: 1,
      detectedTestType: "TECHNIQUE",
      contactCount: 0,
      flightCount: 0,
      detectedRepetitions: 0,
      requiredRepetitions,
      protocolMatch: true,
      repetitionCountValid: true,
      errorCode: null,
      reason: "Test techniczny — ocena trenera, bez twardego dopasowania protokołu.",
    };
  }

  const { signature, confidence, contactCount, flightCount } = recognizeMovement(poses);
  const { cycles } = detectRepeatedCycles(poses);
  const singleFlight = detectFlightPhase(poses);
  const detectedFamilies = SIGNATURE_FAMILIES[signature];
  const familyMatch = detectedFamilies.includes(selectedFamily);
  const detectedTestType = SIGNATURE_TO_TEST_LABEL[signature];

  const detectedRepetitions =
    signature === "REPEATED_CONTACTS"
      ? Math.max(cycles.length, contactCount, flightCount)
      : signature === "UNKNOWN"
        ? 0
        : 1;

  const CONFIDENT_SIGNATURE = 0.85;
  const isSeriesProtocol = protocol.attemptProtocol.kind === "REPEATED_CONTACT_SERIES";

  // Rytm Pogo: >=3 pełne cykle z UDOKUMENTOWANYM krótkim kontaktem (<300 ms).
  // Wysoki próg (>=3, nie >=2) chroni CMJ przed fałszywym rozpoznaniem jako
  // Pogo w przypadku szumu landmarków wokół pojedynczego lądowania.
  const cyclesWithContact = cycles.filter(
    (c): c is (typeof cycles)[number] & { contactSeconds: number } =>
      typeof c.contactSeconds === "number" && c.contactSeconds > 0,
  );
  const avgContactSeconds =
    cyclesWithContact.length > 0
      ? cyclesWithContact.reduce((a, c) => a + c.contactSeconds, 0) / cyclesWithContact.length
      : Number.POSITIVE_INFINITY;
  const isPogoRhythm = cyclesWithContact.length >= 3 && avgContactSeconds < 0.3;

  // Dowód CMJ: pojedynczy dominujący lot z detectFlightPhase, ORAZ brak
  // dowodu wielocyklowego rytmu (żeby pogo z każdym cyklem jako "flight"
  // nie było klasyfikowane jako CMJ). "Dominujący" = przynajmniej 1 pełny
  // segment lotu i BRAK ≥3 cykli powtarzalnych.
  const hasCleanSingleFlight =
    !!singleFlight && singleFlight.confidence >= 0.5 && cyclesWithContact.length < 2;

  let repetitionCountValid = true;
  let errorCode: QualityIssueCode | null = null;
  let reason = "Protokół zgodny.";

  if (isSeriesProtocol) {
    // Test serii (Pogo / Repeated Jumps).
    if (signature === "UNKNOWN") {
      errorCode = "EVENTS_NOT_DETECTED";
      reason = "Nie wykryto sylwetki, stóp ani żadnego odbicia.";
      repetitionCountValid = false;
    } else if (signature === "LOCOMOTION" && confidence >= CONFIDENT_SIGNATURE) {
      errorCode = "TEST_PROTOCOL_MISMATCH";
      reason = `Wykryto ruch typu ${detectedTestType}, niezgodny z serią pionowych odbić (pewność ${confidence.toFixed(2)}).`;
    } else if (detectedRepetitions < requiredRepetitions) {
      // SINGLE_FLIGHT, REPEATED_CONTACTS z za małą liczbą, DROP_REBOUND —
      // wszystko traktowane jako niedostateczna liczba powtórzeń Pogo.
      repetitionCountValid = false;
      errorCode = "WRONG_REPETITION_COUNT";
      reason = `Wykryto ${detectedRepetitions} z wymaganych ${requiredRepetitions} odbić.`;
    }
  } else {
    // Test pojedynczej próby (CMJ, Broad Jump, Sprint, …).
    // Zasada: wybrany test to źródło prawdy. Recognizer NIE zamienia CMJ
    // na Pogo automatycznie. Odrzucamy dopiero przy jednoznacznym dowodzie
    // niezgodności (rytm Pogo bez wyraźnej pojedynczej fazy lotu).
    if (signature === "UNKNOWN") {
      // Bez wiarygodnych bioder/stóp nie mamy dowodu ani ZA, ani PRZECIW —
      // niech adapter zdecyduje na podstawie swoich własnych detektorów.
      reason = `Sygnatura ruchu niepewna (${signature}, pewność ${confidence.toFixed(2)}).`;
    } else if (
      selectedFamily === "VERTICAL_JUMP" &&
      signature === "REPEATED_CONTACTS"
    ) {
      if (hasCleanSingleFlight) {
        reason = `Wykryto dominującą pojedynczą fazę lotu (pewność ${singleFlight!.confidence.toFixed(2)}) — zgodne z protokołem ${selectedTestType.toUpperCase()}.`;
      } else if (isPogoRhythm) {
        // Jednoznaczny dowód rytmu Pogo: >=3 pełne cykle z krótkim
        // kontaktem i brak wyraźnej pojedynczej fazy lotu.
        errorCode = "TEST_PROTOCOL_MISMATCH";
        reason = `Nagranie nie spełnia protokołu ${selectedTestType.toUpperCase()}. Wykryto serię powtarzalnych odbić (${cyclesWithContact.length} cykli, średni kontakt ${(avgContactSeconds * 1000).toFixed(0)} ms).`;
      } else {
        // Szum landmarków wygenerował "kontakty" wokół pojedynczego CMJ.
        reason = "Kontakty z długimi przerwami — traktowane jako pojedyncza próba CMJ.";
      }
    } else if (!familyMatch) {
      if (confidence < CONFIDENT_SIGNATURE) {
        reason = `Sygnatura ruchu niepewna (${signature}, pewność ${confidence.toFixed(2)}).`;
      } else {
        errorCode = "TEST_PROTOCOL_MISMATCH";
        reason = `Wykryto ruch typu ${detectedTestType}, niezgodny z rodziną ${selectedFamily} (pewność ${confidence.toFixed(2)}).`;
      }
    } else if (
      signature === "REPEATED_CONTACTS" &&
      contactCount >= 3 &&
      isPogoRhythm &&
      !hasCleanSingleFlight
    ) {
      repetitionCountValid = false;
      errorCode = "WRONG_REPETITION_COUNT";
      reason = `Test pojedynczej próby zawiera ${contactCount} rytmicznych kontaktów — nagraj jedno powtórzenie.`;
    }
  }

  const protocolMatch = errorCode == null;

  return {
    selectedTestType,
    selectedFamily,
    detectedSignature: signature,
    detectedFamilies,
    detectedTestConfidence: Number(confidence.toFixed(2)),
    detectedTestType,
    contactCount,
    flightCount,
    detectedRepetitions,
    requiredRepetitions,
    protocolMatch,
    repetitionCountValid,
    errorCode: protocolMatch ? null : errorCode,
    reason,
  };
}

export { SIGNATURE_FAMILIES };
export type { MeasurementFamily };
