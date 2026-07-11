/**
 * TestProtocolRecognizer — wykrywa rodzaj ruchu z pozy i porównuje z wybranym
 * testem, ZANIM uruchomi się adapter.
 *
 * Pipeline gwarantowany:
 *   selectedTestType → detectedTestType → detectedTestConfidence
 *   → protocolMatch → (dopiero teraz) adapter.
 *
 * Rozpoznanie działa na poziomie "sygnatury ruchu" (nie zgaduje 20 vs 30 m —
 * tego nie da się odczytać z filmu bez kalibracji). Sygnatura mapuje na
 * zbiór zgodnych rodzin pomiarowych. protocolMatch = rodzina wybranego testu
 * należy do rodzin dozwolonych dla wykrytej sygnatury ORAZ liczba prób/serii
 * jest zgodna z protokołem (inaczej WRONG_REPETITION_COUNT).
 *
 * Determinizm: rozpoznanie korzysta wyłącznie z deterministycznej matematyki
 * pozy — ten sam plik zawsze daje identyczny wynik.
 */

import type { FramePose, QualityIssueCode } from "./types";
import type { TestType } from "./types";
import type { MeasurementFamily, TestFamily } from "./testProtocols";
import { getTestProtocol } from "./testProtocols";
import { detectFlightPhase, detectGroundContacts, detectDropJumpPhases } from "./analyzers/jumpDetection";
import { hipXSeries } from "./poseSeries";

export type MovementSignature =
  | "SINGLE_FLIGHT" // jeden wyraźny lot (CMJ / Squat Jump / Broad Jump)
  | "DROP_REBOUND" // zejście ze skrzyni + odbicie (Drop Jump)
  | "REPEATED_CONTACTS" // seria odbić (Pogo / Repeated Jumps)
  | "LOCOMOTION" // bieg / zmiana kierunku / hamowanie po podłożu
  | "TECHNIQUE" // ruch techniczny (siłownia) — brak twardego gate
  | "UNKNOWN";

/** Rodziny pomiaru zgodne z daną sygnaturą ruchu. */
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
  contactCount: number;
  flightCount: number;
  protocolMatch: boolean;
  repetitionCountValid: boolean;
  /** Kod błędu blokujący adapter (null gdy protocolMatch). */
  errorCode: QualityIssueCode | null;
  reason: string;
}

/** Zakres poziomej trajektorii bioder (0-1) — do wykrycia lokomocji. */
function horizontalRange(poses: FramePose[]): number {
  const xs = hipXSeries(poses).filter((v) => Number.isFinite(v));
  if (xs.length < 4) return 0;
  return Math.max(...xs) - Math.min(...xs);
}

/** Deterministyczne rozpoznanie sygnatury ruchu z pozy. */
export function recognizeMovement(poses: FramePose[]): {
  signature: MovementSignature;
  confidence: number;
  contactCount: number;
  flightCount: number;
} {
  const contacts = detectGroundContacts(poses);
  const flight = detectFlightPhase(poses);
  const dropJump = detectDropJumpPhases(poses);
  const hRange = horizontalRange(poses);

  // Drop Jump: zejście ze skrzyni + odbicie (dwa loty, pierwszy od granicy kadru).
  if (dropJump) {
    return {
      signature: "DROP_REBOUND",
      confidence: dropJump.confidence,
      contactCount: Math.max(1, contacts.length),
      flightCount: 2,
    };
  }

  // Seria reaktywnych kontaktów: co najmniej 3 kontakty i brak jednego,
  // dominującego, długiego lotu (CMJ ma jeden długi lot, nie serię).
  if (contacts.length >= 3) {
    const conf = Math.min(1, contacts.length / 5);
    return { signature: "REPEATED_CONTACTS", confidence: conf, contactCount: contacts.length, flightCount: 1 };
  }

  // Lokomocja pozioma: duże przemieszczenie bioder w poziomie bez wyraźnego lotu.
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

  // Bieg z liniami bywa widziany z przodu (5-10-5) — mały zakres poziomy,
  // ale realny ruch. Traktujemy jako lokomocję o niskiej pewności.
  if (hRange >= 0.12) {
    return { signature: "LOCOMOTION", confidence: 0.4, contactCount: contacts.length, flightCount: 0 };
  }

  return { signature: "UNKNOWN", confidence: 0, contactCount: contacts.length, flightCount: 0 };
}

/**
 * Pełne rozpoznanie protokołu dla wybranego testu.
 * Gate: adapter może ruszyć wyłącznie przy protocolMatch === true.
 */
export function recognizeTestProtocol(
  selectedTestType: TestType,
  poses: FramePose[],
): ProtocolRecognition {
  const protocol = getTestProtocol(selectedTestType);
  const selectedFamily = protocol.measurementFamily;

  // Testy techniczne (siłownia) nie mają twardego gate — ocenia trener.
  if (selectedFamily === "TECHNIQUE") {
    return {
      selectedTestType,
      selectedFamily,
      detectedSignature: "TECHNIQUE",
      detectedFamilies: ["TECHNIQUE"],
      detectedTestConfidence: 1,
      contactCount: 0,
      flightCount: 0,
      protocolMatch: true,
      repetitionCountValid: true,
      errorCode: null,
      reason: "Test techniczny — ocena trenera, bez twardego dopasowania protokołu.",
    };
  }

  const { signature, confidence, contactCount, flightCount } = recognizeMovement(poses);
  const detectedFamilies = SIGNATURE_FAMILIES[signature];
  const familyMatch = detectedFamilies.includes(selectedFamily);

  // Kontrola liczby prób/powtórzeń: jeden film = jedna próba lub jedna seria.
  const bilateralOrMax = protocol.attemptProtocol.kind !== "REPEATED_CONTACT_SERIES";
  let repetitionCountValid = true;
  let errorCode: QualityIssueCode | null = null;
  let reason = "Protokół zgodny.";

  if (!familyMatch) {
    // Wyraźna sygnatura sprzeczna z rodziną → mismatch protokołu.
    errorCode = "TEST_PROTOCOL_MISMATCH";
    reason = `Wykryto ruch typu ${signature}, niezgodny z rodziną ${selectedFamily}.`;
  } else if (bilateralOrMax && signature === "SINGLE_FLIGHT" && contactCount >= 3) {
    // Test pojedynczej próby, ale film zawiera serię odbić.
    repetitionCountValid = false;
    errorCode = "WRONG_REPETITION_COUNT";
    reason = "Test pojedynczej próby zawiera serię powtórzeń.";
  } else if (
    protocol.attemptProtocol.kind === "REPEATED_CONTACT_SERIES" &&
    flightCount <= 1 &&
    contactCount < 3
  ) {
    // Test serii, ale film pokazuje pojedyncze odbicie.
    repetitionCountValid = false;
    errorCode = "WRONG_REPETITION_COUNT";
    reason = "Test serii wymaga jednej pełnej serii odbić.";
  }

  const protocolMatch = familyMatch && repetitionCountValid;

  return {
    selectedTestType,
    selectedFamily,
    detectedSignature: signature,
    detectedFamilies,
    detectedTestConfidence: Number(confidence.toFixed(2)),
    contactCount,
    flightCount,
    protocolMatch,
    repetitionCountValid,
    errorCode: protocolMatch ? null : errorCode,
    reason,
  };
}

export { SIGNATURE_FAMILIES };
export type { MeasurementFamily };
