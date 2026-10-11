import { describe, expect, it } from "vitest";
import { buildJumpTimeline, measureJump, validateEdits } from "./measurement";

const samples = (fps = 240, count = 360) =>
  Array.from({ length: count }, (_, i) => ({
    cts: i * 1000,
    duration: 1000,
    timescale: fps * 1000,
  }));

describe("CMJ from actual sample timestamps", () => {
  it("reproduces 104 frame intervals at 240 FPS without a hardcoded FPS", () => {
    const result = measureJump(buildJumpTimeline(samples()), 20, 124);
    expect(result.flightSeconds).toBeCloseTo(104 / 240, 12);
    expect(result.heightCm).toBeCloseTo(23.0183868056, 8);
    expect(result.frameCount).toBe(104);
    expect(result.resolutionMinCm).toBeLessThan(result.heightCm);
    expect(result.resolutionMaxCm).toBeGreaterThan(result.heightCm);
  });
  it("gives the same height from a 120 FPS original with 52 intervals", () => {
    expect(
      measureJump(buildJumpTimeline(samples(120)), 10, 62).heightCm,
    ).toBeCloseTo(23.0183868056, 8);
  });
  it("sorts B-frame presentation times independently of decode order", () => {
    const input = samples();
    [input[1], input[3]] = [input[3], input[1]];
    const timeline = buildJumpTimeline(input);
    expect(timeline.frames[1].sampleIndex).toBe(3);
    expect(timeline.frames[1].timestampUs).toBe(4167);
  });
  it.each([15, 24, 23.976, 25, 30, 60, 120, 240, 29.97, 59.94])(
    "uses original timestamps at %s FPS",
    (fps) => {
      const timeline = buildJumpTimeline(samples(fps, Math.round(fps * 2)));
      expect(timeline.fps).toBeCloseTo(fps, 8);
    },
  );
  it("widens the temporal bracket at lower FPS without inventing intermediate frames", () => {
    const low = measureJump(buildJumpTimeline(samples(30, 60)), 10, 22);
    const medium = measureJump(buildJumpTimeline(samples(60, 120)), 20, 44);
    const high = measureJump(buildJumpTimeline(samples(240, 480)), 80, 176);
    expect(low.heightCm).toBeCloseTo(high.heightCm, 8);
    expect(medium.heightCm).toBeCloseTo(high.heightCm, 8);
    expect(low.resolutionMaxCm - low.resolutionMinCm).toBeGreaterThan(
      medium.resolutionMaxCm - medium.resolutionMinCm,
    );
    expect(medium.resolutionMaxCm - medium.resolutionMinCm).toBeGreaterThan(
      high.resolutionMaxCm - high.resolutionMinCm,
    );
  });
  it("rejects unsupported rates and explicit slow-motion edits without guessing FPS", () => {
    expect(() => buildJumpTimeline(samples(10, 20))).toThrow(
      "co najmniej 15 FPS",
    );
    expect(() => buildJumpTimeline(samples(400, 800))).toThrow();
    expect(() =>
      validateEdits([{ media_rate_integer: 0, media_rate_fraction: 8192 }]),
    ).toThrow("slow motion");
    expect(() =>
      validateEdits([{ media_rate_integer: 1, media_rate_fraction: 0 }]),
    ).not.toThrow();
  });
  it("rejects duplicate PTS, long interruptions, mixed timescales and invalid durations", () => {
    const duplicate = samples();
    duplicate[30].cts = duplicate[29].cts;
    expect(() => buildJumpTimeline(duplicate)).toThrow("powtórzone");
    const gap = samples();
    gap.splice(30, 70);
    expect(() => buildJumpTimeline(gap)).toThrow("przerwa");
    const invalid = samples();
    invalid[10].timescale = 1;
    expect(() => buildJumpTimeline(invalid)).toThrow("czasów");
    invalid[10] = { cts: NaN, timescale: 240000, duration: 0 };
    expect(() => buildJumpTimeline(invalid)).toThrow();
  });
  it("uses real variable timestamps and actual adjacent gaps instead of nominal FPS", () => {
    let cts = 0;
    const input = Array.from({ length: 60 }, (_, i) => {
      const duration = i % 2 ? 1250 : 1000;
      const sample = { cts, duration, timescale: 30000 };
      cts += duration;
      return sample;
    });
    const timeline = buildJumpTimeline(input);
    const result = measureJump(timeline, 8, 20);
    expect(result.flightSeconds).toBeCloseTo(0.45, 12);
    expect(result.flightSeconds).not.toBeCloseTo(12 / timeline.fps, 5);
    expect(result.resolutionMinCm).toBeCloseTo(
      ((9.80665 * (0.45 - 1 / 24) ** 2) / 8) * 100,
      8,
    );
  });
  it("accepts a dropped frame but blocks a marked event spanning a long gap", () => {
    const input = samples(30, 60);
    input.splice(10, 4);
    const timeline = buildJumpTimeline(input);
    expect(() => measureJump(timeline, 10, 22)).toThrow("Brakuje klatek");
    expect(() => measureJump(timeline, 5, 20)).not.toThrow();
  });
  it("rejects reversed markers, edge frames, and implausible flight time", () => {
    const timeline = buildJumpTimeline(samples());
    for (const [a, b] of [
      [20, 10],
      [0, 104],
      [10, 360],
      [10, 11],
      [10, 300],
      [1.5, 104],
    ])
      expect(() => measureJump(timeline, a, b)).toThrow();
  });
});
