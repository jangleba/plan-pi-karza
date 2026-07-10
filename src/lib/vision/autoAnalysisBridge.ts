import type {
  FrameAnalysisResult,
  FrameMarkerKey,
  FrameDerived,
  CalculationBasis,
  CalculationBasisItem,
} from "./types";
import type { VideoAnalysisResult } from "@/features/vision-analysis/types";
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

  const items: CalculationBasisItem[] = [
    { label: "Metoda", value: `Silnik analizy wideo (${analysis.analyzerVersion})` },
    { label: "FPS", value: `${analysis.videoMetadata.fps}` },
    { label: "Liczba klatek", value: `${analysis.videoMetadata.frameCount}` },
    { label: "Rozdzielczość", value: `${analysis.videoMetadata.width}×${analysis.videoMetadata.height}` },
    { label: "Pewność analizy", value: `${Math.round(analysis.overallConfidence * 100)}%` },
    ...analysis.keyEvents.map((e) => ({
      label: `Zdarzenie: ${e.type}`,
      value: `klatka ${e.frameIndex} · ${e.timestampSeconds.toFixed(3)} s`,
    })),
    ...analysis.metrics.map((m) => ({
      label: m.label,
      value: `${m.value} ${m.unit}`.trim(),
    })),
  ];

  const basis: CalculationBasis = {
    method: analysis.analyzerVersion,
    coachVerifiedFrames: false,
    items,
  };

  return {
    testId: analysis.testType,
    category: test?.category ?? "jump",
    fps: analysis.videoMetadata.fps,
    markers,
    manual: {},
    status: "frame_verified",
    error: null,
    mainResultValue: primary?.value ?? null,
    mainResultUnit: primary?.unit ?? null,
    method: `Video Analysis Engine (${analysis.analyzerVersion})`,
    markedBy: "ai",
    derived,
    basis,
  };
}
