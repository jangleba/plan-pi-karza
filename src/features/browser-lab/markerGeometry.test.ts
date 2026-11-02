import { describe, expect, it } from "vitest";
import { orientStartMarker, takeoffEdgeFromMarkers } from "./markerGeometry";
import { longJumpMeasurement, type AutomaticLongJumpCalibration } from "./longJump";
const image = (u: number, v: number, perspective = false): [number, number] => {
  const d = perspective ? 1 + 0.0004 * v + 0.0002 * u : 1;
  return [(0.14 + 0.00225 * v + 0.0001 * u) / d, (0.83 - 0.01 * u + 0.00002 * v) / d];
};
describe("oriented START and 3 m geometry", () => {
  it.each([0, 1, 2, 3])(
    "keeps the physical 20 cm line after image-corner rotation %s",
    (rotation) => {
      for (const perspective of [false, true]) {
        const p = (u: number, v: number) => image(u, v, perspective);
        const original = [
          p(0, -24),
          p(20, -24),
          p(20, 0),
          p(0, 0),
        ] as AutomaticLongJumpCalibration["referenceCorners"];
        const raw = [
          ...original.slice(rotation),
          ...original.slice(0, rotation),
        ] as typeof original;
        const range = [p(0, 288), p(20, 288), p(20, 312), p(0, 312)] as typeof original;
        const oriented = orientStartMarker(raw, range),
          line = takeoffEdgeFromMarkers(oriented, range);
        expect(line).toContainEqual(p(0, 0));
        expect(line).toContainEqual(p(20, 0));
        const calibration: AutomaticLongJumpCalibration = {
          method: "ballwise-marker-pose-v4",
          referenceCorners: oriented,
          rangeCorners: range,
          landingReferenceCorners: oriented,
          landingRangeCorners: range,
          referenceWidthCm: 20,
          referenceDepthCm: 24,
          baselineCm: 300,
          imageWidth: 3840,
          imageHeight: 2160,
          lineFrameIndex: 30,
          calibrationFrameIndex: 30,
          heelFrameIndex: 100,
          takeoffLine: line,
          heel: p(-10, 214),
          markerQuality: 1,
          heelSource: "manual",
          poseConfidence: 0,
        };
        expect(longJumpMeasurement(calibration).primaryValue).toBeCloseTo(214, 4);
        expect(longJumpMeasurement(calibration).cameraShiftPx).toBe(0);
        expect(() => longJumpMeasurement({ ...calibration, heelSource: "pose" })).toThrow(
          "niepewne",
        );
        expect(() =>
          longJumpMeasurement({ ...calibration, method: "ballwise-marker-pose-v3" }),
        ).toThrow("niepewne");
      }
    },
  );
  it("does not accept the far edge of a paper as the front just because a toe is close to it", () => {
    const p = (u: number, v: number) => image(u, v),
      corners = [
        p(0, -24),
        p(20, -24),
        p(20, 0),
        p(0, 0),
      ] as AutomaticLongJumpCalibration["referenceCorners"];
    const range = [p(0, 288), p(20, 288), p(20, 312), p(0, 312)] as typeof corners;
    expect(takeoffEdgeFromMarkers(corners, range)).toEqual([corners[2], corners[3]]);
  });
});
