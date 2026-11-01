import { describe, expect, it, vi } from "vitest";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
vi.mock("@mediapipe/tasks-vision", () => ({ PoseLandmarker: {} }));
import { poseFromLandmarks } from "./pose";
const visible = (): NormalizedLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: index % 2 ? 0.4 : 0.45,
    y: index < 23 ? 0.2 : index < 27 ? 0.5 : 0.85,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  }));
describe("evidence for automatic heel measurement", () => {
  it("keeps visible hips, toes and heels available for a proposed jump window", () => {
    const pose = poseFromLandmarks(visible());
    expect(pose?.confidence).toBe(0.95);
    expect(pose?.hip[0]).toBeCloseTo(0.425, 10);
  });
  it.each([23, 24, 29, 30, 31, 32])(
    "does not conceal occluded landmark %s in the average body score",
    (index) => {
      const points = visible();
      points[index].visibility = 0.1;
      expect(poseFromLandmarks(points)).toBeNull();
    },
  );
  it("rejects missing or nonfinite pose coordinates", () => {
    expect(poseFromLandmarks(undefined)).toBeNull();
    const points = visible();
    points[29].x = NaN;
    expect(poseFromLandmarks(points)).toBeNull();
  });
});
