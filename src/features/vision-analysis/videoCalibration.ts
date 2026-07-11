/**
 * Per-video Scene Calibration — kalibracja przestrzenna przypisana do KONKRETNEGO
 * filmu, a nie do profilu urządzenia.
 *
 * Homografia zależy od dokładnego położenia i kąta telefonu względem podłoża,
 * dlatego dla filmu importowanego kalibracja musi być powiązana z tym filmem:
 *   videoHash · calibrationId · calibrationHash · frameConfigurationHash.
 *
 * Wszystkie funkcje są czyste i deterministyczne (bez DOM, losowości, czasu),
 * dzięki czemu ponowne otwarcie tego samego filmu odtwarza tę samą kalibrację.
 */

import { round } from "./physics";
import {
  fitHomography,
  type CorrespondencePoint,
  type Homography,
} from "./calibrationProfiles";
import { invert3x3, applyInverse } from "./homographyGeometry";

/** Trzy tryby kalibracji sceny filmu. */
export type CalibrationType =
  | "AUTOMATIC_MARKERS"
  | "MANUAL_GROUND_POINTS"
  | "KNOWN_DISTANCE";

/** Status wyniku przestrzennego względem kalibracji. */
export type SpatialResultStatus = "OFFICIAL" | "TECHNIQUE_ONLY";

/** Punkt obrazu w pikselach. */
export interface ImagePointPx {
  u: number;
  v: number;
}

/**
 * Podpis sceny do automatycznego potwierdzenia zgodności między filmami.
 * Kalibrację drugiego filmu można ODZIEDZICZYĆ tylko przy zgodności:
 * markerów, tła, skali, obrotu i kadru.
 */
export interface SceneSignature {
  /** Piksele markerów/punktów podłoża (posortowane deterministycznie). */
  markerPointsPx: ImagePointPx[];
  /** Uśredniona jasność/tekstura tła (proste sygnatury kadru). */
  backgroundHash: string;
  /** Skala mm/px w środku kadru. */
  mmPerPixel: number;
  /** Obrót kadru w stopniach (orientacja linii wybicia). */
  rotationDeg: number;
  /** Rozdzielczość i orientacja kadru. */
  frameConfigHash: string;
}

/** Punkt świata leżący na płaszczyźnie podłoża (mm). */
export interface GroundPointMm {
  x: number;
  y: number;
}

/** Odcinek o znanej długości (do walidacji skali). */
export interface KnownDistanceSegment {
  a: ImagePointPx;
  b: ImagePointPx;
  /** Rzeczywista długość odcinka (mm). */
  lengthMm: number;
}

/** Zapisany rekord kalibracji sceny filmu. */
export interface CalibrationRecord {
  videoHash: string;
  calibrationId: string;
  calibrationHash: string;
  calibrationType: CalibrationType;
  referenceFrameIndex: number;
  referenceTimestampUs: number;
  imagePointsPx: ImagePointPx[];
  groundPointsMm: GroundPointMm[];
  homographyMatrix: Homography | null;
  inverseHomographyMatrix: Homography | null;
  reprojectionErrorPx: number;
  reprojectionErrorMm: number;
  /** Wielokąt (piksele) obejmujący ważny obszar kalibracji. */
  calibratedAreaPolygonPx: ImagePointPx[];
  /** Linia wybicia (dwa piksele) — od niej mierzymy prostopadłą odległość lądowania. */
  takeoffLinePx?: [ImagePointPx, ImagePointPx];
  /** Wielokąt (piksele) możliwej strefy lądowania. */
  landingAreaPolygonPx?: ImagePointPx[];
  /** Podpis sceny do dziedziczenia kalibracji między filmami (markery/tło/skala/obrót/kadr). */
  sceneSignature?: SceneSignature;
  calibrationConfidence: number;
  /** Czy homografia jest wystarczająca do wyniku oficjalnego (cm/m/prędkość). */
  spatialResultStatus: SpatialResultStatus;
  createdAt: string;
}

/** Maksymalny akceptowalny błąd reprojekcji dla kalibracji filmu (px). */
export const MAX_VIDEO_REPROJECTION_ERROR_PX = 3.0;

/** Minimalna liczba poprawnych punktów podłoża. */
export const MIN_GROUND_POINTS = 4;

// ---------------------------------------------------------------------------
// HASHOWANIE (deterministyczne, bez zależności zewnętrznych)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit → hex. Deterministyczny dla tych samych danych. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 → unsigned
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Hash filmu z zawartości bajtów. Próbkujemy przy dużych plikach ze stałym
 * krokiem, aby zachować determinizm i wydajność. Ten sam film → ten sam hash.
 */
export function computeVideoHash(bytes: Uint8Array): string {
  const size = bytes.byteLength;
  const maxSamples = 65536;
  const step = Math.max(1, Math.floor(size / maxSamples));
  let acc = `len:${size}|`;
  let chunk = "";
  for (let i = 0; i < size; i += step) {
    chunk += String.fromCharCode(bytes[i]);
    if (chunk.length >= 4096) {
      acc = fnv1a(acc + chunk);
      chunk = "";
    }
  }
  if (chunk.length > 0) acc = fnv1a(acc + chunk);
  return `vh_${fnv1a(acc)}${(size >>> 0).toString(16)}`;
}

/** Hash z Bloba (np. z resolveVideoBlob). */
export async function computeVideoHashFromBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return computeVideoHash(new Uint8Array(buf));
}

/**
 * Konfiguracja klatki wpływająca na geometrię pomiaru: rozdzielczość, FPS,
 * orientacja. Ta sama konfiguracja jest warunkiem użycia zapisanej kalibracji.
 */
export function frameConfigurationHash(cfg: {
  width: number;
  height: number;
  fps: number;
  orientation: string;
}): string {
  return fnv1a(
    `${Math.round(cfg.width)}x${Math.round(cfg.height)}|${Math.round(cfg.fps)}fps|${cfg.orientation}`,
  );
}

/** Hash z geometrii kalibracji (punkty obrazu i świata). Deterministyczny. */
export function calibrationHashFrom(
  imagePointsPx: ImagePointPx[],
  groundPointsMm: GroundPointMm[],
): string {
  const img = imagePointsPx.map((p) => `${round(p.u, 2)},${round(p.v, 2)}`).join(";");
  const wld = groundPointsMm.map((p) => `${round(p.x, 2)},${round(p.y, 2)}`).join(";");
  return fnv1a(`img[${img}]wld[${wld}]`);
}

// ---------------------------------------------------------------------------
// WALIDACJA GEOMETRII
// ---------------------------------------------------------------------------

/** Powierzchnia trójkąta ×2 (do testu współliniowości). */
function cross2(a: GroundPointMm, b: GroundPointMm, c: GroundPointMm): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Czy punkty są współliniowe — brak choćby jednej trójki niewspółliniowej
 * oznacza, że nie da się wyznaczyć homografii (geometria zdegenerowana).
 */
export function arePointsCollinear(points: GroundPointMm[], epsilon = 1): boolean {
  if (points.length < 3) return true;
  let maxArea = 0;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      for (let k = j + 1; k < points.length; k++) {
        const area = Math.abs(cross2(points[i], points[j], points[k])) / 2;
        if (area > maxArea) maxArea = area;
      }
  return maxArea <= epsilon;
}

export interface GroundPointsValidation {
  ok: boolean;
  errors: string[];
}

/** Waliduje minimum 4 poprawne, niewspółliniowe punkty podłoża. */
export function validateGroundPoints(
  imagePointsPx: ImagePointPx[],
  groundPointsMm: GroundPointMm[],
): GroundPointsValidation {
  const errors: string[] = [];
  if (imagePointsPx.length !== groundPointsMm.length)
    errors.push("Liczba punktów obrazu i świata musi być równa.");
  if (groundPointsMm.length < MIN_GROUND_POINTS)
    errors.push(`Zaznacz co najmniej ${MIN_GROUND_POINTS} punkty na podłożu.`);
  if (groundPointsMm.length >= 3 && arePointsCollinear(groundPointsMm))
    errors.push("Punkty nie mogą leżeć na jednej linii (są współliniowe).");
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// OBSZAR KALIBRACJI (convex hull) I TEST POKRYCIA
// ---------------------------------------------------------------------------

/** Otoczka wypukła (monotone chain) zbioru pikseli obrazu. */
export function convexHull(points: ImagePointPx[]): ImagePointPx[] {
  const pts = [...points].sort((p, q) => (p.u === q.u ? p.v - q.v : p.u - q.u));
  if (pts.length <= 2) return pts;
  const crossP = (o: ImagePointPx, a: ImagePointPx, b: ImagePointPx) =>
    (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  const lower: ImagePointPx[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossP(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: ImagePointPx[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossP(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Czy piksel leży wewnątrz wielokąta (ray casting). */
export function pointInPolygon(p: ImagePointPx, polygon: ImagePointPx[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersect =
      a.v > p.v !== b.v > p.v &&
      p.u < ((b.u - a.u) * (p.v - a.v)) / (b.v - a.v || 1e-9) + a.u;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Czy wszystkie wymagane punkty testu mieszczą się w skalibrowanym obszarze. */
export function isAreaWithinCalibration(
  requiredPointsPx: ImagePointPx[],
  polygon: ImagePointPx[],
): boolean {
  if (polygon.length < 3 || requiredPointsPx.length === 0) return false;
  return requiredPointsPx.every((p) => pointInPolygon(p, polygon));
}

// ---------------------------------------------------------------------------
// BUDOWA REKORDU KALIBRACJI
// ---------------------------------------------------------------------------

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Buduje rekord kalibracji dla trybów opartych na homografii
 * (MANUAL_GROUND_POINTS, AUTOMATIC_MARKERS). Czysta funkcja.
 */
export function buildCalibrationRecord(input: {
  videoHash: string;
  calibrationType: CalibrationType;
  referenceFrameIndex: number;
  referenceTimestampUs: number;
  imagePointsPx: ImagePointPx[];
  groundPointsMm: GroundPointMm[];
  maxReprojectionErrorPx?: number;
  /** Linia wybicia (dwa piksele) — opcjonalna, wymagana dla oficjalnego Broad Jump/Hop. */
  takeoffLinePx?: [ImagePointPx, ImagePointPx];
  /** Strefa lądowania (piksele) — opcjonalna. */
  landingAreaPolygonPx?: ImagePointPx[];
  /** Podpis sceny do dziedziczenia kalibracji między filmami. */
  sceneSignature?: SceneSignature;
  now?: string;
  calibrationId?: string;
}):
  | { ok: true; record: CalibrationRecord }
  | { ok: false; errors: string[] } {
  const {
    videoHash,
    calibrationType,
    imagePointsPx,
    groundPointsMm,
    referenceFrameIndex,
    referenceTimestampUs,
  } = input;
  const maxErr = input.maxReprojectionErrorPx ?? MAX_VIDEO_REPROJECTION_ERROR_PX;

  const validation = validateGroundPoints(imagePointsPx, groundPointsMm);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const correspondences: CorrespondencePoint[] = imagePointsPx.map((image, i) => ({
    image,
    world: groundPointsMm[i],
  }));
  const fit = fitHomography(correspondences);
  if (!fit) return { ok: false, errors: ["Nie udało się wyznaczyć homografii z podanych punktów."] };

  const inverse = invert3x3(fit.homography);
  if (!inverse)
    return { ok: false, errors: ["Homografia jest nieodwracalna — popraw rozmieszczenie punktów."] };

  // Błąd reprojekcji w mm: rzut residuum piksela przez lokalną skalę środka.
  const mmPerPx = localMmPerPixel(inverse, imagePointsPx);
  const reprojectionErrorMm = round(fit.reprojectionErrorPx * mmPerPx, 2);

  const polygon = convexHull(imagePointsPx);

  // Pewność kalibracji: maleje z błędem reprojekcji i rośnie z liczbą punktów.
  const errFactor = Math.max(0, 1 - fit.reprojectionErrorPx / maxErr);
  const pointFactor = Math.min(1, imagePointsPx.length / 8);
  const calibrationConfidence = round(0.5 * errFactor + 0.5 * pointFactor, 3);

  const spatialResultStatus: SpatialResultStatus =
    fit.reprojectionErrorPx <= maxErr ? "OFFICIAL" : "TECHNIQUE_ONLY";

  const record: CalibrationRecord = {
    videoHash,
    calibrationId: input.calibrationId ?? uuid(),
    calibrationHash: calibrationHashFrom(imagePointsPx, groundPointsMm),
    calibrationType,
    referenceFrameIndex,
    referenceTimestampUs,
    imagePointsPx,
    groundPointsMm,
    homographyMatrix: fit.homography,
    inverseHomographyMatrix: inverse,
    reprojectionErrorPx: fit.reprojectionErrorPx,
    reprojectionErrorMm,
    calibratedAreaPolygonPx: polygon,
    takeoffLinePx: input.takeoffLinePx,
    landingAreaPolygonPx: input.landingAreaPolygonPx,
    sceneSignature: input.sceneSignature,
    calibrationConfidence,
    spatialResultStatus,
    createdAt: input.now ?? new Date().toISOString(),
  };
  return { ok: true, record };
}

/**
 * Tryb KNOWN_DISTANCE — waliduje wyłącznie skalę na podstawie znanych odcinków.
 * Bez pełnej geometrii płaszczyzny wynik przestrzenny pozostaje NIEOFICJALNY
 * (TECHNIQUE_ONLY): homografia nie jest wyznaczana.
 */
export function buildKnownDistanceRecord(input: {
  videoHash: string;
  referenceFrameIndex: number;
  referenceTimestampUs: number;
  segments: KnownDistanceSegment[];
  now?: string;
  calibrationId?: string;
}):
  | { ok: true; record: CalibrationRecord }
  | { ok: false; errors: string[] } {
  const { segments } = input;
  if (segments.length < 1) return { ok: false, errors: ["Podaj co najmniej jeden odcinek."] };
  const invalid = segments.some((s) => s.lengthMm <= 0);
  if (invalid) return { ok: false, errors: ["Każdy odcinek musi mieć dodatnią długość."] };

  const imagePointsPx = segments.flatMap((s) => [s.a, s.b]);
  const record: CalibrationRecord = {
    videoHash: input.videoHash,
    calibrationId: input.calibrationId ?? uuid(),
    calibrationHash: fnv1a(
      segments.map((s) => `${s.a.u},${s.a.v}-${s.b.u},${s.b.v}=${s.lengthMm}`).join("|"),
    ),
    calibrationType: "KNOWN_DISTANCE",
    referenceFrameIndex: input.referenceFrameIndex,
    referenceTimestampUs: input.referenceTimestampUs,
    imagePointsPx,
    groundPointsMm: [],
    homographyMatrix: null,
    inverseHomographyMatrix: null,
    reprojectionErrorPx: 0,
    reprojectionErrorMm: 0,
    calibratedAreaPolygonPx: convexHull(imagePointsPx),
    calibrationConfidence: round(Math.min(1, segments.length / 3) * 0.6, 3),
    // Geometria niewystarczająca do pełnej homografii → wynik nieoficjalny.
    spatialResultStatus: "TECHNIQUE_ONLY",
    createdAt: input.now ?? new Date().toISOString(),
  };
  return { ok: true, record };
}

/** Lokalna skala mm/px z odwrotnej homografii, uśredniona po punktach obrazu. */
function localMmPerPixel(inverse: Homography, imagePointsPx: ImagePointPx[]): number {
  const samples: number[] = [];
  for (const p of imagePointsPx) {
    const c = applyInverse(inverse, p.u, p.v);
    const du = applyInverse(inverse, p.u + 1, p.v);
    const dv = applyInverse(inverse, p.u, p.v + 1);
    if (!c || !du || !dv) continue;
    const sx = Math.hypot(du.x - c.x, du.y - c.y);
    const sy = Math.hypot(dv.x - c.x, dv.y - c.y);
    samples.push((sx + sy) / 2);
  }
  if (samples.length === 0) return 1;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] || 1;
}

// ---------------------------------------------------------------------------
// DZIEDZICZENIE KALIBRACJI MIĘDZY FILMAMI (potwierdzenie zgodności sceny)
// ---------------------------------------------------------------------------

/** Wynik próby odziedziczenia kalibracji na drugi film. */
export type CalibrationInheritance =
  | { ok: true; reasons: string[] }
  | { ok: false; code: "CAMERA_SETUP_CHANGED"; reasons: string[] };

/**
 * Buduje podpis sceny z rekordu kalibracji (deterministycznie).
 * Rotacja liczona z linii wybicia (lub pierwszych dwóch punktów obrazu).
 */
export function sceneSignatureFromRecord(
  record: CalibrationRecord,
  frameConfigHash: string,
  backgroundHash = "",
): SceneSignature {
  const line = record.takeoffLinePx ?? [record.imagePointsPx[0], record.imagePointsPx[1]];
  const rotationDeg =
    line[0] && line[1]
      ? round((Math.atan2(line[1].v - line[0].v, line[1].u - line[0].u) * 180) / Math.PI, 2)
      : 0;
  const mmPerPixel = record.inverseHomographyMatrix
    ? round(localMmPerPixel(record.inverseHomographyMatrix, record.imagePointsPx), 4)
    : 0;
  return {
    markerPointsPx: [...record.imagePointsPx].sort((a, b) =>
      a.u === b.u ? a.v - b.v : a.u - b.u,
    ),
    backgroundHash,
    mmPerPixel,
    rotationDeg,
    frameConfigHash,
  };
}

/**
 * Czy kalibrację jednego filmu można ODZIEDZICZYĆ na drugi film.
 * Wymaga potwierdzonej zgodności sceny: markery, tło, skala, obrót i kadr.
 * Każda istotna zmiana → CAMERA_SETUP_CHANGED i nowa kalibracja.
 */
export function canInheritCalibration(
  source: SceneSignature,
  candidate: SceneSignature,
  tolerance: {
    markerPx?: number;
    scaleRel?: number;
    rotationDeg?: number;
  } = {},
): CalibrationInheritance {
  const markerPx = tolerance.markerPx ?? 8;
  const scaleRel = tolerance.scaleRel ?? 0.05;
  const rotationDeg = tolerance.rotationDeg ?? 2;
  const reasons: string[] = [];

  if (source.frameConfigHash !== candidate.frameConfigHash)
    reasons.push("Inny kadr (rozdzielczość/orientacja/FPS).");

  if (source.backgroundHash && candidate.backgroundHash && source.backgroundHash !== candidate.backgroundHash)
    reasons.push("Inne tło sceny.");

  const scaleDenom = source.mmPerPixel || 1;
  if (source.mmPerPixel > 0 && candidate.mmPerPixel > 0) {
    const rel = Math.abs(candidate.mmPerPixel - source.mmPerPixel) / scaleDenom;
    if (rel > scaleRel) reasons.push("Inna skala (mm/px).");
  }

  if (Math.abs(candidate.rotationDeg - source.rotationDeg) > rotationDeg)
    reasons.push("Inny obrót kadru.");

  const n = Math.min(source.markerPointsPx.length, candidate.markerPointsPx.length);
  if (n < MIN_GROUND_POINTS) {
    reasons.push("Za mało wspólnych markerów.");
  } else {
    let maxShift = 0;
    for (let i = 0; i < n; i++) {
      const a = source.markerPointsPx[i];
      const b = candidate.markerPointsPx[i];
      maxShift = Math.max(maxShift, Math.hypot(b.u - a.u, b.v - a.v));
    }
    if (maxShift > markerPx) reasons.push("Przesunięte markery sceny.");
  }

  if (reasons.length > 0) return { ok: false, code: "CAMERA_SETUP_CHANGED", reasons };
  return { ok: true, reasons: ["Scena zgodna — kalibrację można odziedziczyć."] };
}
