import { describe, expect, it } from "vitest";
import {
  asymmetryPercent,
  bestSideAsymmetry,
  calculateLabMetrics,
  createAttemptPlan,
  createLabResult,
  FULL_PROFILE_TEST_IDS,
  isVisibleLabResult,
  summarizeResults,
} from "./engine";
import { captureFixture, resultFixture } from "./testFixtures";
import { validateCaptureTiming } from "./timing";
import { labResultSchema } from "./resultSchema";
import type { LabTestId } from "./types";

const measure = (testId: LabTestId, seconds: number, offset = 0) =>
  calculateLabMetrics({
    testId,
    firstFrame: 100,
    secondFrame: 100 + Math.round(seconds * 240),
    capture: captureFixture(240, 1600, offset),
  });

describe("LAB sample-timestamp measurements", () => {
  it.each([0, 8.123456])("calculates flight height at timestamp offset %s", (offset) => {
    const { metrics, quality } = measure("cmj", 0.5, offset);
    expect(metrics.flightTimeSeconds).toBeCloseTo(0.5, 10);
    expect(metrics.jumpHeightCm).toBeCloseTo(30.64578125, 8);
    expect(quality.protocolVersion).toBe("ballwise-lab-2.0");
    expect(quality.timing?.source).toBe("sample_pts");
    expect(quality.frameResolutionMs).toBeCloseTo(4.16666667, 7);
  });

  it("accepts the documented minimum single-leg flight time", () => {
    expect(measure("single_leg_cmj", 0.15).metrics.jumpHeightCm).toBeCloseTo(2.7581203125, 8);
  });

  it.each([
    ["sprint_10m", 2, 5, 18],
    ["flying_10m", 1.25, 8, 28.8],
  ] as const)("calculates average speed for %s", (testId, seconds, mps, kmh) => {
    const { metrics } = measure(testId, seconds);
    expect(metrics.elapsedSeconds).toBeCloseTo(seconds, 10);
    expect(metrics.distanceMeters).toBe(10);
    expect(metrics.averageSpeedMps).toBeCloseTo(mps, 10);
    expect(metrics.speedKmh).toBeCloseTo(kmh, 10);
  });

  it("uses real timestamps even when sample intervals vary below the gap limit", () => {
    const capture = captureFixture();
    capture.frameTimestampsSeconds[220] += 0.001;
    const { metrics } = calculateLabMetrics({
      testId: "cmj",
      firstFrame: 100,
      secondFrame: 220,
      capture,
    });
    expect(metrics.elapsedSeconds).toBeCloseTo(0.501, 10);
    expect(metrics.jumpHeightCm).toBeCloseTo((9.80665 * 0.501 ** 2 * 100) / 8, 10);
  });

  it.each(["cmj", "single_leg_cmj", "sprint_10m", "flying_10m", "cod_505"] as const)(
    "accepts exact range boundaries for %s",
    (testId) => {
      const ranges = {
        cmj: [0.2, 1],
        single_leg_cmj: [0.15, 0.9],
        sprint_10m: [1, 5],
        flying_10m: [0.7, 3],
        cod_505: [1, 6],
      };
      const [min, max] = ranges[testId];
      expect(() => measure(testId, min, 3.27)).not.toThrow();
      expect(() => measure(testId, max, 3.27)).not.toThrow();
      expect(() => measure(testId, min - 1 / 240)).toThrow();
      expect(() => measure(testId, max + 1 / 240)).toThrow();
    },
  );

  it.each([NaN, Infinity, -1, 1.5, 1600])("rejects invalid frame index %s", (firstFrame) => {
    expect(() =>
      calculateLabMetrics({
        testId: "cmj",
        firstFrame,
        secondFrame: 220,
        capture: captureFixture(),
      }),
    ).toThrow();
  });

  it.each([100, 99])("rejects equal/reversed markers %s", (secondFrame) => {
    expect(() =>
      calculateLabMetrics({
        testId: "cmj",
        firstFrame: 100,
        secondFrame,
        capture: captureFixture(),
      }),
    ).toThrow(/Drugi znacznik/);
  });

  it.each([30, 120, 238.99])("rejects measured %s FPS", (fps) => {
    expect(() => validateCaptureTiming(captureFixture(fps))).toThrow(/240 FPS/);
  });
  it("accepts the 239 FPS threshold without rounding down", () => {
    expect(validateCaptureTiming(captureFixture(239)).observedFps).toBeCloseTo(239, 8);
  });

  it.each(["missing", "duplicate", "reversed", "nan", "count", "nominal", "duration"])(
    "rejects %s timing data",
    (kind) => {
      const capture = captureFixture();
      if (kind === "missing") capture.frameTimestampsSeconds.splice(200, 1);
      if (kind === "duplicate")
        capture.frameTimestampsSeconds[200] = capture.frameTimestampsSeconds[199];
      if (kind === "reversed") capture.frameTimestampsSeconds.reverse();
      if (kind === "nan") capture.frameTimestampsSeconds[200] = NaN;
      if (kind === "count") capture.frameCount = 1600.5;
      if (kind === "nominal") capture.nominalFps = NaN;
      if (kind === "duration") capture.durationSeconds = 0.2;
      expect(() => validateCaptureTiming(capture)).toThrow();
    },
  );

  it("rejects a dropped frame even when overall frame rate still exceeds 239", () => {
    const capture = captureFixture();
    capture.frameTimestampsSeconds.splice(200, 1);
    capture.frameCount -= 1;
    capture.fps = (capture.frameCount - 1) / capture.frameTimestampsSeconds.at(-1)!;
    expect(capture.fps).toBeGreaterThan(239);
    expect(() => validateCaptureTiming(capture)).toThrow(/brakujące klatki/);
  });

  it("never falls back to nominal FPS when timestamps are absent", () => {
    const capture = captureFixture();
    Reflect.deleteProperty(capture, "frameTimestampsSeconds");
    expect(() =>
      calculateLabMetrics({ testId: "cmj", firstFrame: 100, secondFrame: 220, capture }),
    ).toThrow(/osi czasu/);
  });
});

describe("LAB results and full profile", () => {
  it("builds 17 attempts and measures all five tests", () => {
    const plan = createAttemptPlan(FULL_PROFILE_TEST_IDS);
    expect(plan).toHaveLength(17);
    expect(plan.at(-1)?.sequenceNumber).toBe(17);
    expect(new Set(plan.map((row) => row.testId)).size).toBe(5);
    for (const attempt of plan) {
      const result = createLabResult({
        userId: "u",
        batchId: "b",
        attempt,
        capture: captureFixture(),
        firstFrame: 100,
        secondFrame: attempt.testId.includes("cmj") ? 220 : 580,
        trimStartFrame: 0,
        trimEndFrame: 1599,
        firstGuidePosition: 0.2,
        secondGuidePosition: 0.8,
      });
      expect(labResultSchema.safeParse(result).success).toBe(true);
    }
  });

  it.each([NaN, Infinity])("rejects non-finite guide %s before saving", (guide) => {
    expect(() =>
      createLabResult({
        userId: "u",
        batchId: "b",
        attempt: createAttemptPlan(["cmj"])[0],
        capture: captureFixture(),
        firstFrame: 100,
        secondFrame: 220,
        trimStartFrame: 0,
        trimEndFrame: 1599,
        firstGuidePosition: guide,
        secondGuidePosition: 0.5,
      }),
    ).toThrow();
  });

  it.each([
    [0.5, 1599],
    [0, NaN],
    [101, 1599],
    [0, 219],
    [0, 1600],
  ])("rejects invalid trim %s–%s", (trimStartFrame, trimEndFrame) => {
    expect(() =>
      createLabResult({
        userId: "u",
        batchId: "b",
        attempt: createAttemptPlan(["cmj"])[0],
        capture: captureFixture(),
        firstFrame: 100,
        secondFrame: 220,
        trimStartFrame,
        trimEndFrame,
        firstGuidePosition: 0.5,
        secondGuidePosition: 0.5,
      }),
    ).toThrow();
  });

  it("picks the highest jump and fastest sprint, retaining their secondary metrics", () => {
    const rows = [resultFixture("cmj"), resultFixture("sprint_10m")];
    const better = { ...rows[0], id: "better", metrics: { ...rows[0].metrics, primaryValue: 40 } };
    const slower = { ...rows[1], id: "slower", metrics: { ...rows[1].metrics, primaryValue: 3 } };
    const summary = summarizeResults([...rows, better, slower], rows[0].batchId);
    expect(summary[0].bestValue).toBe(40);
    expect(summary[1].bestValue).toBeCloseTo(2, 10);
    expect(summary[1].metrics.speedKmh).toBeCloseTo(18, 10);
  });

  it("compares only valid sides in the requested batch", () => {
    const left = resultFixture("single_leg_cmj", { side: "left" });
    left.metrics.primaryValue = 30;
    const right = resultFixture("single_leg_cmj", { side: "right" });
    right.metrics.primaryValue = 27;
    const other = {
      ...right,
      batchId: "different",
      metrics: { ...right.metrics, primaryValue: 60 },
    };
    expect(
      bestSideAsymmetry([left, right, other], "single_leg_cmj", left.batchId)?.asymmetryPercent,
    ).toBeCloseTo(10, 8);
    expect(bestSideAsymmetry([left, other], "single_leg_cmj", left.batchId)).toBeNull();
    const bad = { ...right, quality: { ...right.quality, valid: false } };
    expect(bestSideAsymmetry([left, bad], "single_leg_cmj", left.batchId)).toBeNull();
  });

  it("selects minimum times for 505 sides", () => {
    const left = resultFixture("cod_505", { side: "left" });
    const right = resultFixture("cod_505", { side: "right" });
    right.metrics.primaryValue = 2.5;
    const slower = { ...left, metrics: { ...left.metrics, primaryValue: 3 } };
    const comparison = bestSideAsymmetry([left, right, slower], "cod_505", left.batchId)!;
    expect(comparison.left).toBeCloseTo(2, 10);
    expect(comparison.right).toBe(2.5);
    expect(comparison.asymmetryPercent).toBeCloseTo(20, 10);
    expect(() => asymmetryPercent(0, 0)).toThrow();
  });

  it("hides historical ball tests without invalidating legacy records", () => {
    const old = resultFixture("sprint_10m", { testId: "sprint_10m_ball" });
    old.quality = { ...old.quality, protocolVersion: "ballwise-lab-1.0", timing: undefined };
    expect(labResultSchema.safeParse(old).success).toBe(true);
    expect(isVisibleLabResult(old)).toBe(false);
    expect(summarizeResults([old], old.batchId)).toEqual([]);
  });

  it("rejects missing timing and inconsistent measurements in protocol 2.0", () => {
    const result = resultFixture();
    expect(
      labResultSchema.safeParse({ ...result, quality: { ...result.quality, timing: undefined } })
        .success,
    ).toBe(false);
    expect(
      labResultSchema.safeParse({ ...result, metrics: { ...result.metrics, primaryValue: 90 } })
        .success,
    ).toBe(false);
  });
});
