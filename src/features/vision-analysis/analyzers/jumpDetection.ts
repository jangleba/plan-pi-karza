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
  const field = analyzeJumpField(poses);
  if (!field) return null;
  const { foot, hip, time: t, groundLevel, amplitude, airThreshold } = field;

  // Artefakty landmarków bywają krótkie i mają absurdalnie dużą amplitudę.
  // Prawdziwy lot musi być ograniczony kontaktem, trwać 0.10–1.10 s i mieć
  // zgodny ruch środka bioder. Wybieramy najlepiej udokumentowany segment,
  // a nie po prostu najdłuższy spadek współrzędnej stopy.
  const candidates = field.segments
    .filter((segment) => !segment.startsAtBoundary && !segment.endsAtBoundary)
    .map((segment) => {
      const duration = segment.landingTime - segment.takeoffTime;
      const preStart = Math.max(0, segment.takeoffFrame - 6);
      const preHip = meanFinite(hip.slice(preStart, segment.takeoffFrame));
      const airHip = hip
        .slice(segment.takeoffFrame, segment.landingFrame)
        .filter((value) => Number.isFinite(value));
      const hasHipEvidence = airHip.length >= 2 && Number.isFinite(preHip);
      const hipLift = hasHipEvidence ? preHip - Math.min(...airHip) : 0;
      const detectedFraction =
        foot
          .slice(segment.takeoffFrame, segment.landingFrame + 1)
          .filter((value) => Number.isFinite(value)).length /
        Math.max(1, segment.landingFrame - segment.takeoffFrame + 1);
      const durationScore = Math.min(1, duration / 0.35);
      const liftScore = Math.min(1, Math.max(0, hipLift) / 0.06);
      return {
        segment,
        duration,
        hipLift,
        hasHipEvidence,
        detectedFraction,
        score: 0.45 * detectedFraction + 0.3 * liftScore + 0.25 * durationScore,
      };
    })
    .filter((candidate) => {
      if (candidate.duration < 0.1 || candidate.duration > 1.1) return false;
      // Przy dostępnych biodrach wymagamy ich ruchu w górę. Jeżeli biodra
      // chwilowo zniknęły, nie zmyślamy zgodności, ale nadal pozwalamy stopom
      // udokumentować lot z niższą pewnością.
      return !candidate.hasHipEvidence || candidate.hipLift >= 0.008;
    })
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  const { segment } = best;

  // Najniższa pozycja bioder w maks. 1.5 s poprzedzających wybicie.
  let lowWindowStart = segment.takeoffFrame;
  while (lowWindowStart > 0 && segment.takeoffTime - t[lowWindowStart - 1] <= 1.5) {
    lowWindowStart--;
  }
  const localLowest = argMax(hip.slice(lowWindowStart, segment.takeoffFrame + 1));
  const lowestHipFrame = localLowest < 0 ? segment.takeoffFrame : lowWindowStart + localLowest;

  const ampScore = Math.min(1, amplitude / 0.08);
  const confidence = Math.max(
    0,
    Math.min(1, 0.45 * best.detectedFraction + 0.3 * ampScore + 0.25 * Math.min(1, best.hipLift / 0.05)),
  );

  return {
    takeoffFrame: segment.takeoffFrame,
    landingFrame: segment.landingFrame,
    takeoffTime: segment.takeoffTime,
    landingTime: segment.landingTime,
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

  // Odporna linia podłoża: mediana górnych 30% wartości Y zamiast maksimum.
  // Pojedynczy błędny landmark przy dolnej krawędzi nie przesuwa więc całej
  // detekcji. Amplitudę także liczymy z kwantyla, nie z jednego minimum.
  const ordered = [...finite].sort((a, b) => a - b);
  const quantile = (q: number) => {
    const pos = Math.max(0, Math.min(ordered.length - 1, (ordered.length - 1) * q));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const weight = pos - lo;
    return ordered[lo] * (1 - weight) + ordered[hi] * weight;
  };
  const contactCut = quantile(0.7);
  const groundLevel = meanFinite(ordered.filter((value) => value >= contactCut));
  const airborneLevel = quantile(0.08);
  const amplitude = groundLevel - airborneLevel;
  if (amplitude < 0.025) return null;
  // Próg blisko podłoża lepiej przybliża faktyczne oderwanie i kontakt niż
  // 40% amplitudy, które systematycznie skracało czas lotu.
  const groundNoiseMargin = Math.max(0.01, Math.min(0.035, amplitude * 0.12));
  const airThreshold = groundLevel - groundNoiseMargin;
  const footDetectionRate = finite.length / foot.length;

  const segments: AirSegment[] = [];
  const airMask = foot.map((value) => Number.isFinite(value) && value < airThreshold);
  // Domykamy pojedynczą lukę detekcji wewnątrz lotu; dłuższych luk nie
  // interpolujemy, bo oznaczałoby to wymyślanie kontaktu/lotu.
  for (let i = 1; i < airMask.length - 1; i++) {
    if (!airMask[i] && airMask[i - 1] && airMask[i + 1]) airMask[i] = true;
  }
  let curStart = -1;
  for (let i = 0; i < foot.length; i++) {
    const airborne = airMask[i];
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
