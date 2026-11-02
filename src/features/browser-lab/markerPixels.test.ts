import { expect, it } from "vitest";
import { findBallWiseMarker } from "./longJump";
import { prepareManualJump, completeManualJump } from "./manualLongJump";
import { longJumpMeasurement } from "./longJump";
it("refines a 4K-width border to original pixels instead of its coarse search grid", () => {
  const width = 3840,
    height = 512,
    data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  const rect = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    r: number,
    g: number,
    b: number,
  ) => {
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
  };
  const left = 101,
    top = 59,
    right = 389,
    bottom = 227;
  rect(left, top, right, bottom, 0, 0, 0);
  rect(left + 7, top + 7, right - 7, bottom - 7, 255, 255, 255);
  for (const u of [0.18, 0.82])
    for (const v of [0.2, 0.8]) {
      const x = Math.round(left + (right - left) * u),
        y = Math.round(top + (bottom - top) * v);
      rect(x - 13, y - 7, x + 13, y + 7, 22, 136, 255);
    }
  const marker = findBallWiseMarker({ width, height, data });
  expect(marker).toBeTruthy();
  const expected = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
  marker!.corners.forEach((p, i) => {
    expect(Math.abs(p[0] * width - expected[i][0])).toBeLessThanOrEqual(1);
    expect(Math.abs(p[1] * height - expected[i][1])).toBeLessThanOrEqual(1);
  });
});
it("recognizes slanted thin marker borders and measures a known 214 cm floor displacement", () => {
  const width = 3840,
    height = 2160,
    data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  const point = (u: number, v: number) => [
    (0.14 + 0.0033 * u + 0.00225 * v) * width,
    (0.72 - 0.007 * u + 0.00002 * v) * height,
  ];
  const polygon = (points: number[][], colour: number[]) => {
    const left = Math.floor(Math.min(...points.map((p) => p[0]))),
      right = Math.ceil(Math.max(...points.map((p) => p[0]))),
      top = Math.floor(Math.min(...points.map((p) => p[1]))),
      bottom = Math.ceil(Math.max(...points.map((p) => p[1])));
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const cross = points.map((p, i) => {
          const q = points[(i + 1) % points.length];
          return (q[0] - p[0]) * (y + 0.5 - p[1]) - (q[1] - p[1]) * (x + 0.5 - p[0]);
        });
        if (!cross.every((v) => v >= 0) && !cross.every((v) => v <= 0)) continue;
        const offset = (y * width + x) * 4;
        data[offset] = colour[0];
        data[offset + 1] = colour[1];
        data[offset + 2] = colour[2];
      }
  };
  const rect = (u: number, v: number, w: number, h: number, c: number[]) =>
    polygon([point(u, v), point(u + w, v), point(u + w, v + h), point(u, v + h)], c);
  for (const [centre, colour] of [
    [-12, [22, 136, 255]],
    [300, [242, 139, 37]],
  ] as const) {
    const bottom = centre - 12;
    rect(0, bottom, 20, 24, [0, 0, 0]);
    rect(0.8, bottom + 0.8, 18.4, 22.4, [255, 255, 255]);
    for (const u of [3.6, 16.4])
      for (const v of [bottom + 4.8, bottom + 19.2]) rect(u - 0.9, v - 0.9, 1.8, 1.8, [...colour]);
  }
  const image = { width, height, data } as ImageData,
    start = prepareManualJump(image, 42),
    heel = point(-10, 214);
  const calibration = completeManualJump(start, image, [heel[0] / width, heel[1] / height], 102);
  const result = longJumpMeasurement(calibration);
  // A hard raster border rounds slanted edges to whole pixels. Require <1 cm
  // error and containment in the reported sensitivity, not sub-pixel precision.
  expect(Math.abs(result.primaryValue - 214)).toBeLessThan(1);
  expect(Math.abs(result.primaryValue - 214)).toBeLessThan(result.uncertaintyCm ?? 0);
  expect(result.cameraShiftPx).toBe(0);
  expect(result.uncertaintyCm).toBeLessThan(5);
});
