import type {
  FrameAnalysisResult,
  FrameMarkerKey,
  FrameDerived,
  CalculationBasis,
  CalculationBasisItem,
} from "./types";
import type { VideoAnalysisResult } from "@/features/vision-analysis/types";
import { QUALITY_TIER_LABELS } from "@/features/vision-analysis/measurementAccuracy";
import { getVisionTest } from "./visionTests";

const EVENT_TO_MARKER: Record<string, FrameMarkerKey> = {
  takeoff: "takeoff_frame",
  landing: "landing_frame",
  start_crossing: "start_frame",
  finish_crossing: "finish_frame",
  braking_start: "braking_start_frame",
  stop: "stop_frame",
};

const METRIC_TO_DERIVED: Record<string, keyof FrameDerived> = {
  jump_height_cm: "jumpHeightCm",
  flight_time_s: "flightTime",
  sprint_time_s: "sprintTime",
  braking_time_s: "brakingTime",
  avg_speed_ms: "speedMs",
  avg_speed_kmh: "speedKmh",
  distance_cm: "distanceCm",
  contact_rhythm: "contactRhythm",
};

/**
 * Konwertuje wynik silnika analizy wideo na FrameAnalysisResult używany przez
 * warstwę zapisu. Wywoływane tylko dla wyników policzonych (status completed).
 */
export function analysisToFrameResult(analysis: VideoAnalysisResult): FrameAnalysisResult {
  const test = getVisionTest(analysis.testType);
  const markers: Partial<Record<FrameMarkerKey, number>> = {};
  const contacts = analysis.keyEvents.filter((e) => e.type === "ground_contact");
  if (contacts.length >= 2) {
    markers.first_contact_frame = contacts[0].frameIndex;
    markers.last_contact_frame = contacts[contacts.length - 1].frameIndex;
  }
  for (const e of analysis.keyEvents) {
    const key = EVENT_TO_MARKER[e.type];
    if (key) markers[key] = e.frameIndex;
  }

  const derived: FrameDerived = { frameCount: analysis.videoMetadata.frameCount };
  for (const m of analysis.metrics) {
    const key = METRIC_TO_DERIVED[m.key];
    if (key) (derived[key] as number) = m.value;
    if (m.key === "distance_cm") derived.distanceM = Math.round(m.value) / 100;
  }
  if (contacts.length > 0) derived.numberOfContacts = contacts.length;

  const primary = analysis.metrics[0] ?? null;

  const acc = analysis.measurement;
  const fpsSource: NonNullable<CalculationBasis["fpsSource"]> = analysis.videoMetadata.fpsMeasured
    ? "measured"
    : analysis.videoMetadata.declaredFps != null && analysis.videoMetadata.declaredFps > 0
      ? "declared"
      : "fallback";
  const fpsLabel =
    fpsSource === "measured"
      ? "FPS (zmierzone z klatek)"
      : fpsSource === "declared"
        ? "FPS (z ustawień nagrania)"
        : "FPS (wartość robocza — niezweryfikowana)";
  const items: CalculationBasisItem[] = [
    { label: "Metoda", value: `Silnik analizy wideo (${analysis.analyzerVersion})` },
    {
      label: fpsLabel,
      value: acc ? `${acc.sourceFrameRate}` : `${analysis.videoMetadata.fps}`,
    },
    { label: "Liczba klatek", value: `${analysis.videoMetadata.frameCount}` },
    {
      label: "Rozdzielczość",
      value: `${analysis.videoMetadata.width}×${analysis.videoMetadata.height}`,
    },
    { label: "Pewność analizy", value: `${Math.round(analysis.overallConfidence * 100)}%` },
    ...(acc
      ? [
          { label: "Poziom jakości pomiaru", value: QUALITY_TIER_LABELS[acc.qualityTier] },
          { label: "Odstęp klatek (mediana)", value: `${acc.frameIntervalMs} ms` },
          { label: "Rozdzielczość czasowa", value: `± ${acc.temporalResolutionMs} ms` },
          ...(acc.spatialResolutionMmPerPixel != null
            ? [
                {
                  label: "Rozdzielczość przestrzenna",
                  value: `${acc.spatialResolutionMmPerPixel} mm/px`,
                },
              ]
            : []),
          {
            label: "Powtarzalność",
            value:
              acc.repeatabilityStatus === "verified"
                ? "Zweryfikowana (deterministyczna)"
                : acc.repeatabilityStatus,
          },
          { label: "Wynik oficjalny", value: acc.officialResult ? "Tak" : "Nie (estymacja)" },
        ]
      : []),
    ...(analysis.calibration
      ? [
          {
            label: "Kalibracja (homografia)",
            value: analysis.calibration.usedHomography
              ? "Użyta — pomiar przez skalibrowaną płaszczyznę podłoża"
              : "Nieużyta na tej ścieżce",
          },
          ...(analysis.calibration.profileId
            ? [{ label: "Profil kalibracji", value: analysis.calibration.profileId }]
            : []),
          ...(analysis.calibration.reprojectionErrorPx != null
            ? [
                {
                  label: "Błąd reprojekcji",
                  value: `${analysis.calibration.reprojectionErrorPx} px`,
                },
              ]
            : []),
          ...(analysis.calibration.homography
            ? [
                {
                  label: "Homografia (world→image)",
                  value: analysis.calibration.homography
                    .map((n) => Number(n).toPrecision(4))
                    .join(", "),
                },
              ]
            : []),
          ...(analysis.calibration.mismatchCode
            ? [{ label: "Kalibracja: blokada", value: analysis.calibration.mismatchCode }]
            : []),
        ]
      : []),
    ...analysis.keyEvents.map((e) => ({
      label: `Zdarzenie: ${e.type}`,
      value: `klatka ${e.frameIndex} · ${e.timestampSeconds.toFixed(3)} s`,
    })),
    ...analysis.metrics.map((m) => ({
      label: m.label,
      value: m.display ? `${m.display} ${m.unit}`.trim() : `${m.value} ${m.unit}`.trim(),
    })),
  ];

  const basis: CalculationBasis = {
    method: analysis.analyzerVersion,
    coachVerifiedFrames: false,
    fpsSource,
    items,
    // Scan zapisujemy tylko, gdy silnik faktycznie go policzył.
    ...(analysis.sprintScan ? { sprintScan: analysis.sprintScan } : {}),
  };

  return {
    testId: analysis.testType,
    category: test?.category ?? "jump",
    fps: analysis.videoMetadata.fps,
    markers,
    manual: {},
    status: analysis.measurement?.officialResult === false ? "estimated" : "frame_verified",
    error: null,
    mainResultValue: primary?.value ?? null,
    mainResultUnit: primary?.unit ?? null,
    method: `Video Analysis Engine (${analysis.analyzerVersion})`,
    markedBy: "ai",
    derived,
    basis,
  };
}
