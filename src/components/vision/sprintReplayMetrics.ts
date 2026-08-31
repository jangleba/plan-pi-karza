import type { SprintPerformanceScan } from "@/features/vision-analysis/sprint/types";
import type { FrameDerived, VisionMetric } from "@/lib/vision/types";

export type SprintReplayMetricKind = "time" | "average_speed" | "peak_segment" | "fps";

export interface SprintReplayMetric {
  kind: SprintReplayMetricKind;
  label: string;
  value: string;
  unit: string;
  detail?: string;
}

export interface SprintReplayMetricInput {
  mainResultValue: number | null;
  mainResultUnit: string | null;
  fps: number | null;
  fpsSource?: "measured" | "declared" | "fallback";
  frameDerived?: FrameDerived | null;
  measuredMetrics: VisionMetric[];
  sprintScan: SprintPerformanceScan;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function metricValue(metrics: VisionMetric[], keys: string[]): number | null {
  const metric = metrics.find((candidate) => keys.includes(candidate.key));
  return finite(metric?.value) ? metric.value : null;
}

/**
 * Buduje HUD powtórki wyłącznie z wartości zapisanych przez pipeline pomiarowy.
 * Brak pomiaru oznacza brak kafla — nigdy dekoracyjne zero ani estymację.
 */
export function buildSprintReplayMetrics(input: SprintReplayMetricInput): SprintReplayMetric[] {
  const metrics: SprintReplayMetric[] = [];
  const hasTrustedTimingSource = input.fpsSource === "measured" || input.fpsSource === "declared";
  const finalSplit = input.sprintScan.splits.at(-1) ?? null;
  const measuredTime =
    (finite(input.frameDerived?.sprintTime) ? input.frameDerived.sprintTime : null) ??
    metricValue(input.measuredMetrics, ["sprint_time_s"]) ??
    (input.mainResultUnit === "s" && finite(input.mainResultValue) ? input.mainResultValue : null);

  if (hasTrustedTimingSource && measuredTime != null) {
    metrics.push({
      kind: "time",
      label: "Czas próby",
      value: measuredTime.toFixed(2),
      unit: "s",
      ...(finite(finalSplit?.cumulativeUncertaintyS)
        ? { detail: `niepewność ±${Math.round(finalSplit.cumulativeUncertaintyS * 1000)} ms` }
        : {}),
    });
  }

  const averageSpeed =
    (finite(input.frameDerived?.speedKmh) ? input.frameDerived.speedKmh : null) ??
    metricValue(input.measuredMetrics, ["speed_km_h", "avg_speed_kmh", "avg_speed_km_h"]);
  if (hasTrustedTimingSource && averageSpeed != null) {
    metrics.push({
      kind: "average_speed",
      label: "Średnia prędkość",
      value: averageSpeed.toFixed(1),
      unit: "km/h",
      detail: "dla zmierzonego odcinka",
    });
  }

  const velocityProfile = input.sprintScan.velocityProfile;
  if (hasTrustedTimingSource && velocityProfile && finite(velocityProfile.peakSegmentSpeedKmh)) {
    metrics.push({
      kind: "peak_segment",
      label: "Najszybszy odcinek",
      value: velocityProfile.peakSegmentSpeedKmh.toFixed(1),
      unit: "km/h",
      detail: velocityProfile.peakSegmentLabel,
    });
  }

  if (hasTrustedTimingSource && finite(input.fps) && input.fps > 0) {
    metrics.push({
      kind: "fps",
      label: "Źródło",
      value: Math.round(input.fps).toString(),
      unit: "FPS",
      detail: input.fpsSource === "measured" ? "zmierzone z klatek" : "z ustawień nagrania",
    });
  }

  return metrics;
}
