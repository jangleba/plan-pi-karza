import { describe, expect, it } from "vitest";
import type { Calibration, FramePose, Landmark, VideoMetadata } from "./types";
import { buildPrecisionWindows, mergePosePasses, selectAnalysisPoses } from "./precisionPass";

const metadata: VideoMetadata = {
  fps: 120,
  fpsMeasured: true,
  declaredFps: 120,
  durationSeconds: 3,
  frameCount: 360,
  width: 1000,
  height: 1000,
  orientation: "landscape",
};

function landmarks(x: number, footY = 0.9): Landmark[] {
  const values = Array.from({ length: 33 }, () => ({ x, y: 0.5, z: 0, visibility: 1 }));
  values[0].y = 0.2;
  for (const index of [27, 28, 29, 30, 31, 32]) values[index].y = footY;
  return values;
}

function pose(index: number, fps: number, x: number, footY = 0.9): FramePose {
  const timestampUs = Math.round((index * 1_000_000) / fps);
  return {
    frameIndex: index,
    sourceFrameIndex: index,
    mediaTime: timestampUs / 1_000_000,
    presentationTimestamp: timestampUs / 1_000_000,
    sourceTimestampUs: timestampUs,
    sourceTimestampMs: Math.round(timestampUs / 1000),
    landmarks: landmarks(x, footY),
    peopleCount: 1,
    trackingConfidence: 0.95,
  };
}

describe("precision pass windows", () => {
  it("finds START and FINISH brackets from calibrated sprint geometry", () => {
    const coarse = Array.from({ length: 41 }, (_, index) =>
      pose(index, 20, 0.05 + (0.7 * index) / 40),
    );
    const calibration: Calibration = {
      homography: [0.03, 0, 100, 0, 0.03, 0, 0, 0, 1],
      timingLines: [
        { id: "start", role: "START", worldXmm: 0, direction: "forward" },
        { id: "finish", role: "FINISH", worldXmm: 20000, direction: "forward" },
      ],
    };

    const windows = buildPrecisionWindows({
      testType: "sprint_20m",
      coarsePoses: coarse,
      metadata,
      calibration,
    });

    expect(windows).toHaveLength(2);
    expect(windows[0].startSeconds).toBeLessThan(windows[0].endSeconds);
    expect(windows[1].startSeconds).toBeLessThan(windows[1].endSeconds);
  });

  it("does not invent sprint windows without calibration", () => {
    const coarse = Array.from({ length: 20 }, (_, index) => pose(index, 20, index / 30));
    expect(
      buildPrecisionWindows({
        testType: "sprint_20m",
        coarsePoses: coarse,
        metadata,
        calibration: null,
      }),
    ).toEqual([]);
  });

  it("covers the full jump from pre-takeoff stance through landing", () => {
    const coarse = Array.from({ length: 40 }, (_, index) => {
      const footY = index >= 10 && index <= 22 ? 0.7 : 0.9;
      return pose(index, 20, 0.5, footY);
    });
    const windows = buildPrecisionWindows({
      testType: "cmj",
      coarsePoses: coarse,
      metadata,
      calibration: null,
    });

    expect(windows).toHaveLength(1);
    expect(windows[0].startSeconds).toBeLessThan(0.5);
    expect(windows[0].endSeconds).toBeGreaterThan(1.1);
  });

  it("uruchamia dokładny przebieg CMJ nawet gdy skan 12 FPS nie złapał krótkiego wybicia", () => {
    const coarse = Array.from({ length: 36 }, (_, index) => pose(index, 12, 0.5, 0.9));
    const windows = buildPrecisionWindows({
      testType: "cmj",
      coarsePoses: coarse,
      metadata: { ...metadata, durationSeconds: 3, frameCount: 360 },
      calibration: null,
    });

    expect(windows).toEqual([{ startSeconds: 0, endSeconds: 3 }]);
  });
});

describe("pose pass merge", () => {
  it("lets precision replace the same source timestamp and reindexes the array", () => {
    const coarse = [pose(0, 20, 0.1), pose(1, 20, 0.2)];
    const preciseReplacement = { ...coarse[1], trackingConfidence: 0.99 };
    const merged = mergePosePasses(coarse, [preciseReplacement]);

    expect(merged).toHaveLength(2);
    expect(merged[1].trackingConfidence).toBe(0.99);
    expect(merged.map((item) => item.frameIndex)).toEqual([0, 1]);
  });

  it("uses the uniform precision window for jump calculations", () => {
    const coarse = [pose(0, 20, 0.1), pose(1, 20, 0.2)];
    const precision = Array.from({ length: 8 }, (_, index) => pose(index, 120, 0.3));
    const selected = selectAnalysisPoses("cmj", coarse, precision);

    expect(selected).toHaveLength(8);
    expect(selected.map((item) => item.sourceTimestampUs)).toEqual(
      precision.map((item) => item.sourceTimestampUs),
    );
  });
});
