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

/**
 * Deterministyczne rozpoznanie sygnatury ruchu. Łączy:
 *  - segmenty lotu z analyzeJumpField (najbardziej niezawodne dla serii),
 *  - liczbę kontaktów z podłożem,
 *  - detektor Drop Jump,
 *  - zakres poziomy bioder (lokomocja).
 */
export function recognizeMovement(poses: FramePose[]): {
  signature: MovementSignature;
  confidence: number;
  contactCount: number;
  flightCount: number;
} {
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
    if (!familyMatch) {
      if (signature === "UNKNOWN" || confidence < CONFIDENT_SIGNATURE) {
        reason = `Sygnatura ruchu niepewna (${signature}, pewność ${confidence.toFixed(2)}).`;
      } else {
        errorCode = "TEST_PROTOCOL_MISMATCH";
        reason = `Wykryto ruch typu ${detectedTestType}, niezgodny z rodziną ${selectedFamily} (pewność ${confidence.toFixed(2)}).`;
      }
    } else if (signature === "REPEATED_CONTACTS" && contactCount >= 3) {
      repetitionCountValid = false;
      errorCode = "WRONG_REPETITION_COUNT";
      reason = `Test pojedynczej próby zawiera ${contactCount} kontaktów — nagraj jedno powtórzenie.`;
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
