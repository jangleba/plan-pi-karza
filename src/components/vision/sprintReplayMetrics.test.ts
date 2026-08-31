import { describe, expect, it } from "vitest";
import type { SprintPerformanceScan } from "@/features/vision-analysis/sprint/types";
import { buildSprintReplayMetrics } from "./sprintReplayMetrics";

function scan(): SprintPerformanceScan {
  return {
    version: "test",
    protocol: "sprint_20m",
    timingAvailable: true,
    splits: [
      {
        role: "FINISH",
        label: "Meta",
        distanceM: 20,
        cumulativeTimeS: 3.12,
        segmentTimeS: 3.12,
        segmentSpeedMs: 6.41,
        segmentSpeedKmh: 23.08,
        cumulativeUncertaintyS: 0.017,
        frameBeforeIndex: 183,
        frameAfterIndex: 184,
      },
    ],
    velocityProfile: {
      basis: "calibrated_splits",
      segments: 3,
      peakSegmentSpeedMs: 8.22,
      peakSegmentSpeedKmh: 29.59,
      peakSegmentLabel: "Split 15 m",
      peakAtLastSegment: false,
    },
    splitsBlockedBy: null,
    phases: [],
    mechanics: {
      availability: "AVAILABLE",
      metrics: [],
      framesUsed: 20,
      medianSilhouetteFraction: 0.4,
      medianVisibility: 0.8,
    },
    limiter: null,
    limiterReason: "Za mało danych do wskazania limitera",
    recommendation: null,
    needsCloseUpForMechanics: false,
  };
}

describe("buildSprintReplayMetrics", () => {
  it("pokazuje tylko zmierzone wartości wraz z ich podstawą", () => {
    const metrics = buildSprintReplayMetrics({
      mainResultValue: 3.12,
      mainResultUnit: "s",
      fps: 60,
      fpsSource: "measured",
      frameDerived: { sprintTime: 3.12, speedKmh: 23.08 },
      measuredMetrics: [],
      sprintScan: scan(),
    });

    expect(metrics).toEqual([
      {
        kind: "time",
        label: "Czas próby",
        value: "3.12",
        unit: "s",
        detail: "niepewność ±17 ms",
      },
      {
        kind: "average_speed",
        label: "Średnia prędkość",
        value: "23.1",
        unit: "km/h",
        detail: "dla zmierzonego odcinka",
      },
      {
        kind: "peak_segment",
        label: "Najszybszy odcinek",
        value: "29.6",
        unit: "km/h",
        detail: "Split 15 m",
      },
      {
        kind: "fps",
        label: "Źródło",
        value: "60",
        unit: "FPS",
        detail: "zmierzone z klatek",
      },
    ]);
  });

  it("pomija czas i prędkość, gdy pipeline ich nie dostarczył", () => {
    const noMeasurements = scan();
    noMeasurements.splits = [];
    noMeasurements.velocityProfile = null;
    noMeasurements.timingAvailable = false;

    expect(
      buildSprintReplayMetrics({
        mainResultValue: null,
        mainResultUnit: null,
        fps: 30,
        fpsSource: "measured",
        frameDerived: null,
        measuredMetrics: [],
        sprintScan: noMeasurements,
      }),
    ).toEqual([
      {
        kind: "fps",
        label: "Źródło",
        value: "30",
        unit: "FPS",
        detail: "zmierzone z klatek",
      },
    ]);
  });

  it("nie pokazuje metryk czasowych dla technicznego fallbacku FPS", () => {
    expect(
      buildSprintReplayMetrics({
        mainResultValue: 3.12,
        mainResultUnit: "s",
        fps: 30,
        fpsSource: "fallback",
        frameDerived: { sprintTime: 3.12, speedKmh: 23.08 },
        measuredMetrics: [],
        sprintScan: scan(),
      }),
    ).toEqual([]);
  });
});
