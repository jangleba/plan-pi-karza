/**
 * CodEngine — wspólny, deterministyczny silnik testów zmiany kierunku (COD).
 *
 * Podłącza adaptery COD do:
 *  - TimingLineRegistry (linie/strefy z rolami CENTER/TURN_LINE/TURN_LEFT/TURN_RIGHT/TIMING_A),
 *  - płaszczyzny pomiaru czasu (Timing Plane) z calibratedLineCrossing,
 *  - CrossingUncertaintyCalculator (niepewność z realnych sourceTimestampUs).
 *
 * ZASADA GEOMETRYCZNA (niezmienna):
 *  - TUŁÓW służy WYŁĄCZNIE do pomiaru przecięć płaszczyzny czasowej (stały punkt
 *    referencyjny w pikselach; NIGDY nie rzutowany przez homografię podłoża).
 *  - STOPA (rzutowana przez homografię, bo leży na podłożu) służy do:
 *      • potwierdzenia dotarcia do linii/strefy zwrotu,
 *      • kontaktu nogi zwrotnej (strona zwrotu),
 *      • poprawności strefy.
 *
 * ZWYKŁY SPRINT BEZ ZWROTU NIE MOŻE PRZEJŚĆ JAKO COD — brak powrotnego
 * przecięcia tej samej płaszczyzny → TURN_NOT_DETECTED.
 *
 * DETERMINIZM: ten sam film + ta sama kalibracja + ten sam protokół → identyczne
 * klatki, timestampy i wynik (10/10).
 */

import type { FramePose, TimingLineSpec, TimingLineRole } from "./types";
import { POSE } from "./types";
import type { Homography } from "./calibrationProfiles";
import { invert3x3, applyInverse } from "./homographyGeometry";
import { round } from "./physics";
import { TimingLineRegistry } from "./timingPlane";
import {
  frameSourceTimestampUs,
  torsoReferencePixel,
  medianIntervalUs,
  projectGroundLineU,
  MAX_CROSSING_UNCERTAINTY_MS,
} from "./calibratedLineCrossing";

export type CodErrorCode =
  | "TIMING_LINES_REQUIRED"
  | "TIMING_PLANE_CALIBRATION_FAILED"
  | "TURN_NOT_DETECTED"
  | "TURN_LINE_NOT_REACHED"
  | "WRONG_LINE_SEQUENCE"
  | "WRONG_CROSSING_DIRECTION"
  | "WRONG_TURNING_SIDE"
  | "CROSSING_UNCERTAINTY_TOO_HIGH"
  | "CALIBRATION_CAMERA_MOVED";

export type CodResultQuality = "OFFICIAL" | "ESTIMATED" | "REJECTED";
export type TurningSide = "left" | "right";

/** Próg niepewności dla wyniku OFFICIAL (ms). */
const OFFICIAL_UNCERTAINTY_MS = 6;
/** Tolerancja dotarcia stopy do linii/strefy zwrotu (mm). */
const TURN_REACH_TOLERANCE_MM = 400;

const Y_SPAN = { min: 0, max: 3000 };

export interface CodInput {
  poses: FramePose[];
  homography: Homography | null;
  registry: TimingLineRegistry;
  width: number;
  height: number;
  cameraStable?: boolean | null;
  /** Oczekiwana noga zwrotna (dla 505 bilateralnego). */
  expectedTurningSide?: TurningSide | null;
}

/** Pojedyncze przecięcie płaszczyzny czasowej przez punkt tułowia. */
export interface PlaneCrossing {
  lineId: string;
  role: TimingLineRole | null;
  frameBeforeIndex: number;
  frameAfterIndex: number;
  timestampBeforeUs: number;
  timestampAfterUs: number;
  crossingTimestampUs: number;
  interpolationFraction: number;
  direction: "forward" | "backward";
  crossingUncertaintyMs: number;
}

export interface CodDebugRow {
  role: TimingLineRole | null;
  lineId: string;
  event: string;
  timestampUs: number;
  detail?: string;
}

export interface CodSuccess {
  ok: true;
  resultQuality: Exclude<CodResultQuality, "REJECTED">;
  totalTimeS: number;
  firstCrossingTimestampUs: number;
  secondCrossingTimestampUs: number;
  crossings: PlaneCrossing[];
  turningSide: TurningSide | null;
  elapsedUncertaintyMs: number;
  debug: CodDebugRow[];
}

export interface CodFailure {
  ok: false;
  resultQuality: "REJECTED";
  code: CodErrorCode;
  debug: CodDebugRow[];
}

export type CodResult = CodSuccess | CodFailure;

// ---------------------------------------------------------------------------
// Prymitywy geometryczne
// ---------------------------------------------------------------------------

function fail(code: CodErrorCode, debug: CodDebugRow[]): CodFailure {
  return { ok: false, resultQuality: "REJECTED", code, debug };
}

/** Sprawdza wspólne warunki brzegowe kalibracji. Zwraca kod błędu lub null. */
function calibrationGate(input: CodInput): CodErrorCode | null {
  if (input.cameraStable === false) return "CALIBRATION_CAMERA_MOVED";
  if (!input.homography) return "TIMING_LINES_REQUIRED";
  if (!invert3x3(input.homography)) return "TIMING_PLANE_CALIBRATION_FAILED";
  const inv = invert3x3(input.homography)!;
  if (!applyInverse(inv, input.width / 2, input.height / 2)) {
    return "TIMING_PLANE_CALIBRATION_FAILED";
  }
  return null;
}

/** Środek linii/strefy w świecie (mm) — z punktów podłoża lub worldXmm. */
function lineWorldX(line: TimingLineSpec): number | null {
  if (line.groundStartPointMm && line.groundEndPointMm) {
    return (line.groundStartPointMm.x + line.groundEndPointMm.x) / 2;
  }
  return typeof line.worldXmm === "number" ? line.worldXmm : null;
}

/**
 * WSZYSTKIE przecięcia płaszczyzny czasowej przez stały punkt tułowia
 * (nie tylko pierwsze). Kolejne przecięcia mają naprzemienne kierunki.
 */
function allTorsoCrossings(
  input: CodInput,
  line: TimingLineSpec,
): PlaneCrossing[] {
  const H = input.homography!;
  const lineU = projectGroundLineU(H, line, Y_SPAN);
  if (!lineU) return [];
  const frameIntervalUs = medianIntervalUs(input.poses);
  const crossingUncertaintyMs = round(frameIntervalUs / 2 / 1000, 3);
  const out: PlaneCrossing[] = [];
  let prev: { idx: number; signed: number; ts: number } | null = null;

  for (let i = 0; i < input.poses.length; i++) {
    const p = input.poses[i];
    const ts = frameSourceTimestampUs(p);
    const torso = torsoReferencePixel(p, input.width, input.height);
    if (ts == null || !torso) continue;
    const lu = lineU(torso.v);
    if (!Number.isFinite(lu)) continue;
    const signed = torso.u - lu;

    if (prev && Number.isFinite(prev.signed)) {
      const crossed = prev.signed < 0 !== signed < 0 && prev.signed !== signed;
      if (crossed) {
        const dir: "forward" | "backward" = signed > prev.signed ? "forward" : "backward";
        const frac = prev.signed / (prev.signed - signed);
        const clamped = Math.min(1, Math.max(0, frac));
        const crossingTsUs = Math.round(prev.ts + clamped * (ts - prev.ts));
        out.push({
          lineId: line.id,
          role: line.role ?? null,
          frameBeforeIndex: prev.idx,
          frameAfterIndex: i,
          timestampBeforeUs: prev.ts,
          timestampAfterUs: ts,
          crossingTimestampUs: crossingTsUs,
          interpolationFraction: round(clamped, 6),
          direction: dir,
          crossingUncertaintyMs,
        });
      }
    }
    prev = { idx: i, signed, ts };
  }
  return out;
}

/** Rzut stopy (piętы/kostki) na podłoże (world x, mm) dla danej klatki. */
function feetWorldX(
  p: FramePose,
  invH: Homography,
  width: number,
  height: number,
): { left: number | null; right: number | null } {
  const lm = p.landmarks;
  if (!lm) return { left: null, right: null };
  const projectSide = (heelIdx: number, ankleIdx: number): number | null => {
    const point = lm[heelIdx] ?? lm[ankleIdx];
    if (!point) return null;
    const g = applyInverse(invH, point.x * width, point.y * height);
    return g ? g.x : null;
  };
  return {
    left: projectSide(POSE.LEFT_HEEL, POSE.LEFT_ANKLE),
    right: projectSide(POSE.RIGHT_HEEL, POSE.RIGHT_ANKLE),
  };
}

/**
 * Czy jakakolwiek stopa dotarła do linii/strefy zwrotu (world x) w oknie
 * czasowym [fromUs, toUs]. Zwraca moment (µs) najdalszego dotarcia lub null.
 * Kierunek dojścia wynika ze znaku (turnX - referenceX).
 */
function turnReachTimeUs(
  input: CodInput,
  turnX: number,
  referenceX: number,
  fromUs: number,
  toUs: number,
): { reachedAtUs: number; apexIdx: number } | null {
  const invH = invert3x3(input.homography!);
  if (!invH) return null;
  const goingPositive = turnX >= referenceX;
  let reachedAtUs: number | null = null;
  let apexIdx = -1;
  let apexExtent = goingPositive ? -Infinity : Infinity;

  for (let i = 0; i < input.poses.length; i++) {
    const p = input.poses[i];
    const ts = frameSourceTimestampUs(p);
    if (ts == null || ts < fromUs || ts > toUs) continue;
    const feet = feetWorldX(p, invH, input.width, input.height);
    const xs = [feet.left, feet.right].filter((v): v is number => v != null);
    if (xs.length === 0) continue;
    const extent = goingPositive ? Math.max(...xs) : Math.min(...xs);
    const reached = goingPositive
      ? extent >= turnX - TURN_REACH_TOLERANCE_MM
      : extent <= turnX + TURN_REACH_TOLERANCE_MM;
    if (reached && reachedAtUs == null) reachedAtUs = ts;
    if (goingPositive ? extent > apexExtent : extent < apexExtent) {
      apexExtent = extent;
      apexIdx = i;
    }
  }
  return reachedAtUs != null ? { reachedAtUs, apexIdx } : null;
}

/** Noga zwrotna w klatce apeksu = stopa najdalej wysunięta w kierunku zwrotu. */
function turningSideAt(
  input: CodInput,
  apexIdx: number,
  goingPositive: boolean,
): TurningSide | null {
  if (apexIdx < 0) return null;
  const invH = invert3x3(input.homography!);
  if (!invH) return null;
  const feet = feetWorldX(input.poses[apexIdx], invH, input.width, input.height);
  if (feet.left == null || feet.right == null) {
    if (feet.left != null) return "left";
    if (feet.right != null) return "right";
    return null;
  }
  if (goingPositive) return feet.left > feet.right ? "left" : "right";
  return feet.left < feet.right ? "left" : "right";
}

function classifyQuality(maxUncMs: number): Exclude<CodResultQuality, "REJECTED"> {
  return maxUncMs <= OFFICIAL_UNCERTAINTY_MS ? "OFFICIAL" : "ESTIMATED";
}

// ---------------------------------------------------------------------------
// 505 — pojedynczy zwrot 180° na jednej płaszczyźnie czasowej (TIMING_A)
// ---------------------------------------------------------------------------

/**
 * 505 wymaga: TIMING_A + TURN_LINE (lub skalibrowana strefa zwrotu).
 * Sekwencja: pierwsze przecięcie Timing Plane → dojście do strefy → kontakt
 * nogi zwrotnej → realna zmiana kierunku → ponowne przecięcie tej samej
 * płaszczyzny. Czas = secondCrossingTimestampUs - firstCrossingTimestampUs.
 */
export function detectCod505(input: CodInput): CodResult {
  const debug: CodDebugRow[] = [];
  const gate = calibrationGate(input);
  if (gate) return fail(gate, debug);

  const timing = input.registry.get("TIMING_A") ?? input.registry.get("START");
  const turn = input.registry.get("TURN_LINE");
  if (!timing || !turn) return fail("TIMING_LINES_REQUIRED", debug);

  const timingX = lineWorldX(timing);
  const turnX = lineWorldX(turn);
  if (timingX == null || turnX == null) return fail("TIMING_LINES_REQUIRED", debug);

  const crossings = allTorsoCrossings(input, timing);
  for (const c of crossings) {
    debug.push({ role: c.role, lineId: c.lineId, event: `crossing_${c.direction}`, timestampUs: c.crossingTimestampUs });
  }

  if (crossings.length < 1) return fail("TURN_NOT_DETECTED", debug);

  const first = crossings[0];
  const goingPositive = turnX >= timingX;
  const expectedFirstDir: "forward" | "backward" = goingPositive ? "forward" : "backward";
  if (first.direction !== expectedFirstDir) return fail("WRONG_CROSSING_DIRECTION", debug);

  // Powrotne przecięcie tej samej płaszczyzny (przeciwny kierunek).
  const second = crossings.find(
    (c) => c.crossingTimestampUs > first.crossingTimestampUs && c.direction !== first.direction,
  );
  if (!second) return fail("TURN_NOT_DETECTED", debug);

  // Dotarcie stopy do strefy zwrotu między przecięciami.
  const reach = turnReachTimeUs(
    input,
    turnX,
    timingX,
    first.crossingTimestampUs,
    second.crossingTimestampUs,
  );
  if (!reach) return fail("TURN_LINE_NOT_REACHED", debug);
  debug.push({ role: "TURN_LINE", lineId: turn.id, event: "turn_reached", timestampUs: reach.reachedAtUs });

  // Strona zwrotu z kontaktu nogi zwrotnej w apeksie.
  const turningSide = turningSideAt(input, reach.apexIdx, goingPositive);
  if (turningSide) {
    debug.push({ role: "TURN_LINE", lineId: turn.id, event: "turning_side", timestampUs: reach.reachedAtUs, detail: turningSide });
  }
  if (input.expectedTurningSide && turningSide && input.expectedTurningSide !== turningSide) {
    return fail("WRONG_TURNING_SIDE", debug);
  }

  const maxUnc = Math.max(first.crossingUncertaintyMs, second.crossingUncertaintyMs);
  if (maxUnc > MAX_CROSSING_UNCERTAINTY_MS) return fail("CROSSING_UNCERTAINTY_TOO_HIGH", debug);

  const totalTimeS = round(
    (second.crossingTimestampUs - first.crossingTimestampUs) / 1_000_000,
    4,
  );
  return {
    ok: true,
    resultQuality: classifyQuality(maxUnc),
    totalTimeS,
    firstCrossingTimestampUs: first.crossingTimestampUs,
    secondCrossingTimestampUs: second.crossingTimestampUs,
    crossings: [first, second],
    turningSide,
    elapsedUncertaintyMs: round(Math.hypot(first.crossingUncertaintyMs, second.crossingUncertaintyMs), 3),
    debug,
  };
}

// ---------------------------------------------------------------------------
// 5-10-5 — podwójny zwrot na trzech liniach (CENTER, TURN_LEFT, TURN_RIGHT)
// ---------------------------------------------------------------------------

/**
 * 5-10-5 wymaga: CENTER + TURN_LEFT + TURN_RIGHT.
 * Kolejność (walidowana ściśle):
 *   start (przez CENTER) → pierwszy zwrot (dotarcie do jednej linii + zmiana
 *   kierunku) → powrót przez CENTER → drugi zwrot (druga linia + zmiana
 *   kierunku) → finalne przecięcie CENTER.
 * Czas = ostatnie przecięcie CENTER - pierwsze przecięcie CENTER.
 */
export function detectCodFiveTenFive(input: CodInput): CodResult {
  const debug: CodDebugRow[] = [];
  const gate = calibrationGate(input);
  if (gate) return fail(gate, debug);

  const center = input.registry.get("CENTER");
  const turnLeft = input.registry.get("TURN_LEFT");
  const turnRight = input.registry.get("TURN_RIGHT");
  if (!center || !turnLeft || !turnRight) return fail("TIMING_LINES_REQUIRED", debug);

  const centerX = lineWorldX(center);
  const leftX = lineWorldX(turnLeft);
  const rightX = lineWorldX(turnRight);
  if (centerX == null || leftX == null || rightX == null) return fail("TIMING_LINES_REQUIRED", debug);

  const centerCrossings = allTorsoCrossings(input, center);
  for (const c of centerCrossings) {
    debug.push({ role: "CENTER", lineId: c.lineId, event: `crossing_${c.direction}`, timestampUs: c.crossingTimestampUs });
  }

  // Potrzebne co najmniej 3 przecięcia środka (start, powrót, finał).
  if (centerCrossings.length < 3) return fail("TURN_NOT_DETECTED", debug);

  const start = centerCrossings[0];
  const mid = centerCrossings[1];
  const finalCross = centerCrossings[2];

  // Kolejność kierunków musi być naprzemienna (realny podwójny zwrot).
  if (!(start.direction !== mid.direction && mid.direction !== finalCross.direction)) {
    return fail("WRONG_LINE_SEQUENCE", debug);
  }

  // Pierwsza noga idzie w stronę zgodną z kierunkiem startu.
  const firstPositive = start.direction === "forward";
  const firstTurnLine = firstPositive
    ? (rightX >= centerX ? turnRight : turnLeft)
    : (rightX < centerX ? turnRight : turnLeft);
  const firstTurnX = lineWorldX(firstTurnLine)!;
  const secondTurnLine = firstTurnLine.id === turnRight.id ? turnLeft : turnRight;
  const secondTurnX = lineWorldX(secondTurnLine)!;

  // Pierwszy zwrot: dotarcie do linii między start a mid.
  const firstReach = turnReachTimeUs(input, firstTurnX, centerX, start.crossingTimestampUs, mid.crossingTimestampUs);
  if (!firstReach) return fail("TURN_LINE_NOT_REACHED", debug);
  debug.push({ role: firstTurnLine.role ?? null, lineId: firstTurnLine.id, event: "turn1_reached", timestampUs: firstReach.reachedAtUs });

  // Drugi zwrot: dotarcie do drugiej (przeciwnej) linii między mid a final.
  const secondReach = turnReachTimeUs(input, secondTurnX, centerX, mid.crossingTimestampUs, finalCross.crossingTimestampUs);
  if (!secondReach) return fail("WRONG_LINE_SEQUENCE", debug);
  debug.push({ role: secondTurnLine.role ?? null, lineId: secondTurnLine.id, event: "turn2_reached", timestampUs: secondReach.reachedAtUs });

  // Ścisła kolejność zdarzeń w czasie.
  const order = [
    start.crossingTimestampUs,
    firstReach.reachedAtUs,
    mid.crossingTimestampUs,
    secondReach.reachedAtUs,
    finalCross.crossingTimestampUs,
  ];
  for (let i = 1; i < order.length; i++) {
    if (!(order[i] > order[i - 1])) return fail("WRONG_LINE_SEQUENCE", debug);
  }

  const maxUnc = Math.max(start.crossingUncertaintyMs, finalCross.crossingUncertaintyMs);
  if (maxUnc > MAX_CROSSING_UNCERTAINTY_MS) return fail("CROSSING_UNCERTAINTY_TOO_HIGH", debug);

  const totalTimeS = round(
    (finalCross.crossingTimestampUs - start.crossingTimestampUs) / 1_000_000,
    4,
  );
  return {
    ok: true,
    resultQuality: classifyQuality(maxUnc),
    totalTimeS,
    firstCrossingTimestampUs: start.crossingTimestampUs,
    secondCrossingTimestampUs: finalCross.crossingTimestampUs,
    crossings: [start, mid, finalCross],
    turningSide: null,
    elapsedUncertaintyMs: round(Math.hypot(start.crossingUncertaintyMs, finalCross.crossingUncertaintyMs), 3),
    debug,
  };
}

export { MAX_CROSSING_UNCERTAINTY_MS };
