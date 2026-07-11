/**
 * Calibration Profiles — profile kalibracji przestrzennej Vision Lab.
 *
 * Kalibracja NIE jest jedną globalną wartością. Zależy od:
 *  - urządzenia (model telefonu / kamery),
 *  - obiektywu (główny / ultraszeroki / tele / zewnętrzny),
 *  - orientacji (pion / poziom),
 *  - trybu nagrania (FPS) oraz zoomu.
 *
 * Każda kombinacja ma osobny profil, bo zmienia geometrię obrazu
 * (ogniskowa, dystorsja, skala). Profil przechowuje homografię obraz→świat,
 * błąd reprojekcji (reprojectionError) oraz mmPerPixel wyznaczone z realnych
 * punktów referencyjnych.
 *
 * Wszystkie funkcje matematyczne są czyste i deterministyczne (bez DOM).
 */

import { round } from "./physics";
import {
  validateCalibrationQuality,
  type CalibrationQuality,
} from "./measurementAccuracy";

/** Typ obiektywu kamery. */
export type LensType = "wide" | "ultrawide" | "tele" | "external" | "unknown";

/** Orientacja nagrania. */
export type CaptureOrientation = "portrait" | "landscape";

export const LENS_LABELS: Record<LensType, string> = {
  wide: "Główny (1x)",
  ultrawide: "Ultraszeroki (0.5x)",
  tele: "Teleobiektyw (2x+)",
  external: "Zewnętrzna kamera",
  unknown: "Nieznany",
};

export const ORIENTATION_LABELS: Record<CaptureOrientation, string> = {
  portrait: "Pion",
  landscape: "Poziom",
};

/**
 * Wersja formatu kalibracji. Profil może zostać użyty wyłącznie, gdy jego
 * calibrationVersion zgadza się z bieżącą — inaczej geometria mogła się zmienić.
 */
export const CALIBRATION_VERSION = 2;

/** Klucz identyfikujący jednoznacznie kombinację warunków nagrania. */
export interface CalibrationKeyParts {
  deviceId: string; // model urządzenia / fingerprint
  lens: LensType;
  orientation: CaptureOrientation;
  fps: number;
  /** Zoom cyfrowy/optyczny (1 = brak). Zaokrąglany do 0.1. */
  zoom: number;
  /** Aparat przedni / tylny. */
  facing?: "front" | "back";
  /** Rozdzielczość nagrania "WxH". */
  resolution?: string;
  /** Wersja formatu kalibracji. */
  calibrationVersion?: number;
}

/**
 * Buduje stabilny, deterministyczny klucz profilu. Wszystkie parametry
 * wpływające na geometrię obrazu wchodzą do klucza — inny zestaw = inny profil.
 */
export function calibrationKey(parts: CalibrationKeyParts): string {
  const device = normalizeSegment(parts.deviceId);
  const zoom = round(parts.zoom > 0 ? parts.zoom : 1, 1);
  const fps = Math.round(parts.fps);
  const facing = parts.facing ?? "back";
  const resolution = parts.resolution ?? "any";
  const version = parts.calibrationVersion ?? CALIBRATION_VERSION;
  return `v${version}|${device}|${facing}|${parts.lens}|${parts.orientation}|${resolution}|${fps}fps|${zoom}x`;
}

/**
 * ŚCISŁE dopasowanie profilu: wyłącznie pełna zgodność wszystkich parametrów
 * (urządzenie, aparat, obiektyw, orientacja, rozdzielczość, FPS, zoom, wersja).
 * NIE dobiera „najbliższego” profilu — zwraca null przy jakiejkolwiek różnicy.
 */
export function matchCalibrationStrict(
  profiles: CalibrationProfile[],
  parts: CalibrationKeyParts,
): CalibrationProfile | null {
  const key = calibrationKey(parts);
  return profiles.find((p) => p.key === key) ?? null;
}

/** Wynik dopasowania profilu do bieżącego nagrania. */
export interface CalibrationMatch {
  profile: CalibrationProfile;
  /** Czy profil pasuje dokładnie (to samo urządzenie, obiektyw, orientacja, FPS, zoom). */
  exact: boolean;
  /** Trafność dopasowania 0-1 (1 = dokładne). */
  score: number;
  /** Czytelne powody obniżenia trafności (PL). */
  reasons: string[];
}

/**
 * Wybiera najtrafniejszy profil kalibracji dla bieżącego nagrania.
 *
 * Twarde wymagania (inaczej profil jest niewiarygodny geometrycznie):
 *  - to samo urządzenie,
 *  - ten sam obiektyw,
 *  - ta sama orientacja.
 *
 * Miękkie: FPS i zoom — różnice obniżają trafność, bo mogą zmieniać kadr/skalę
 * (np. tryb 240 FPS bywa przycięty). Zwraca null, gdy nie ma wiarygodnego profilu.
 */
export function matchCalibrationProfile(
  profiles: CalibrationProfile[],
  parts: CalibrationKeyParts,
): CalibrationMatch | null {
  const targetDevice = normalizeSegment(parts.deviceId);
  const targetZoom = round(parts.zoom > 0 ? parts.zoom : 1, 1);
  const targetFps = Math.round(parts.fps);

  const candidates = profiles.filter(
    (p) =>
      normalizeSegment(p.parts.deviceId) === targetDevice &&
      p.parts.lens === parts.lens &&
      p.parts.orientation === parts.orientation,
  );
  if (candidates.length === 0) return null;

  let best: CalibrationMatch | null = null;
  for (const profile of candidates) {
    const reasons: string[] = [];
    const fpsMatch = Math.round(profile.parts.fps) === targetFps;
    const zoomDiff = Math.abs(round(profile.parts.zoom, 1) - targetZoom);
    const zoomMatch = zoomDiff < 0.05;

    let score = 1;
    if (!fpsMatch) {
      score *= 0.85;
      reasons.push(`FPS profilu ${profile.parts.fps} ≠ nagrania ${targetFps}`);
    }
    if (!zoomMatch) {
      score *= Math.max(0.3, 1 - zoomDiff * 0.4);
      reasons.push(`Zoom profilu ${round(profile.parts.zoom, 1)}x ≠ nagrania ${targetZoom}x`);
    }

    const exact = fpsMatch && zoomMatch;
    const match: CalibrationMatch = { profile, exact, score: round(score, 3), reasons };

    if (
      !best ||
      match.score > best.score ||
      (match.score === best.score && match.exact && !best.exact) ||
      (match.score === best.score && match.profile.createdAt > best.profile.createdAt)
    ) {
      best = match;
    }
  }
  return best;
}

function normalizeSegment(v: string): string {
  return (v || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "unknown";
}

/** Para punktów: piksel obrazu ↔ współrzędna świata (mm, płaszczyzna). */
export interface CorrespondencePoint {
  /** Piksel obrazu (u,v). */
  image: { u: number; v: number };
  /** Rzeczywisty punkt na płaszczyźnie kalibracyjnej (mm). */
  world: { x: number; y: number };
}

/** Homografia 3×3 (world→image) w formie 9-elementowej tablicy wierszowej. */
export type Homography = [number, number, number, number, number, number, number, number, number];

/** Wynik dopasowania homografii. */
export interface HomographyFit {
  homography: Homography;
  /** Błąd reprojekcji RMS w pikselach. */
  reprojectionErrorPx: number;
  /** Maksymalny pojedynczy błąd reprojekcji (px). */
  maxResidualPx: number;
  /** Liczba użytych punktów. */
  pointCount: number;
}

/**
 * Rozwiązuje układ liniowy n×n metodą eliminacji Gaussa z częściowym pivotem.
 * Zwraca null gdy macierz jest osobliwa.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const solution: number[] = new Array(n);
  for (let i = 0; i < n; i++) solution[i] = M[i][n] / M[i][i];
  return solution;
}

/**
 * Dopasowuje homografię world→image metodą najmniejszych kwadratów (DLT),
 * z ograniczeniem h33 = 1. Wymaga min. 4 par punktów; przy >4 błąd reprojekcji
 * jest sensowny (uwzględnia dystorsję i niedokładność zaznaczeń).
 */
export function fitHomography(points: CorrespondencePoint[]): HomographyFit | null {
  if (points.length < 4) return null;

  // Układ: 8 niewiadomych (h0..h7), h8 = 1.
  const A: number[][] = [];
  const b: number[] = [];
  for (const p of points) {
    const { x, y } = p.world;
    const { u, v } = p.image;
    // u = (h0 x + h1 y + h2) / (h6 x + h7 y + 1)
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    // v = (h3 x + h4 y + h5) / (h6 x + h7 y + 1)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  // Równania normalne: (AᵀA) h = Aᵀb  (8×8).
  const n = 8;
  const AtA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb: number[] = new Array(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < n; i++) {
      Atb[i] += A[r][i] * b[r];
      for (let j = 0; j < n; j++) AtA[i][j] += A[r][i] * A[r][j];
    }
  }

  const h = solveLinearSystem(AtA, Atb);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;

  const H: Homography = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];

  // Błąd reprojekcji.
  let sumSq = 0;
  let maxResidual = 0;
  for (const p of points) {
    const proj = projectWorldToImage(H, p.world.x, p.world.y);
    if (!proj) return null;
    const du = proj.u - p.image.u;
    const dv = proj.v - p.image.v;
    const d = Math.sqrt(du * du + dv * dv);
    sumSq += d * d;
    if (d > maxResidual) maxResidual = d;
  }
  const rms = Math.sqrt(sumSq / points.length);

  return {
    homography: H,
    reprojectionErrorPx: round(rms, 3),
    maxResidualPx: round(maxResidual, 3),
    pointCount: points.length,
  };
}

/** Rzutuje punkt świata (mm) na piksel obrazu przez homografię. */
export function projectWorldToImage(
  H: Homography,
  x: number,
  y: number,
): { u: number; v: number } | null {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return {
    u: (H[0] * x + H[1] * y + H[2]) / w,
    v: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/**
 * Wyznacza mmPerPixel z homografii w środku płaszczyzny kalibracyjnej.
 * Skala lokalna = |d(world)/d(pixel)| — liczona numerycznie.
 */
export function mmPerPixelFromHomography(
  fit: HomographyFit,
  worldWidthMm: number,
  worldHeightMm: number,
): number {
  const H = fit.homography;
  const cx = worldWidthMm / 2;
  const cy = worldHeightMm / 2;
  const center = projectWorldToImage(H, cx, cy);
  const dx = projectWorldToImage(H, cx + 1, cy); // +1 mm w poziomie
  const dy = projectWorldToImage(H, cx, cy + 1); // +1 mm w pionie
  if (!center || !dx || !dy) return 0;
  const pxPerMmX = Math.hypot(dx.u - center.u, dx.v - center.v);
  const pxPerMmY = Math.hypot(dy.u - center.u, dy.v - center.v);
  const pxPerMm = (pxPerMmX + pxPerMmY) / 2;
  if (pxPerMm <= 0) return 0;
  return round(1 / pxPerMm, 4);
}

/** Zapisany profil kalibracji. */
export interface CalibrationProfile {
  id: string;
  key: string;
  parts: CalibrationKeyParts;
  deviceLabel: string;
  homography: Homography;
  reprojectionErrorPx: number;
  maxResidualPx: number;
  mmPerPixel: number;
  pointCount: number;
  worldWidthMm: number;
  worldHeightMm: number;
  createdAt: string;
  quality: CalibrationQuality;
}

/** Maksymalny akceptowalny błąd reprojekcji dla profilu (px). */
export const MAX_PROFILE_REPROJECTION_ERROR_PX = 2.0;

/** Ocena jakości dopasowania jako gotowy CalibrationQuality. */
export function assessCalibrationFit(
  fit: HomographyFit,
  maxReprojectionErrorPx = MAX_PROFILE_REPROJECTION_ERROR_PX,
): CalibrationQuality {
  return validateCalibrationQuality({
    required: true,
    present: true,
    reprojectionErrorPx: fit.reprojectionErrorPx,
    maxReprojectionErrorPx,
  });
}

/** Czy dopasowanie jest wystarczająco dobre, by zapisać profil. */
export function isFitAcceptable(
  fit: HomographyFit,
  maxReprojectionErrorPx = MAX_PROFILE_REPROJECTION_ERROR_PX,
): boolean {
  return fit.reprojectionErrorPx <= maxReprojectionErrorPx;
}

/** Buduje profil z dopasowania (bez zapisu — czysta funkcja). */
export function buildCalibrationProfile(input: {
  parts: CalibrationKeyParts;
  deviceLabel: string;
  fit: HomographyFit;
  worldWidthMm: number;
  worldHeightMm: number;
  maxReprojectionErrorPx?: number;
  now?: string;
  id?: string;
}): CalibrationProfile {
  const key = calibrationKey(input.parts);
  const quality = assessCalibrationFit(input.fit, input.maxReprojectionErrorPx);
  return {
    id: input.id ?? key,
    key,
    parts: { ...input.parts, zoom: round(input.parts.zoom > 0 ? input.parts.zoom : 1, 1) },
    deviceLabel: input.deviceLabel,
    homography: input.fit.homography,
    reprojectionErrorPx: input.fit.reprojectionErrorPx,
    maxResidualPx: input.fit.maxResidualPx,
    mmPerPixel: mmPerPixelFromHomography(input.fit, input.worldWidthMm, input.worldHeightMm),
    pointCount: input.fit.pointCount,
    worldWidthMm: input.worldWidthMm,
    worldHeightMm: input.worldHeightMm,
    createdAt: input.now ?? new Date().toISOString(),
    quality,
  };
}
