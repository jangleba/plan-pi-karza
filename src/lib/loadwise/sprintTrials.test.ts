import { describe, expect, it } from "vitest";
import { bestComparableTrial, compareTrials, trialConditions } from "./sprintTrials";
import type { HistorySetLog } from "./setLogHistory";

const trial = (patch: Partial<HistorySetLog> = {}): HistorySetLog => ({
  setNumber: 1,
  weightKg: null,
  reps: null,
  rir: null,
  metricKind: "sprint_manual",
  metricValue: 3.2,
  distanceM: 20,
  startType: "standing",
  measurementMethod: "manual_stopwatch",
  ...patch,
});

describe("sprint trial comparison", () => {
  it("compares only trials with the same distance, kind of start and measurement method", () => {
    expect(compareTrials(trial(), trial({ metricValue: 3.1 }))).toEqual({ comparable: true });
    expect(compareTrials(trial(), trial({ distanceM: 30 }))).toEqual({
      comparable: false,
      reason: "distance",
    });
    expect(compareTrials(trial(), trial({ startType: "flying" }))).toEqual({
      comparable: false,
      reason: "start",
    });
    expect(compareTrials(trial(), trial({ measurementMethod: "video_reviewed" }))).toEqual({
      comparable: false,
      reason: "method",
    });
  });
  it("historical trials without metadata are never assumed comparable", () => {
    const legacy = trial({ distanceM: null, startType: null, measurementMethod: null });
    expect(trialConditions(legacy)).toBeNull();
    expect(compareTrials(trial(), legacy)).toEqual({
      comparable: false,
      reason: "unknown_conditions",
    });
    expect(compareTrials(legacy, legacy)).toEqual({
      comparable: false,
      reason: "unknown_conditions",
    });
  });
  it("a non-sprint metric is not a sprint trial", () => {
    expect(trialConditions(trial({ metricKind: "completion" }))).toBeNull();
  });
  it("picks the fastest comparable earlier trial and counts the skipped ones", () => {
    const earlier = [
      trial({ setNumber: 1, metricValue: 3.4 }),
      trial({ setNumber: 2, metricValue: 3.0, distanceM: 30 }), // faster but another distance
      trial({ setNumber: 3, metricValue: 3.3 }),
      trial({ setNumber: 4, metricValue: 2.9, measurementMethod: "video_reviewed" }),
      trial({
        setNumber: 5,
        metricValue: 3.1,
        distanceM: null,
        startType: null,
        measurementMethod: null,
      }),
    ];
    const { best, skipped } = bestComparableTrial(trial(), earlier);
    expect(best?.metricValue).toBe(3.3);
    expect(skipped).toBe(3);
  });
});
