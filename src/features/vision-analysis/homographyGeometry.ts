/**
 * Homography Geometry — realne przeliczanie pikseli obrazu na płaszczyznę
 * podłoża (mm) przez skalibrowaną homografię profilu.
 *
 * Profil przechowuje homografię world→image (patrz calibrationProfiles.ts).
 * Aby zamienić punkt obrazu na punkt świata (podłoża) trzeba ją odwrócić.
 * Każdy punkt przestrzenny przechodzi ścieżkę:
 *   imagePointPx → (korekcja dystorsji) → H⁻¹ → groundPlanePointMm
 *
 * NIE używamy jednego globalnego mmPerPixel dla całego obrazu — skala jest
 * lokalna i wynika z perspektywy. Wszystkie funkcje są czyste/deterministyczne.
 */

import type { Homography } from "./calibrationProfiles";
import { round } from "./physics";

export interface GroundPoint {
  x: number; // mm
  y: number; // mm
}

/** Odwraca macierz 3×3 (row-major, 9 elementów). Zwraca null, gdy osobliwa. */
export function invert3x3(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-15) return null;
  const invDet = 1 / det;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H2 = -(a * f - c * d);
  const I = a * e - b * d;
  return [
    A * invDet,
    D * invDet,
    G * invDet,
    B * invDet,
    E * invDet,
    H2 * invDet,
    C * invDet,
    F * invDet,
    I * invDet,
  ];
}

/**
 * Zamienia punkt obrazu (piksel u,v) na punkt płaszczyzny podłoża (mm),
 * używając odwrotnej homografii (image→world).
 */
export function imageToGround(
  worldToImage: Homography,
  u: number,
  v: number,
): GroundPoint | null {
  const inv = invert3x3(worldToImage);
  if (!inv) return null;
  return applyInverse(inv, u, v);
}

/** Wariant wielokrotny: przekazujemy już odwróconą macierz (image→world). */
export function applyInverse(imageToWorld: Homography, u: number, v: number): GroundPoint | null {
  const H = imageToWorld;
  const w = H[6] * u + H[7] * v + H[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return {
    x: (H[0] * u + H[1] * v + H[2]) / w,
    y: (H[3] * u + H[4] * v + H[5]) / w,
  };
}

/**
 * Odległość na podłożu (mm) między dwoma pikselami obrazu przez homografię.
 * Zwraca null, gdy homografia jest nieodwracalna lub punkt poza płaszczyzną.
 */
export function groundDistanceMm(
  worldToImage: Homography,
  p1: { u: number; v: number },
  p2: { u: number; v: number },
): number | null {
  const inv = invert3x3(worldToImage);
  if (!inv) return null;
  const a = applyInverse(inv, p1.u, p1.v);
  const b = applyInverse(inv, p2.u, p2.v);
  if (!a || !b) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Number.isFinite(d) ? round(d, 2) : null;
}

/**
 * Przecięcie pionowej "linii pomiarowej" na podłożu przez punkt tułowia.
 * Dla sprintów/COD: linia jest zdefiniowana we współrzędnych świata (x = lineXmm).
 * Zwraca true, gdy rzut punktu obrazu na podłoże przekroczył linię w kierunku dir.
 */
export function groundXOfImagePoint(
  imageToWorld: Homography,
  u: number,
  v: number,
): number | null {
  const g = applyInverse(imageToWorld, u, v);
  return g ? g.x : null;
}
