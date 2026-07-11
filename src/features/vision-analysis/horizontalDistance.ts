/**
 * Ground Horizontal Distance — wspólny silnik pomiaru odległości na podłożu
 * dla testów rodziny GROUND_DISTANCE (Broad Jump, Single Leg Hop).
 *
 * Zasada pomiaru (zgodna z protokołem):
 *   landingHeelPointPx → homographyMatrix (H⁻¹) → landingHeelPointMm
 *   → PROSTOPADŁA odległość od linii wybicia (takeoffLine).
 *
 * Mierzymy WYŁĄCZNIE piętę (landmarks 29/30) w momencie pierwszego kontaktu —
 * nigdy środka kostki, środka stopy ani pięty po przesunięciu stopy. Bierzemy
 * piętę NAJBLIŻSZĄ linii wybicia (najbliższy punkt kontaktu).
 *
 * Wszystkie funkcje są czyste i deterministyczne (ten sam film + kalibracja =
 * ten sam wynik, klatka i piksel).
 */

import type { AnalysisContext, DetectedEvent } from "./types";
import { POSE } from "./types";
import type { CalibrationRecord, ImagePointPx } from "./videoCalibration";
import { pointInPolygon } from "./videoCalibration";
import { applyInverse, invert3x3, type GroundPoint } from "./homographyGeometry";
import type { Homography } from "./calibrationProfiles";
import { round } from "./physics";

export type HorizontalDistanceError =
  | "NO_EVENTS"
  | "NO_HOMOGRAPHY"
  | "NO_TAKEOFF_LINE"
  | "HEEL_OCCLUDED"
  | "LANDING_OUT_OF_CALIBRATION_AREA"
  | "IMPLAUSIBLE";

export interface HorizontalDistanceResult {
  ok: true;
  distanceCm: number;
  landingHeelPointPx: ImagePointPx;
  landingHeelPointMm: GroundPoint;
  side: "left" | "right";
  reprojectionErrorPx: number | null;
}

export interface HorizontalDistanceFailure {
  ok: false;
  error: HorizontalDistanceError;
}

/** Minimalna widoczność landmarku pięty, by uznać go za wykryty. */
const MIN_HEEL_VISIBILITY = 0.5;

/** Fizycznie prawdopodobny zakres odległości (cm). */
const MIN_DISTANCE_CM = 60;
const MAX_DISTANCE_CM = 400;

function heelPixel(
  ctx: AnalysisContext,
  frameIndex: number,
  side: "left" | "right",
): ImagePointPx | null {
  const lm = ctx.poses[frameIndex]?.landmarks;
  if (!lm) return null;
  const idx = side === "left" ? POSE.LEFT_HEEL : POSE.RIGHT_HEEL;
  const p = lm[idx];
  if (!p || p.visibility < MIN_HEEL_VISIBILITY) return null;
  return { u: p.x * ctx.metadata.width, v: p.y * ctx.metadata.height };
}

/** Prostopadła odległość punktu od linii (a→b) na płaszczyźnie podłoża (mm). */
function perpendicularDistanceMm(
  point: GroundPoint,
  a: GroundPoint,
  b: GroundPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(point.x - a.x, point.y - a.y);
  // |(P-A) × (B-A)| / |B-A|
  const cross = (point.x - a.x) * dy - (point.y - a.y) * dx;
  return Math.abs(cross) / len;
}

/**
 * Mierzy poziomą odległość skoku od linii wybicia do najbliższej pięty lądowania.
 * Wymaga homografii i linii wybicia z kalibracji sceny filmu.
 */
export function measureGroundHorizontalDistance(
  ctx: AnalysisContext,
  events: DetectedEvent[],
): HorizontalDistanceResult | HorizontalDistanceFailure {
  const takeoff = events.find((e) => e.type === "takeoff");
  const landing = events.find((e) => e.type === "landing");
  if (!takeoff || !landing) return { ok: false, error: "NO_EVENTS" };

  const record = ctx.calibrationRecord ?? null;
  const worldToImage: Homography | null =
    record?.homographyMatrix ?? ctx.calibration?.homography ?? null;
  if (!worldToImage) return { ok: false, error: "NO_HOMOGRAPHY" };

  const inverse = record?.inverseHomographyMatrix ?? invert3x3(worldToImage);
  if (!inverse) return { ok: false, error: "NO_HOMOGRAPHY" };

  const takeoffLine = record?.takeoffLinePx ?? null;
  if (!takeoffLine) return { ok: false, error: "NO_TAKEOFF_LINE" };

  const lineAmm = applyInverse(inverse, takeoffLine[0].u, takeoffLine[0].v);
  const lineBmm = applyInverse(inverse, takeoffLine[1].u, takeoffLine[1].v);
  if (!lineAmm || !lineBmm) return { ok: false, error: "NO_HOMOGRAPHY" };

  // Pięty w momencie pierwszego kontaktu (frame lądowania).
  const candidates: { side: "left" | "right"; px: ImagePointPx; mm: GroundPoint; dist: number }[] =
    [];
  for (const side of ["left", "right"] as const) {
    const px = heelPixel(ctx, landing.frameIndex, side);
    if (!px) continue;
    // Piksel pięty musi leżeć w skalibrowanym obszarze podłoża.
    if (record?.calibratedAreaPolygonPx?.length) {
      if (!pointInPolygon(px, record.calibratedAreaPolygonPx))
        return { ok: false, error: "LANDING_OUT_OF_CALIBRATION_AREA" };
    }
    if (record?.landingAreaPolygonPx?.length) {
      if (!pointInPolygon(px, record.landingAreaPolygonPx))
        return { ok: false, error: "LANDING_OUT_OF_CALIBRATION_AREA" };
    }
    const mm = applyInverse(inverse, px.u, px.v);
    if (!mm) continue;
    candidates.push({ side, px, mm, dist: perpendicularDistanceMm(mm, lineAmm, lineBmm) });
  }

  if (candidates.length === 0) return { ok: false, error: "HEEL_OCCLUDED" };

  // Najbliższa pięta do linii wybicia = oficjalny punkt pomiaru.
  candidates.sort((a, b) => a.dist - b.dist);
  const best = candidates[0];
  const distanceCm = round(best.dist / 10, 1);
  if (distanceCm < MIN_DISTANCE_CM || distanceCm > MAX_DISTANCE_CM)
    return { ok: false, error: "IMPLAUSIBLE" };

  return {
    ok: true,
    distanceCm,
    landingHeelPointPx: best.px,
    landingHeelPointMm: { x: round(best.mm.x, 1), y: round(best.mm.y, 1) },
    side: best.side,
    reprojectionErrorPx: record?.reprojectionErrorPx ?? null,
  };
}
