/**
 * Measurement Accuracy Layer — warstwa rzetelności pomiaru dla Vision Lab.
 *
 * Rozdziela pięć pojęć, które nie są tym samym:
 *  1. precision   — liczba miejsc po przecinku w prezentacji,
 *  2. resolution  — rozdzielczość czasowa (FPS) i przestrzenna (mm/px),
 *  3. repeatability — powtarzalność ponownych analiz,
 *  4. uncertainty — rzeczywista niepewność pomiaru (±),
 *  5. validity    — zgodność z testem referencyjnym.
 *
 * Wszystkie funkcje są czyste i deterministyczne (bez DOM, losowości, czasu).
 * NIE deklarujemy dokładności, której dane wejściowe nie zapewniają.
 */

import { round } from "./physics";

export const GRAVITY_STANDARD = 9.80665;

/** Poziomy jakości pomiaru. LAB_GRADE wymaga walidacji z urządzeniem referencyjnym. */
export type QualityTier =
  | "LAB_GRADE"
  | "HIGH_ACCURACY"
  | "STANDARD_ESTIMATE"
  | "INSUFFICIENT_QUALITY";

/** Status powtarzalności / kalibracji / walidacji. */
export type RepeatabilityStatus = "verified" | "assumed" | "unknown";
export type CalibrationStatus =
  | "not_required"
  | "calibrated"
  | "required"
  | "unstable"
  | "error_too_high";
export type ValidationStatus = "official" | "unofficial" | "reference_required";

/** Kody błędów warstwy pomiarowej. */
export type MeasurementErrorCode =
  | "TEMPORAL_RESOLUTION_TOO_LOW"
  | "SPATIAL_RESOLUTION_TOO_LOW"
  | "CALIBRATION_REQUIRED"
  | "CALIBRATION_UNSTABLE"
  | "CALIBRATION_ERROR_TOO_HIGH"
  | "MOTION_BLUR_TOO_HIGH"
  | "FRAME_RATE_TOO_LOW"
  | "RESULT_UNCERTAINTY_TOO_HIGH"
  | "MEASUREMENT_NOT_OFFICIAL"
  | "REFERENCE_VALIDATION_REQUIRED";

export const MEASUREMENT_ERROR_LABELS: Record<MeasurementErrorCode, string> = {
  TEMPORAL_RESOLUTION_TOO_LOW: "Zbyt niska rozdzielczość czasowa (FPS) dla dokładnego pomiaru.",
  SPATIAL_RESOLUTION_TOO_LOW: "Zbyt niska rozdzielczość przestrzenna (mm/piksel).",
  CALIBRATION_REQUIRED: "Ten test wymaga kalibracji przestrzeni.",
  CALIBRATION_UNSTABLE: "Kalibracja niestabilna — kamera lub markery poruszały się.",
  CALIBRATION_ERROR_TOO_HIGH: "Błąd reprojekcji kalibracji zbyt wysoki.",
  MOTION_BLUR_TOO_HIGH: "Zbyt duże rozmycie ruchu.",
  FRAME_RATE_TOO_LOW: "Zbyt niskie FPS dla tego testu.",
  RESULT_UNCERTAINTY_TOO_HIGH: "Niepewność wyniku przekracza dopuszczalny limit testu.",
  MEASUREMENT_NOT_OFFICIAL: "Pomiar nie spełnia warunków wyniku oficjalnego.",
  REFERENCE_VALIDATION_REQUIRED: "Wymagana walidacja z urządzeniem referencyjnym.",
};

/** Wymagania FPS dla testów skoków pionowych (i pochodnych). */
export interface FpsPolicy {
  official: number; // preferowane FPS trybu oficjalnego
  allowed: number; // minimum z podwyższoną niepewnością
  estimateOnly: number; // poniżej — tylko estymacja
}

export const JUMP_FPS_POLICY: FpsPolicy = {
  official: 240,
  allowed: 120,
  estimateOnly: 60,
};

export const SPRINT_FPS_POLICY: FpsPolicy = {
  official: 120,
  allowed: 60,
  estimateOnly: 30,
};

// ---------------------------------------------------------------------------
// TemporalResolutionCalculator
// ---------------------------------------------------------------------------

export interface TemporalResolution {
  /** Zmierzone FPS z rzeczywistych timestampów klatek. */
  measuredFps: number;
  /** Mediana odstępu między kolejnymi klatkami (ms). */
  frameIntervalMs: number;
  /** Rozdzielczość czasowa = połowa odstępu klatek (najlepszy możliwy błąd). */
  temporalResolutionMs: number;
  /** Czy pomiar FPS jest wiarygodny (min. 3 przedziały). */
  reliable: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Liczy rozdzielczość czasową z RZECZYWISTYCH timestampów klatek (mikrosekundy),
 * nie z deklarowanego FPS. Odstęp = mediana różnic sourceTimestampUs.
 */
export function calcTemporalResolution(sourceTimestampsUs: number[]): TemporalResolution {
  const clean = sourceTimestampsUs.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    const d = clean[i] - clean[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length < 2) {
    return { measuredFps: 0, frameIntervalMs: 0, temporalResolutionMs: Infinity, reliable: false };
  }
  const medUs = median(diffs);
  const frameIntervalMs = medUs / 1000;
  const measuredFps = frameIntervalMs > 0 ? 1000 / frameIntervalMs : 0;
  return {
    measuredFps: round(measuredFps, 1),
    frameIntervalMs: round(frameIntervalMs, 3),
    temporalResolutionMs: round(frameIntervalMs / 2, 3),
    reliable: diffs.length >= 3,
  };
}

// ---------------------------------------------------------------------------
// SpatialResolutionCalculator
// ---------------------------------------------------------------------------

export interface SpatialInput {
  /** Piksele między dwoma punktami referencyjnymi. */
  referencePixels: number;
  /** Rzeczywisty dystans między nimi (mm). */
  referenceMillimeters: number;
}

export interface SpatialResolution {
  mmPerPixel: number;
  /** Najlepszy możliwy błąd przestrzenny (±1 px w mm). */
  spatialResolutionMm: number;
  reliable: boolean;
}

export function calcSpatialResolution(input: SpatialInput | null): SpatialResolution | null {
  if (!input || input.referencePixels <= 0 || input.referenceMillimeters <= 0) return null;
  const mmPerPixel = input.referenceMillimeters / input.referencePixels;
  return {
    mmPerPixel: round(mmPerPixel, 4),
    spatialResolutionMm: round(mmPerPixel, 4),
    reliable: input.referencePixels >= 50,
  };
}

// ---------------------------------------------------------------------------
// CalibrationQualityValidator
// ---------------------------------------------------------------------------

export interface CalibrationQuality {
  status: CalibrationStatus;
  reprojectionErrorPx: number | null;
  errors: MeasurementErrorCode[];
}

export interface CalibrationQualityInput {
  required: boolean;
  present: boolean;
  reprojectionErrorPx?: number | null;
  markerStablePx?: number | null; // maksymalny ruch markera między klatkami (px)
  maxReprojectionErrorPx?: number;
  maxMarkerMovementPx?: number;
}

export function validateCalibrationQuality(input: CalibrationQualityInput): CalibrationQuality {
  const errors: MeasurementErrorCode[] = [];
  if (!input.required) {
    return { status: "not_required", reprojectionErrorPx: null, errors };
  }
  if (!input.present) {
    errors.push("CALIBRATION_REQUIRED");
    return { status: "required", reprojectionErrorPx: null, errors };
  }
  const maxRepro = input.maxReprojectionErrorPx ?? 2.0;
  const maxMove = input.maxMarkerMovementPx ?? 1.5;
  const repro = input.reprojectionErrorPx ?? null;
  if (input.markerStablePx != null && input.markerStablePx > maxMove) {
    errors.push("CALIBRATION_UNSTABLE");
    return { status: "unstable", reprojectionErrorPx: repro, errors };
  }
  if (repro != null && repro > maxRepro) {
    errors.push("CALIBRATION_ERROR_TOO_HIGH");
    return { status: "error_too_high", reprojectionErrorPx: repro, errors };
  }
  return { status: "calibrated", reprojectionErrorPx: repro, errors };
}

// ---------------------------------------------------------------------------
// MeasurementUncertaintyCalculator
// ---------------------------------------------------------------------------

export interface EventUncertaintyInput {
  frameIntervalMs: number;
  /** Residual dopasowania interpolacji sub-klatkowej (ms). */
  interpolationResidualMs?: number;
  /** Stabilność detekcji zdarzenia między próbami (ms). */
  detectionStabilityMs?: number;
}

/**
 * Konserwatywna niepewność pojedynczego zdarzenia (ms).
 * eventUncertaintyMs = max(frameInterval/2, interpolationResidual, detectionStability)
 */
export function eventUncertaintyMs(input: EventUncertaintyInput): number {
  const base = input.frameIntervalMs / 2;
  const residual = input.interpolationResidualMs ?? 0;
  const stability = input.detectionStabilityMs ?? 0;
  return round(Math.max(base, residual, stability), 3);
}

/** Niepewność czasu lotu / czasu sprintu = suma niepewności dwóch zdarzeń. */
export function summedTimeUncertaintyMs(startMs: number, finishMs: number): number {
  return round(startMs + finishMs, 3);
}

/**
 * Propagacja niepewności czasu lotu do wysokości skoku (Flight Time Method).
 * h = g·t²/8  →  dh/dt = g·t/4  →  Δh = (g·t/4)·Δt
 */
export function jumpHeightUncertaintyCm(
  flightTimeSeconds: number,
  flightTimeUncertaintySeconds: number,
): number {
  const dhdt = (GRAVITY_STANDARD * flightTimeSeconds) / 4; // m/s
  const meters = dhdt * flightTimeUncertaintySeconds;
  return round(meters * 100, 2);
}

/** Niepewność dystansu (mm) z sumy niezależnych źródeł (RSS). */
export function distanceUncertaintyMm(sourcesMm: number[]): number {
  const sumSq = sourcesMm.reduce((acc, s) => acc + s * s, 0);
  return round(Math.sqrt(sumSq), 2);
}

/** Niepewność prędkości z propagacji dystansu i czasu. v=d/t */
export function speedUncertaintyMps(
  distanceM: number,
  distanceUncM: number,
  timeS: number,
  timeUncS: number,
): number {
  if (timeS <= 0) return Infinity;
  const rel = Math.sqrt((distanceUncM / distanceM) ** 2 + (timeUncS / timeS) ** 2);
  return round((distanceM / timeS) * rel, 3);
}

// ---------------------------------------------------------------------------
// ResultPrecisionFormatter
// ---------------------------------------------------------------------------

/** Liczba miejsc po przecinku dopasowana do niepewności (nie odwrotnie). */
export function precisionFromUncertainty(uncertainty: number): number {
  if (!Number.isFinite(uncertainty) || uncertainty <= 0) return 2;
  // Wyświetlamy tyle miejsc, by ostatnia cyfra była zgodna z rzędem niepewności.
  const magnitude = Math.floor(Math.log10(uncertainty));
  const digits = magnitude >= 0 ? 0 : Math.min(3, -magnitude);
  return digits;
}

export interface FormattedResult {
  value: number;
  uncertainty: number;
  unit: string;
  displayPrecision: number;
  /** np. "35.9 ± 0.8" */
  display: string;
  /** np. "35.9 ± 0.8 cm" */
  displayWithUnit: string;
}

export function formatResult(value: number, uncertainty: number, unit: string): FormattedResult {
  const displayPrecision = precisionFromUncertainty(uncertainty);
  const v = value.toFixed(displayPrecision);
  const u = uncertainty > 0 ? uncertainty.toFixed(Math.max(displayPrecision, 1)) : null;
  const display = u ? `${v} ± ${u}` : v;
  return {
    value: round(value, displayPrecision),
    uncertainty: round(uncertainty, 3),
    unit,
    displayPrecision,
    display,
    displayWithUnit: u ? `${v} ± ${u} ${unit}`.trim() : `${v} ${unit}`.trim(),
  };
}

// ---------------------------------------------------------------------------
// OfficialResultValidator + MeasurementAccuracyEngine
// ---------------------------------------------------------------------------

export interface AccuracyEngineInput {
  domain: "temporal" | "spatial"; // czy główny wynik jest czasowy czy przestrzenny
  fpsPolicy: FpsPolicy;
  temporal: TemporalResolution;
  spatial?: SpatialResolution | null;
  calibration: CalibrationQuality;
  /** Względna niepewność wyniku (0-1), np. Δh/h albo Δt/t. */
  relativeUncertainty: number;
  /** Maksymalna dopuszczalna względna niepewność wyniku oficjalnego. */
  maxRelativeUncertainty: number;
  /** Powtarzalność potwierdzona testem (10× ten sam plik). */
  repeatability: RepeatabilityStatus;
  /** Czy protokół testu został rozpoznany i zgadza się. */
  protocolMatch: boolean;
  /** Czy istnieje walidacja z urządzeniem referencyjnym. */
  referenceValidated: boolean;
}

export interface MeasurementAccuracy {
  qualityTier: QualityTier;
  repeatabilityStatus: RepeatabilityStatus;
  calibrationStatus: CalibrationStatus;
  validationStatus: ValidationStatus;
  officialResult: boolean;
  errors: MeasurementErrorCode[];
  sourceFrameRate: number;
  frameIntervalMs: number;
  temporalResolutionMs: number;
  spatialResolutionMmPerPixel: number | null;
  relativeUncertainty: number;
}

/**
 * Orkiestrator: łączy rozdzielczość, kalibrację, niepewność i powtarzalność
 * w jeden poziom jakości. NIGDY nie przyznaje LAB_GRADE bez walidacji
 * referencyjnej.
 */
export function computeMeasurementAccuracy(input: AccuracyEngineInput): MeasurementAccuracy {
  const errors: MeasurementErrorCode[] = [...input.calibration.errors];
  const fps = input.temporal.measuredFps;

  // Rozdzielczość czasowa.
  if (fps > 0 && fps < input.fpsPolicy.estimateOnly) {
    errors.push("FRAME_RATE_TOO_LOW");
  }
  if (!input.temporal.reliable) {
    errors.push("TEMPORAL_RESOLUTION_TOO_LOW");
  }

  // Rozdzielczość przestrzenna dla testów przestrzennych.
  if (input.domain === "spatial") {
    if (!input.spatial) {
      if (!errors.includes("CALIBRATION_REQUIRED")) errors.push("CALIBRATION_REQUIRED");
    } else if (!input.spatial.reliable) {
      errors.push("SPATIAL_RESOLUTION_TOO_LOW");
    }
  }

  // Niepewność wyniku.
  if (input.relativeUncertainty > input.maxRelativeUncertainty) {
    errors.push("RESULT_UNCERTAINTY_TOO_HIGH");
  }

  const hardBlock =
    errors.includes("FRAME_RATE_TOO_LOW") ||
    errors.includes("CALIBRATION_REQUIRED") ||
    errors.includes("CALIBRATION_UNSTABLE") ||
    errors.includes("CALIBRATION_ERROR_TOO_HIGH") ||
    errors.includes("RESULT_UNCERTAINTY_TOO_HIGH") ||
    errors.includes("TEMPORAL_RESOLUTION_TOO_LOW") ||
    !input.protocolMatch;

  // Poziom jakości.
  let qualityTier: QualityTier;
  if (hardBlock) {
    qualityTier = "INSUFFICIENT_QUALITY";
  } else if (
    input.referenceValidated &&
    fps >= input.fpsPolicy.official &&
    input.repeatability === "verified"
  ) {
    qualityTier = "LAB_GRADE";
  } else if (fps >= input.fpsPolicy.allowed && input.repeatability !== "unknown") {
    qualityTier = "HIGH_ACCURACY";
  } else {
    qualityTier = "STANDARD_ESTIMATE";
  }

  // Walidacja / oficjalność.
  let validationStatus: ValidationStatus;
  if (!input.referenceValidated && qualityTier === "LAB_GRADE") {
    // niemożliwe z definicji powyżej, ale zabezpieczenie
    validationStatus = "reference_required";
  } else if (qualityTier === "INSUFFICIENT_QUALITY") {
    validationStatus = "unofficial";
    if (!errors.includes("MEASUREMENT_NOT_OFFICIAL")) errors.push("MEASUREMENT_NOT_OFFICIAL");
  } else {
    validationStatus = "official";
  }

  const officialResult =
    validationStatus === "official" &&
    input.protocolMatch &&
    (input.calibration.status === "calibrated" || input.calibration.status === "not_required") &&
    input.relativeUncertainty <= input.maxRelativeUncertainty &&
    input.repeatability === "verified" &&
    fps >= input.fpsPolicy.allowed;

  return {
    qualityTier,
    repeatabilityStatus: input.repeatability,
    calibrationStatus: input.calibration.status,
    validationStatus,
    officialResult,
    errors: [...new Set(errors)],
    sourceFrameRate: fps,
    frameIntervalMs: input.temporal.frameIntervalMs,
    temporalResolutionMs: input.temporal.temporalResolutionMs,
    spatialResolutionMmPerPixel: input.spatial?.mmPerPixel ?? null,
    relativeUncertainty: round(input.relativeUncertainty, 4),
  };
}

/** Czytelne etykiety poziomów jakości (PL) do UI zawodnika. */
export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  LAB_GRADE: "Jakość laboratoryjna (zwalidowana)",
  HIGH_ACCURACY: "Wysoka jakość pomiaru",
  STANDARD_ESTIMATE: "Estymacja na podstawie filmu",
  INSUFFICIENT_QUALITY: "Niewystarczająca jakość pomiaru",
};
