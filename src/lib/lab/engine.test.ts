import { describe, expect, it } from "vitest";
import {
  asymmetryPercent,
  ballPenaltyPercent,
  calculateLabMetrics,
  createAttemptPlan,
  createLabResult,
  frameDurationSeconds,
  jumpHeightCmFromFlightTime,
} from "./engine";

describe("BallWise Lab engine", () => {
  it("uses exact frame difference at the verified capture rate", () => {
    expect(frameDurationSeconds(120, 240)).toBe(0.5);
  });

  it("rejects video below the hard 240 FPS requirement", () => {
    expect(() => frameDurationSeconds(60, 120)).toThrow(/240 FPS/);
    expect(() => frameDurationSeconds(60, 30)).toThrow(/240 FPS/);
  });

  it("rejects reversed markers and implausible measurements", () => {
    expect(() => frameDurationSeconds(0, 240)).toThrow(/Drugi znacznik/);
    expect(() =>
      calculateLabMetrics({ testId: "sprint_10m", firstFrame: 0, secondFrame: 120, fps: 240 }),
    ).toThrow(/wiarygodnym zakresem/);
  });

  it("calculates jump height from flight time", () => {
    expect(jumpHeightCmFromFlightTime(0.5)).toBeCloseTo(30.6458, 3);
  });

  it("calculates CMJ from marked frames", () => {
    const { metrics, quality } = calculateLabMetrics({
      testId: "cmj",
      firstFrame: 100,
      secondFrame: 220,
      fps: 240,
    });
    expect(metrics.flightTimeSeconds).toBe(0.5);
    expect(metrics.jumpHeightCm).toBeCloseTo(30.6458, 3);
    expect(quality.valid).toBe(true);
    expect(quality.frameResolutionMs).toBeCloseTo(4.1667, 3);
  });

  it("calculates Flying 10 speed", () => {
    const { metrics } = calculateLabMetrics({
      testId: "flying_10m",
      firstFrame: 100,
      secondFrame: 400,
      fps: 240,
    });
    expect(metrics.elapsedSeconds).toBe(1.25);
    expect(metrics.averageSpeedMps).toBe(8);
    expect(metrics.speedKmh).toBe(28.8);
  });

  it("calculates side asymmetry and ball penalty without NaN", () => {
    expect(asymmetryPercent(30, 27)).toBeCloseTo(10, 8);
    expect(asymmetryPercent(0, 0)).toBe(0);
    expect(ballPenaltyPercent(2, 1.8)).toBeCloseTo(11.1111, 3);
  });

  it("builds the complete 19-attempt profile", () => {
    const plan = createAttemptPlan([
      "cmj",
      "single_leg_cmj",
      "sprint_10m",
      "flying_10m",
      "cod_505",
      "sprint_10m_ball",
    ]);
    expect(plan).toHaveLength(19);
    expect(plan[0].sequenceNumber).toBe(1);
    expect(plan.at(-1)?.sequenceNumber).toBe(19);
  });

  it("creates an auditable result and clamps guide positions", () => {
    const attempt = createAttemptPlan(["cmj"])[0];
    const result = createLabResult({
      userId: "00000000-0000-4000-8000-000000000001",
      batchId: "00000000-0000-4000-8000-000000000002",
      attempt,
      capture: {
        path: "/tmp/example.mov",
        fps: 240,
        frameCount: 480,
        durationSeconds: 2,
        width: 1920,
        height: 1080,
      },
      firstFrame: 100,
      secondFrame: 220,
      trimStartFrame: 80,
      trimEndFrame: 240,
      firstGuidePosition: -1,
      secondGuidePosition: 2,
    });
    expect(result.metrics.jumpHeightCm).toBeCloseTo(30.6458, 3);
    expect(result.firstGuidePosition).toBe(0);
    expect(result.secondGuidePosition).toBe(1);
    expect(result.quality.fpsVerified).toBe(true);
  });

  it("does not create a result when markers leave the trimmed clip", () => {
    const attempt = createAttemptPlan(["sprint_10m"])[0];
    expect(() =>
      createLabResult({
        userId: "00000000-0000-4000-8000-000000000001",
        batchId: "00000000-0000-4000-8000-000000000002",
        attempt,
        capture: {
          path: "/tmp/example.mov",
          fps: 240,
          frameCount: 1200,
          durationSeconds: 5,
          width: 1920,
          height: 1080,
        },
        firstFrame: 20,
        secondFrame: 600,
        trimStartFrame: 100,
        trimEndFrame: 700,
        firstGuidePosition: 0.3,
        secondGuidePosition: 0.7,
      }),
    ).toThrow(/wybranym fragmencie/);
  });
});
