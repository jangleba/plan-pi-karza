import type { FramePose } from "./types";
import { POSE } from "./types";
import { footBottomSeries } from "./poseSeries";

/**
 * Auto-kalibracja skali przestrzennej z rzeczywistego wzrostu zawodnika.
 *
 * Zamiast prosić zawodnika o rysowanie linii, wyznaczamy ile metrów przypada
 * na jeden piksel obrazu, mierząc w stabilnej klatce stojącej odległość
 * nos → stopa (w pikselach) i porównując z rzeczywistym wzrostem.
 *
 * MediaPipe normalizuje x względem szerokości, a y względem wysokości obrazu,
 * dlatego przeliczamy współrzędne na PIKSELE, używając wymiarów wideo.
 * Dzięki temu skala jest spójna w poziomie i w pionie (kwadratowe piksele).
 *
 * Deterministyczne, bez DOM i losowości — pokryte testami jednostkowymi.
 */

/** Nos znajduje się na ok. 93% wysokości sylwetki (stopa = 0, czubek = 1). */
const NOSE_TO_STATURE_RATIO = 0.93;

export interface AutoScale {
  /** Rzeczywiste metry przypadające na jeden piksel obrazu. */
  metersPerPixel: number;
  /** Pewność kalibracji 0-1 (liczba i spójność klatek referencyjnych). */
  confidence: number;
  /** Liczba klatek użytych do estymacji. */
  sampleCount: number;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Estymuje skalę metry/piksel z serii póz i znanego wzrostu.
 * Zwraca null, gdy brak wystarczająco stabilnych klatek stojących.
 */
export function estimateScaleFromHeight(
  poses: FramePose[],
  heightCm: number | null | undefined,
  videoWidth: number,
  videoHeight: number,
): AutoScale | null {
  if (!heightCm || heightCm < 100 || heightCm > 230) return null;
  if (videoHeight <= 0 || videoWidth <= 0) return null;
  if (poses.length === 0) return null;

  const statureM = heightCm / 100;
  const feet = footBottomSeries(poses);

  // Klatki-kandydaci: dobra widoczność, nos i stopa w kadrze.
  const pixelSegments: number[] = [];
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    if (!p.landmarks || p.trackingConfidence < 0.5) continue;
    const nose = p.landmarks[POSE.NOSE];
    if (!nose || (nose.visibility ?? 0) < 0.5) continue;
    const footY = feet[i];
    if (!Number.isFinite(footY)) continue;
    // nos wyżej (mniejsze y) niż stopa; segment w pikselach pionu.
    const segNorm = footY - nose.y;
    if (segNorm <= 0.15) continue; // sylwetka zbyt mała / przycięta
    pixelSegments.push(segNorm * videoHeight);
  }

  if (pixelSegments.length < 3) return null;

  const medPx = median(pixelSegments);
  if (!Number.isFinite(medPx) || medPx <= 0) return null;

  // Segment nos→stopa odpowiada ~93% wzrostu.
  const metersPerPixel = (statureM * NOSE_TO_STATURE_RATIO) / medPx;
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;

  // Pewność: więcej spójnych próbek = wyższa. Spójność = niska zmienność.
  const mean = pixelSegments.reduce((a, b) => a + b, 0) / pixelSegments.length;
  const variance =
    pixelSegments.reduce((a, b) => a + (b - mean) ** 2, 0) / pixelSegments.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1; // wsp. zmienności
  const sampleScore = Math.min(1, pixelSegments.length / 10);
  const stabilityScore = Math.max(0, 1 - cv * 4); // cv 0.25 → 0
  const confidence = Math.max(0, Math.min(1, 0.4 + 0.3 * sampleScore + 0.3 * stabilityScore));

  return {
    metersPerPixel,
    confidence: Math.round(confidence * 100) / 100,
    sampleCount: pixelSegments.length,
  };
}

/**
 * Deterministyczna kalibracja awaryjna, gdy profil nie ma wzrostu.
 * Nie losuje wyniku — używa konserwatywnej estymacji wzrostu wg wieku, a
 * obniżona pewność jasno oznacza pomiar jako mniej dokładny.
 */
export function estimateFallbackHeightCm(age: number | null | undefined): number {
  if (!age || age < 10) return 170;
  if (age <= 12) return 152;
  if (age <= 14) return 164;
  if (age <= 16) return 172;
  return 178;
}

/**
 * Zamienia poziome przemieszczenie znormalizowane (x) na metry przy danej skali.
 * dxNorm to różnica współrzędnych x (0-1), width to szerokość wideo w pikselach.
 */
export function horizontalNormToMeters(
  dxNorm: number,
  videoWidth: number,
  scale: AutoScale,
): number {
  return Math.abs(dxNorm) * videoWidth * scale.metersPerPixel;
}
