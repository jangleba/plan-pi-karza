import type { FramePose, DetectedEvent } from "../types";
import { footBottomSeries, hipYSeries, timeSeries } from "../poseSeries";
import { movingAverage, interpolateShortGaps, argMin, argMax, meanFinite } from "../signal";
import { interpolateCrossingTime } from "../physics";

export interface FlightPhase {
  takeoffFrame: number;
  landingFrame: number;
  takeoffTime: number;
  landingTime: number;
  lowestHipFrame: number;
  groundLevel: number;
  confidence: number;
}

/**
 * Wykrywa fazę lotu z trajektorii stóp. Zwraca null, gdy brak wyraźnego lotu.
 * Detekcja łączy pozycję stóp (odległość od linii podłoża) z ich prędkością
 * pionową — nie opiera się wyłącznie na ruchu bioder.
 */
export function detectFlightPhase(poses: FramePose[]): FlightPhase | null {
  const t = timeSeries(poses);
  let foot = interpolateShortGaps(footBottomSeries(poses));
  foot = movingAverage(foot, 3);
  const hip = movingAverage(interpolateShortGaps(hipYSeries(poses)), 3);

  const finite = foot.filter((v) => Number.isFinite(v));
  if (finite.length < 6) return null;

  // Linia podłoża = najniższa (największe Y) stabilna pozycja stóp.
  const sorted = [...finite].sort((a, b) => b - a);
  const groundLevel = meanFinite(sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.15))));

  // Amplituda ruchu stóp — próg lotu jako ułamek zakresu.
  const minFoot = Math.min(...finite);
  const amplitude = groundLevel - minFoot;
  if (amplitude < 0.02) return null; // brak istotnego wyskoku
  const airThreshold = groundLevel - amplitude * 0.4;

  // Największy ciągły segment "w powietrzu".
  let bestStart = -1;
  let bestEnd = -1;
  let curStart = -1;
  for (let i = 0; i < foot.length; i++) {
    const airborne = Number.isFinite(foot[i]) && foot[i] < airThreshold;
    if (airborne && curStart === -1) curStart = i;
    if ((!airborne || i === foot.length - 1) && curStart !== -1) {
      const end = airborne ? i : i - 1;
      if (bestStart === -1 || end - curStart > bestEnd - bestStart) {
        bestStart = curStart;
        bestEnd = end;
      }
      curStart = -1;
    }
  }
  if (bestStart <= 0 || bestEnd >= foot.length - 1 || bestEnd <= bestStart) return null;

  // Interpolowane czasy przekroczenia progu lotu (dokładniejsze niż numer klatki).
  const takeoffTime = interpolateCrossingTime(
    t[bestStart - 1],
    foot[bestStart - 1],
    t[bestStart],
    foot[bestStart],
    airThreshold,
  );
  const landingTime = interpolateCrossingTime(
    t[bestEnd],
    foot[bestEnd],
    t[bestEnd + 1],
    foot[bestEnd + 1],
    airThreshold,
  );

  // Najniższa pozycja bioder przed wybiciem (countermovement depth).
  const lowestHipFrame = argMax(hip.slice(0, bestStart + 1)); // max Y = najniżej

  // Confidence: udział wykrytych stóp w segmencie + wyrazistość amplitudy.
  const segDetected =
    foot.slice(bestStart, bestEnd + 1).filter((v) => Number.isFinite(v)).length /
    (bestEnd - bestStart + 1);
  const ampScore = Math.min(1, amplitude / 0.1);
  const confidence = Math.max(0, Math.min(1, 0.5 * segDetected + 0.5 * ampScore));

  return {
    takeoffFrame: bestStart,
    landingFrame: bestEnd + 1,
    takeoffTime,
    landingTime,
    lowestHipFrame: lowestHipFrame < 0 ? 0 : lowestHipFrame,
    groundLevel,
    confidence,
  };
}

/** Zamienia FlightPhase na standardowe zdarzenia. */
export function flightPhaseEvents(phase: FlightPhase, poses: FramePose[]): DetectedEvent[] {
  const t = timeSeries(poses);
  return [
    {
      type: "lowest_position",
      frameIndex: phase.lowestHipFrame,
      timestampSeconds: t[phase.lowestHipFrame] ?? 0,
      confidence: phase.confidence,
    },
    {
      type: "takeoff",
      frameIndex: phase.takeoffFrame,
      timestampSeconds: phase.takeoffTime,
      confidence: phase.confidence,
    },
    {
      type: "landing",
      frameIndex: phase.landingFrame,
      timestampSeconds: phase.landingTime,
      confidence: phase.confidence,
    },
  ];
}

/** Wykrywa serię kontaktów z podłożem (do Pogo). */
export function detectGroundContacts(poses: FramePose[]): DetectedEvent[] {
  const t = timeSeries(poses);
  let foot = interpolateShortGaps(footBottomSeries(poses));
  foot = movingAverage(foot, 3);
  const finite = foot.filter((v) => Number.isFinite(v));
  if (finite.length < 8) return [];
  const groundLevel = Math.max(...finite);
  const minFoot = Math.min(...finite);
  const amplitude = groundLevel - minFoot;
  if (amplitude < 0.015) return [];
  const contactThreshold = groundLevel - amplitude * 0.25;

  const events: DetectedEvent[] = [];
  let inContact = false;
  for (let i = 0; i < foot.length; i++) {
    const contact = Number.isFinite(foot[i]) && foot[i] >= contactThreshold;
    if (contact && !inContact) {
      events.push({
        type: "ground_contact",
        frameIndex: i,
        timestampSeconds: t[i] ?? 0,
        confidence: Math.min(1, amplitude / 0.08),
      });
      inContact = true;
    } else if (!contact) {
      inContact = false;
    }
  }
  return events;
}

/**
 * =====================================================================
 * WSPÓLNY SILNIK FAZ SKOKU (VERTICAL_JUMP + REACTIVE_CONTACT).
 *
 * Klatki analizowane są sekwencyjnie wg czasu (timeSeries pochodzi z
 * sourceTimestampUs). Cała matematyka jest czysta i deterministyczna —
 * ten sam plik zawsze daje identyczne segmenty, timestampy i wyniki.
 *
 * WAŻNE: to NIE jest jeden algorytm dla wszystkich skoków. Silnik dostarcza
 * wyłącznie surowe segmenty lotu/kontaktu; każdy analizator (CMJ, Squat Jump,
 * Drop Jump, Pogo, Repeated Jumps) interpretuje je według SWOJEGO protokołu.
 * =====================================================================
 */

/** Pojedynczy segment lotu wykryty z trajektorii stóp. */
export interface AirSegment {
  /** Pierwsza klatka w powietrzu (wybicie). */
  takeoffFrame: number;
  /** Pierwsza klatka po lądowaniu. */
  landingFrame: number;
  takeoffTime: number;
  landingTime: number;
  /** Segment zaczyna się na granicy nagrania / bez poprzedzającego kontaktu (np. zejście ze skrzyni). */
  startsAtBoundary: boolean;
  /** Segment kończy się na granicy nagrania / bez następującego kontaktu. */
  endsAtBoundary: boolean;
}

export interface JumpField {
  foot: number[];
  hip: number[];
  time: number[];
  groundLevel: number;
  amplitude: number;
  airThreshold: number;
  footDetectionRate: number;
  segments: AirSegment[];
}

/**
 * Wspólna analiza pola skoku: linia podłoża, próg lotu i wszystkie segmenty
 * "w powietrzu". Zwraca null, gdy brak istotnego ruchu pionowego.
 */
export function analyzeJumpField(poses: FramePose[]): JumpField | null {
  const t = timeSeries(poses);
  let foot = interpolateShortGaps(footBottomSeries(poses));
  foot = movingAverage(foot, 3);
  const hip = movingAverage(interpolateShortGaps(hipYSeries(poses)), 3);

  const finite = foot.filter((v) => Number.isFinite(v));
  if (finite.length < 6) return null;

  const sorted = [...finite].sort((a, b) => b - a);
  const groundLevel = meanFinite(sorted.slice(0, Math.max(3, Math.floor(sorted.length * 0.15))));
  const minFoot = Math.min(...finite);
  const amplitude = groundLevel - minFoot;
  if (amplitude < 0.02) return null;
  const airThreshold = groundLevel - amplitude * 0.4;
  const footDetectionRate = finite.length / foot.length;

  const segments: AirSegment[] = [];
  let curStart = -1;
  for (let i = 0; i < foot.length; i++) {
    const airborne = Number.isFinite(foot[i]) && foot[i] < airThreshold;
    if (airborne && curStart === -1) curStart = i;
    if ((!airborne || i === foot.length - 1) && curStart !== -1) {
      const end = airborne ? i : i - 1;
      if (end >= curStart) segments.push(buildAirSegment(curStart, end, foot, t, airThreshold));
      curStart = -1;
    }
  }

  return { foot, hip, time: t, groundLevel, amplitude, airThreshold, footDetectionRate, segments };
}

function buildAirSegment(
  start: number,
  end: number,
  foot: number[],
  t: number[],
  threshold: number,
): AirSegment {
  const startsAtBoundary = start <= 0 || !Number.isFinite(foot[start - 1]);
  const endsAtBoundary = end >= foot.length - 1 || !Number.isFinite(foot[end + 1]);
  const takeoffTime = startsAtBoundary
    ? t[start]
    : interpolateCrossingTime(t[start - 1], foot[start - 1], t[start], foot[start], threshold);
  const landingTime = endsAtBoundary
    ? t[end]
    : interpolateCrossingTime(t[end], foot[end], t[end + 1], foot[end + 1], threshold);
  return {
    takeoffFrame: start,
    landingFrame: Math.min(foot.length - 1, end + 1),
    takeoffTime,
    landingTime,
    startsAtBoundary,
    endsAtBoundary,
  };
}

/**
 * Wykrycie countermovement (dynamicznego zejścia) tuż przed wybiciem.
 * CMJ MA wyraźny dip bioder w oknie ~0.35 s przed wybiciem; Squat Jump — nie.
 */
export function detectCountermovement(
  poses: FramePose[],
  takeoffFrame: number,
): { present: boolean; depth: number } {
  const t = timeSeries(poses);
  const hip = movingAverage(interpolateShortGaps(hipYSeries(poses)), 3);
  if (takeoffFrame <= 0 || takeoffFrame >= hip.length) return { present: false, depth: 0 };
  const takeoffTime = t[takeoffFrame];
  let startIdx = takeoffFrame;
  while (startIdx > 0 && takeoffTime - t[startIdx - 1] < 0.35) startIdx--;
  const baseline = hip[startIdx];
  let maxHip = baseline; // większe Y = niżej (głębsze zejście)
  for (let i = startIdx; i <= takeoffFrame && i < hip.length; i++) {
    if (Number.isFinite(hip[i]) && hip[i] > maxHip) maxHip = hip[i];
  }
  const depth = maxHip - baseline;
  return { present: depth > 0.025, depth: Math.max(0, depth) };
}

/**
 * Fazy Drop Jump: zejście ze skrzyni (pierwszy segment od granicy kadru),
 * pierwszy kontakt, wybicie, drugi lot, końcowe lądowanie. Zwraca null, gdy
 * nagranie nie zawiera zejścia ze skrzyni + odbicia (np. zwykły skok bez skrzyni).
 */
export interface DropJumpPhases {
  boxDescentLandingTime: number; // pierwszy kontakt z podłożem
  reboundTakeoffTime: number;
  reboundLandingTime: number;
  contactFrame: number;
  takeoffFrame: number;
  landingFrame: number;
  groundContactSeconds: number;
  flightSeconds: number;
  confidence: number;
}

export function detectDropJumpPhases(poses: FramePose[]): DropJumpPhases | null {
  const field = analyzeJumpField(poses);
  if (!field) return null;
  // Dokładnie dwa loty: zejście ze skrzyni (od granicy) + odbicie (ograniczone kontaktem).
  if (field.segments.length !== 2) return null;
  const [fall, rebound] = field.segments;
  if (!fall.startsAtBoundary) return null; // brak skrzyni → to nie Drop Jump
  if (rebound.startsAtBoundary) return null;

  const groundContactSeconds = rebound.takeoffTime - fall.landingTime;
  const flightSeconds = rebound.landingTime - rebound.takeoffTime;
  if (groundContactSeconds <= 0 || flightSeconds <= 0) return null;

  const segDetected =
    field.foot
      .slice(rebound.takeoffFrame, rebound.landingFrame + 1)
      .filter((v) => Number.isFinite(v)).length /
    Math.max(1, rebound.landingFrame - rebound.takeoffFrame + 1);
  const confidence = Math.max(0, Math.min(1, 0.5 * segDetected + 0.5 * Math.min(1, field.amplitude / 0.1)));

  return {
    boxDescentLandingTime: fall.landingTime,
    reboundTakeoffTime: rebound.takeoffTime,
    reboundLandingTime: rebound.landingTime,
    contactFrame: fall.landingFrame,
    takeoffFrame: rebound.takeoffFrame,
    landingFrame: rebound.landingFrame,
    groundContactSeconds,
    flightSeconds,
    confidence,
  };
}

/**
 * Cykle Repeated Jumps: pełne loty ograniczone kontaktem z obu stron.
 * Niepełny pierwszy i ostatni cykl (dotykające granicy kadru) są odrzucane.
 */
export interface RepeatedCycle {
  index: number;
  takeoffTime: number;
  landingTime: number;
  flightSeconds: number;
  contactSeconds: number | null;
  confidence: number;
}

export function detectRepeatedCycles(poses: FramePose[]): {
  totalFlights: number;
  cycles: RepeatedCycle[];
} {
  const field = analyzeJumpField(poses);
  if (!field) return { totalFlights: 0, cycles: [] };
  const flights = field.segments;
  // Pełne loty = ograniczone kontaktem z obu stron (odrzucamy niepełny 1. i ostatni).
  const complete = flights.filter((s) => !s.startsAtBoundary && !s.endsAtBoundary);
  const cycles: RepeatedCycle[] = complete.map((s, i) => {
    const prev = complete[i - 1];
    const contactSeconds = prev ? s.takeoffTime - prev.landingTime : null;
    const segDetected =
      field.foot.slice(s.takeoffFrame, s.landingFrame + 1).filter((v) => Number.isFinite(v)).length /
      Math.max(1, s.landingFrame - s.takeoffFrame + 1);
    return {
      index: i,
      takeoffTime: s.takeoffTime,
      landingTime: s.landingTime,
      flightSeconds: s.landingTime - s.takeoffTime,
      contactSeconds: contactSeconds != null && contactSeconds > 0 ? contactSeconds : null,
      confidence: Math.max(0, Math.min(1, segDetected)),
    };
  });
  return { totalFlights: flights.length, cycles };
}

export { argMin };
