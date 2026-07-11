/**
 * CalibratedLineCrossingEngine — wspólny, deterministyczny silnik wykrywania
 * przecięcia skalibrowanej linii pomiaru czasu (Timing Plane) dla wszystkich
 * testów czasowych (Sprint, Flying Sprint, 505, 5-10-5, Sprint-to-Stop).
 *
 * ZASADA GEOMETRYCZNA
 *  - Homografia dotyczy WYŁĄCZNIE punktów leżących na podłożu (linie, markery,
 *    strefy, stopy). NIE rzutujemy punktu tułowia przez homografię podłoża.
 *  - Timing Plane: skalibrowana linia na podłożu (worldXmm) rzutowana przez
 *    homografię na obraz definiuje położenie pionowej płaszczyzny pomiarowej.
 *  - Do detekcji czasu używamy STAŁEGO punktu referencyjnego tułowia (piksel),
 *    porównując jego położenie z rzutem linii podłoża na obraz.
 *
 * DETERMINIZM
 *  Ten sam film + ta sama kalibracja → identyczne frameBeforeIndex,
 *  frameAfterIndex, crossingTimestampUs, interpolationFraction, elapsedTime.
 *  Brak losowości, brak DOM, brak zależności od czasu ściennego.
 */

import type { FramePose, TimingLineSpec } from "./types";
import { POSE } from "./types";
import type { Homography } from "./calibrationProfiles";
import { invert3x3, applyInverse } from "./homographyGeometry";
import { round } from "./physics";

/** Kod błędu specyficzny dla silnika przecięcia linii. */
export type LineCrossingErrorCode =
  | "TIMING_LINE_NOT_CALIBRATED"
  | "TIMING_PLANE_CALIBRATION_FAILED"
  | "LINE_CROSSING_NOT_DETECTED"
  | "WRONG_CROSSING_DIRECTION"
  | "CROSSING_UNCERTAINTY_TOO_HIGH"
  | "CALIBRATION_CAMERA_MOVED";

/** Maksymalna dopuszczalna niepewność momentu przecięcia (ms). */
export const MAX_CROSSING_UNCERTAINTY_MS = 12;

/** Wynik przecięcia pojedynczej linii — pełny, powtarzalny ślad pomiaru. */
export interface LineCrossing {
  lineId: string;
  frameBeforeIndex: number;
  frameAfterIndex: number;
  /** Rzeczywisty timestamp źródłowej klatki przed przecięciem (µs). */
  timestampBeforeUs: number;
  timestampAfterUs: number;
  /** Interpolowany moment przecięcia płaszczyzny (µs). */
  crossingTimestampUs: number;
  /** Ułamek interpolacji 0-1 pomiędzy klatką przed a po. */
  interpolationFraction: number;
  /** Kierunek faktycznego przecięcia względem osi ruchu. */
  direction: "forward" | "backward";
  /** Niepewność momentu przecięcia (ms). */
  crossingUncertaintyMs: number;
}

export interface CrossingSuccess {
  ok: true;
  crossings: LineCrossing[];
  /** Log przecięć (do panelu ?visionDebug=true i weryfikacji powtarzalności). */
  debug: CrossingDebugRow[];
}

export interface CrossingFailure {
  ok: false;
  code: LineCrossingErrorCode;
  debug: CrossingDebugRow[];
}

export type CrossingResult = CrossingSuccess | CrossingFailure;

/** Wiersz logu diagnostycznego dla każdej wykrytej linii. */
export interface CrossingDebugRow {
  lineId: string;
  lineImageU: number | null;
  frameBeforeIndex: number;
  frameAfterIndex: number;
  torsoUBefore: number;
  torsoUAfter: number;
  timestampBeforeUs: number;
  timestampAfterUs: number;
  crossingTimestampUs: number;
  interpolationFraction: number;
  crossingUncertaintyMs: number;
  direction: "forward" | "backward" | "none";
}

export interface CrossingInput {
  poses: FramePose[];
  /** Homografia world(mm)→image(px) ze skalibrowanego profilu. */
  homography: Homography | null;
  /** Skalibrowane linie pomiaru czasu na podłożu. */
  timingLines: TimingLineSpec[] | null | undefined;
  width: number;
  height: number;
  /** Czy kamera pozostała nieruchoma po kalibracji. */
  cameraStable?: boolean | null;
  /** Rozpiętość świata w osi Y (mm) do wyznaczenia rzutu linii (domyślnie 0..3000). */
  worldYSpanMm?: { min: number; max: number };
}

/** Źródłowy timestamp klatki w µs (pełna precyzja, deterministyczny). */
function sourceUs(p: FramePose): number | null {
  if (typeof p.sourceTimestampUs === "number") return p.sourceTimestampUs;
  if (typeof p.sourceTimestampMs === "number") return Math.round(p.sourceTimestampMs * 1000);
  return null;
}

/**
 * STAŁY punkt referencyjny tułowia w pikselach — środek ramion i bioder.
 * Wybór stały (nie „najbardziej wysunięty punkt”) gwarantuje powtarzalność.
 */
function torsoPixel(p: FramePose, width: number, height: number): { u: number; v: number } | null {
  const lm = p.landmarks;
  if (!lm) return null;
  const ls = lm[POSE.LEFT_SHOULDER];
  const rs = lm[POSE.RIGHT_SHOULDER];
  const lh = lm[POSE.LEFT_HIP];
  const rh = lm[POSE.RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return null;
  const u = ((ls.x + rs.x + lh.x + rh.x) / 4) * width;
  const v = ((ls.y + rs.y + lh.y + rh.y) / 4) * height;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return { u, v };
}

/**
 * Rzut skalibrowanej linii podłoża na obraz. Zwraca funkcję u(v) opisującą,
 * gdzie linia przebiega w obrazie na wysokości v. To wciąż operacja na punktach
 * PODŁOŻA (linia), nie na tułowiu.
 *
 * Linia jest definiowana albo dwoma punktami podłoża (groundStart/EndPointMm),
 * albo pojedynczą współrzędną worldXmm rozciągniętą wzdłuż osi Y (legacy).
 */
function projectGroundLine(
  homography: Homography,
  line: TimingLineSpec,
  ySpan: { min: number; max: number },
): ((v: number) => number) | null {
  const H = homography;
  const project = (x: number, y: number): { u: number; v: number } | null => {
    const w = H[6] * x + H[7] * y + H[8];
    if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
    return { u: (H[0] * x + H[1] * y + H[2]) / w, v: (H[3] * x + H[4] * y + H[5]) / w };
  };
  let a: { u: number; v: number } | null;
  let b: { u: number; v: number } | null;
  if (line.groundStartPointMm && line.groundEndPointMm) {
    a = project(line.groundStartPointMm.x, line.groundStartPointMm.y);
    b = project(line.groundEndPointMm.x, line.groundEndPointMm.y);
  } else if (typeof line.worldXmm === "number") {
    a = project(line.worldXmm, ySpan.min);
    b = project(line.worldXmm, ySpan.max);
  } else {
    return null;
  }
  if (!a || !b) return null;
  // Linia w obrazie: u = a.u + (v - a.v) * du/dv. Przy pionowej linii du/dv≈0.
  const dv = b.v - a.v;
  if (Math.abs(dv) < 1e-9) {
    // Linia pozioma w obrazie — niepoprawna geometria dla pomiaru wzdłuż ruchu.
    return null;
  }
  const slope = (b.u - a.u) / dv;
  return (v: number) => a!.u + (v - a!.v) * slope;
}

/** Znajduje pierwsze przecięcie linii przez punkt tułowia (deterministycznie). */
function detectLineCrossing(
  input: CrossingInput,
  line: TimingLineSpec,
  lineU: (v: number) => number,
): { crossing: LineCrossing | null; row: CrossingDebugRow; wrongDirectionOnly: boolean } {
  const { poses, width, height } = input;
  const frameIntervalUs = medianFrameIntervalUs(poses);
  let prev: { idx: number; signed: number; u: number; v: number; ts: number } | null = null;
  let wrongDirectionSeen = false;
  const wanted = line.direction ?? "forward";

  const emptyRow: CrossingDebugRow = {
    lineId: line.id,
    lineImageU: null,
    frameBeforeIndex: -1,
    frameAfterIndex: -1,
    torsoUBefore: NaN,
    torsoUAfter: NaN,
    timestampBeforeUs: -1,
    timestampAfterUs: -1,
    crossingTimestampUs: -1,
    interpolationFraction: NaN,
    crossingUncertaintyMs: NaN,
    direction: "none",
  };

  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    const ts = sourceUs(p);
    const torso = torsoPixel(p, width, height);
    if (ts == null || !torso) continue;
    const lu = lineU(torso.v);
    if (!Number.isFinite(lu)) continue;
    const signed = torso.u - lu; // >0 = tułów po prawej stronie linii

    if (prev && Number.isFinite(prev.signed)) {
      const crossed = prev.signed < 0 !== signed < 0 && prev.signed !== signed;
      if (crossed) {
        const dir: "forward" | "backward" = signed > prev.signed ? "forward" : "backward";
        const directionOk = wanted === "any" || wanted === dir;
        if (!directionOk) {
          wrongDirectionSeen = true;
        } else {
          // Interpolacja momentu przecięcia po znaku odległości od linii.
          const frac = prev.signed / (prev.signed - signed);
          const clamped = Math.min(1, Math.max(0, frac));
          const crossingTsUs = Math.round(prev.ts + clamped * (ts - prev.ts));
          const crossingUncertaintyMs = round(frameIntervalUs / 2 / 1000, 3);
          const row: CrossingDebugRow = {
            lineId: line.id,
            lineImageU: round(lu, 2),
            frameBeforeIndex: prev.idx,
            frameAfterIndex: i,
            torsoUBefore: round(prev.u, 2),
            torsoUAfter: round(torso.u, 2),
            timestampBeforeUs: prev.ts,
            timestampAfterUs: ts,
            crossingTimestampUs: crossingTsUs,
            interpolationFraction: round(clamped, 6),
            crossingUncertaintyMs,
            direction: dir,
          };
          const crossing: LineCrossing = {
            lineId: line.id,
            frameBeforeIndex: prev.idx,
            frameAfterIndex: i,
            timestampBeforeUs: prev.ts,
            timestampAfterUs: ts,
            crossingTimestampUs: crossingTsUs,
            interpolationFraction: round(clamped, 6),
            direction: dir,
            crossingUncertaintyMs,
          };
          return { crossing, row, wrongDirectionOnly: false };
        }
      }
    }
    prev = { idx: i, signed, u: torso.u, v: torso.v, ts };
  }

  return { crossing: null, row: emptyRow, wrongDirectionOnly: wrongDirectionSeen };
}

/** Mediana odstępu klatek (µs) ze źródłowych timestampów. */
function medianFrameIntervalUs(poses: FramePose[]): number {
  const ts = poses
    .map(sourceUs)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);
  if (ts.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/**
 * Główne wejście silnika: wykrywa przecięcia WSZYSTKICH skalibrowanych linii
 * przez stały punkt referencyjny tułowia. Blokuje test przy braku kalibracji,
 * braku linii, złej geometrii, złym kierunku lub zbyt wysokiej niepewności.
 */
export function detectCalibratedCrossings(input: CrossingInput): CrossingResult {
  const debug: CrossingDebugRow[] = [];

  if (input.cameraStable === false) {
    return { ok: false, code: "CALIBRATION_CAMERA_MOVED", debug };
  }
  if (!input.homography) {
    return { ok: false, code: "TIMING_LINE_NOT_CALIBRATED", debug };
  }
  if (!input.timingLines || input.timingLines.length === 0) {
    return { ok: false, code: "TIMING_LINE_NOT_CALIBRATED", debug };
  }
  // Homografia musi być odwracalna (geometria płaszczyzny poprawna).
  if (!invert3x3(input.homography)) {
    return { ok: false, code: "TIMING_PLANE_CALIBRATION_FAILED", debug };
  }
  // Kontrola sanity: rzut punktu podłoża wraca sensownie.
  const sanity = applyInverse(invert3x3(input.homography)!, input.width / 2, input.height / 2);
  if (!sanity) {
    return { ok: false, code: "TIMING_PLANE_CALIBRATION_FAILED", debug };
  }

  const ySpan = input.worldYSpanMm ?? { min: 0, max: 3000 };
  const crossings: LineCrossing[] = [];
  let anyWrongDirection = false;

  for (const line of input.timingLines) {
    const lineU = projectGroundLine(input.homography, line.worldXmm, ySpan);
    if (!lineU) {
      return { ok: false, code: "TIMING_PLANE_CALIBRATION_FAILED", debug };
    }
    const { crossing, row, wrongDirectionOnly } = detectLineCrossing(input, line, lineU);
    debug.push(row);
    if (!crossing) {
      if (wrongDirectionOnly) anyWrongDirection = true;
      continue;
    }
    crossings.push(crossing);
  }

  if (crossings.length < input.timingLines.length) {
    if (anyWrongDirection) return { ok: false, code: "WRONG_CROSSING_DIRECTION", debug };
    return { ok: false, code: "LINE_CROSSING_NOT_DETECTED", debug };
  }

  // Kontrola niepewności — nie deklarujemy wyniku, gdy przekroczono limit.
  const maxUnc = Math.max(...crossings.map((c) => c.crossingUncertaintyMs));
  if (maxUnc > MAX_CROSSING_UNCERTAINTY_MS) {
    return { ok: false, code: "CROSSING_UNCERTAINTY_TOO_HIGH", debug };
  }

  return { ok: true, crossings, debug };
}

/** Czas między dwiema liniami (s) z interpolowanych momentów przecięcia. */
export function elapsedSeconds(a: LineCrossing, b: LineCrossing): number {
  return round(Math.abs(b.crossingTimestampUs - a.crossingTimestampUs) / 1_000_000, 4);
}

/** Łączna niepewność czasu między dwoma przecięciami (ms). */
export function elapsedUncertaintyMs(a: LineCrossing, b: LineCrossing): number {
  return round(Math.hypot(a.crossingUncertaintyMs, b.crossingUncertaintyMs), 3);
}
