import { describe, it, expect } from "vitest";
import { estimateScaleFromHeight, horizontalNormToMeters } from "./autoCalibration";
import type { FramePose, Landmark } from "./types";
import { POSE } from "./types";

function pose(frameIndex: number, hipX: number, noseY: number, footY: number): FramePose {
  const arr: Landmark[] = Array.from({ length: 33 }, () => ({
    x: hipX,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  arr[POSE.NOSE] = { x: hipX, y: noseY, z: 0, visibility: 0.9 };
  arr[POSE.LEFT_HIP] = { x: hipX, y: (noseY + footY) / 2, z: 0, visibility: 0.95 };
  arr[POSE.RIGHT_HIP] = { x: hipX, y: (noseY + footY) / 2, z: 0, visibility: 0.95 };
  for (const i of [POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE, POSE.LEFT_HEEL, POSE.RIGHT_HEEL, POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX]) {
    arr[i] = { x: hipX, y: footY, z: 0, visibility: 0.95 };
  }
  return {
    frameIndex,
    mediaTime: frameIndex / 30,
    presentationTimestamp: frameIndex / 30,
    landmarks: arr,
    peopleCount: 1,
    trackingConfidence: 0.9,
  };
}

describe("estimateScaleFromHeight", () => {
  it("zwraca null bez wzrostu", () => {
    const poses = [pose(0, 0.5, 0.1, 0.9)];
    expect(estimateScaleFromHeight(poses, null, 1080, 1920)).toBeNull();
  });

  it("wylicza metry/piksel z wzrostu i sylwetki", () => {
    // nos y=0.1, stopa y=0.9 → segment 0.8 * 1920 = 1536 px. Wzrost 180cm.
    const poses = Array.from({ length: 6 }, (_, i) => pose(i, 0.5, 0.1, 0.9));
    const scale = estimateScaleFromHeight(poses, 180, 1080, 1920);
    expect(scale).not.toBeNull();
    // 1.8 * 0.93 / 1536 ≈ 0.00109 m/px
    expect(scale!.metersPerPixel).toBeGreaterThan(0.001);
    expect(scale!.metersPerPixel).toBeLessThan(0.0012);
    expect(scale!.confidence).toBeGreaterThan(0.6);
  });

  it("zwraca null gdy za mało stabilnych klatek", () => {
    const poses = [pose(0, 0.5, 0.1, 0.9), pose(1, 0.5, 0.1, 0.9)];
    expect(estimateScaleFromHeight(poses, 180, 1080, 1920)).toBeNull();
  });

  it("horizontalNormToMeters przelicza przemieszczenie x", () => {
    const scale = { metersPerPixel: 0.001, confidence: 0.8, sampleCount: 6 };
    // dxNorm 0.5 * 1080px * 0.001 = 0.54 m
    expect(horizontalNormToMeters(0.5, 1080, scale)).toBeCloseTo(0.54, 5);
  });
});
