import type { FramePose, DetectedEvent } from "../types";
import { footBottomSeries, hipYSeries, timeSeries } from "../poseSeries";
import {
  movingAverage,
  interpolateShortGaps,
  argMin,
  argMax,
  meanFinite,
} from "../signal";
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

export { argMin };
