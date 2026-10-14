import { describe, expect, it } from "vitest";
import {
  findBallWiseCalibrationMarkers,
  findReferenceRectangle,
  longJumpMeasurement,
  type AutomaticLongJumpCalibration,
  type FloorPoint,
  type LongJumpCalibration,
} from "./longJump";
import { attemptPlan, TEST_IDS } from "./protocols";
import { createBrowserResult, validatedResult } from "./results";
import { buildJumpTimeline } from "./measurement";
import {
  appendBrowserResult,
  createHistoryBackup,
  loadBrowserResults,
  restoreHistoryBackup,
} from "./storage";
import { historyCSV } from "./export";

// Independently specified ground-to-image camera projection, with perspective.
const project = (x: number, y: number): FloorPoint => [
  (0.0018 * x + 0.00015 * y + 0.18) / (1 + 0.0005 * y),
  (0.00005 * x + 0.001 * y + 0.28) / (1 + 0.0005 * y),
];
export const calibratedFloor = (): LongJumpCalibration => ({
  method: "floor-homography-v1",
  referenceCorners: [project(0, 0), project(100, 0), project(100, 50), project(0, 50)],
  referenceWidthCm: 100,
  referenceDepthCm: 50,
  imageWidth: 1280,
  imageHeight: 720,
  calibrationFrameIndex: 1,
  lineFrameIndex: 60,
  heelFrameIndex: 190,
  controlPoints: [project(0, 60), project(250, 60)],
  controlLengthCm: 250,
  takeoffLine: [project(0, 0), project(0, 80)],
  heel: project(214, 45),
  referenceConfirmed: true,
  stationaryConfirmed: true,
});
const automaticPoint = (x: number, y: number): FloorPoint => [0.1 + 0.004 * x, 0.1 + 0.0025 * y];
export const automaticFloor = (): AutomaticLongJumpCalibration => {
  const referenceCorners = [
    automaticPoint(0, -24),
    automaticPoint(20, -24),
    automaticPoint(20, 0),
    automaticPoint(0, 0),
  ] as AutomaticLongJumpCalibration["referenceCorners"];
  const rangeCorners = [
    automaticPoint(0, 288),
    automaticPoint(20, 288),
    automaticPoint(20, 312),
    automaticPoint(0, 312),
  ] as AutomaticLongJumpCalibration["rangeCorners"];
  return {
    method: "ballwise-marker-pose-v2",
    referenceCorners,
    rangeCorners,
    landingReferenceCorners: referenceCorners,
    landingRangeCorners: rangeCorners,
    referenceWidthCm: 20,
    referenceDepthCm: 24,
    baselineCm: 300,
    imageWidth: 1920,
    imageHeight: 1080,
    calibrationFrameIndex: 60,
    lineFrameIndex: 60,
    heelFrameIndex: 190,
    takeoffLine: [referenceCorners[2], referenceCorners[3]],
    heel: automaticPoint(7, 214),
    poseConfidence: 0.92,
    markerQuality: 0.95,
    heelSource: "pose",
  };
};
const timeline = buildJumpTimeline(
  Array.from({ length: 1000 }, (_, cts) => ({ cts, timescale: 240, duration: 1 })),
);
const source = {
  sessionId: "session-12345",
  timeline,
  start: 60,
  end: 190,
  sourceName: "long-jump.mp4",
  sourceHash: "b".repeat(64),
  sourceBytes: 10000,
  codec: "avc1.640029",
  guidePositions: [0.5, 0.5] as [number, number],
  notes: "",
};

describe("calibrated floor measurement", () => {
  it("recovers 214 cm with perspective and lateral landing displacement, rather than diagonal toe-to-heel distance", () => {
    const measured = longJumpMeasurement(calibratedFloor());
    expect(measured.primaryValue).toBeCloseTo(214, 7);
    expect(measured.measuredControlCm).toBeCloseTo(250, 7);
    expect(measured.primaryValue).not.toBeCloseTo(Math.hypot(214, 45), 2);
  });
  it.each([
    { referenceWidthCm: 200 },
    { referenceDepthCm: 0 },
    { controlLengthCm: 260 },
    { referenceConfirmed: false },
    { stationaryConfirmed: false },
    { heel: [2, 0] },
    { takeoffLine: [project(0, 0), project(0, 0)] },
    { referenceCorners: [project(0, 0), project(100, 50), project(100, 0), project(0, 50)] },
    {
      referenceCorners: [
        [0.1, 0.1],
        [0.11, 0.1],
        [0.11, 0.11],
        [0.1, 0.11],
      ],
    },
  ])("rejects inadequate or unconfirmed calibration %j", (change) => {
    expect(() => longJumpMeasurement({ ...calibratedFloor(), ...change })).toThrow();
  });
  it("proposes a black frame with white interior and rejects a solid dark object", () => {
    const width = 200,
      height = 150,
      data = new Uint8ClampedArray(width * height * 4).fill(255);
    const rect = (filled: boolean) => {
      for (let y = 40; y <= 100; y++)
        for (let x = 50; x <= 130; x++) {
          const black = filled || x < 58 || x > 122 || y < 48 || y > 92;
          const n = (y * width + x) * 4;
          data[n] = data[n + 1] = data[n + 2] = black ? 0 : 255;
        }
    };
    rect(false);
    expect(findReferenceRectangle({ data, width, height })).toEqual([
      [0.25, 40 / 150],
      [0.65, 40 / 150],
      [0.65, 100 / 150],
      [0.25, 100 / 150],
    ]);
    rect(true);
    expect(findReferenceRectangle({ data, width, height })).toBeNull();
  });
  it("uses two automatic ground markers spanning the landing area and reports bounded uncertainty", () => {
    const measured = longJumpMeasurement(automaticFloor());
    expect(measured.primaryValue).toBeCloseTo(214, 7);
    expect(measured.uncertaintyCm).toBeLessThan(3);
    expect(measured.cameraShiftPx).toBe(0);
    expect(() =>
      longJumpMeasurement({
        ...automaticFloor(),
        landingRangeCorners: automaticFloor().landingRangeCorners.map(([x, y]) => [x + 0.01, y]),
      }),
    ).toThrow("poruszył");
  });
  it("recognizes blue START and orange 3 m targets and rejects ordinary rectangles", () => {
    const width = 640,
      height = 360,
      data = new Uint8ClampedArray(width * height * 4).fill(255);
    const pixel = (x: number, y: number, colour: [number, number, number]) => {
      const offset = (y * width + x) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    };
    const marker = (left: number, top: number, colour: [number, number, number]) => {
      const markerWidth = 120,
        markerHeight = 150;
      for (let y = top; y <= top + markerHeight; y++)
        for (let x = left; x <= left + markerWidth; x++) {
          const border =
            x < left + 8 || x > left + markerWidth - 8 || y < top + 8 || y > top + markerHeight - 8;
          pixel(x, y, border ? [0, 0, 0] : [255, 255, 255]);
        }
      for (const [u, v] of [
        [0.18, 0.2],
        [0.82, 0.2],
        [0.82, 0.8],
        [0.18, 0.8],
      ]) {
        const cx = Math.round(left + markerWidth * u),
          cy = Math.round(top + markerHeight * v);
        for (let y = cy - 8; y <= cy + 8; y++)
          for (let x = cx - 8; x <= cx + 8; x++) pixel(x, y, colour);
      }
    };
    marker(50, 80, [22, 136, 255]);
    marker(430, 80, [249, 115, 22]);
    const found = findBallWiseCalibrationMarkers({ data, width, height });
    expect(found?.start.quality).toBeGreaterThan(0.7);
    expect(found?.range.quality).toBeGreaterThan(0.7);
    marker(50, 80, [255, 255, 255]);
    marker(430, 80, [255, 255, 255]);
    expect(findBallWiseCalibrationMarkers({ data, width, height })).toBeNull();
  });
});

describe("measurement evidence and migration", () => {
  it("saves distance independently of flight time, restores full calibration and exports its evidence", () => {
    const result = createBrowserResult({
      ...source,
      attempt: attemptPlan(["standing_long_jump"])[0],
      spatial: calibratedFloor(),
    });
    expect(result.primaryValue).toBeCloseTo(214, 7);
    expect(result.resolutionMin).toBeUndefined();
    expect(result.resolutionMax).toBeUndefined();
    expect(result.spatial).toEqual(calibratedFloor());
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    appendBrowserResult("a", result, store);
    expect(restoreHistoryBackup("b", createHistoryBackup([result]), store).added).toBe(1);
    expect(loadBrowserResults("b", store)[0]).toEqual(result);
    expect(historyCSV([result])).toContain("floor-homography-v1");
    for (const changed of [
      { primaryValue: 250 },
      { spatial: undefined },
      { startFrameIndex: 61 },
      { resolutionMin: 213 },
    ])
      expect(() => validatedResult({ ...result, ...changed })).toThrow();
  });
  it("requires an intermediate turn for new 505 results and retains legacy results", () => {
    const data = { ...source, attempt: attemptPlan(["cod_505"])[0], end: 660 };
    expect(() => createBrowserResult(data)).toThrow("nawrotu");
    const result = createBrowserResult({ ...data, turnFrameIndex: 350 });
    expect(result.primaryValue).toBe(2.5);
    expect(result.turnSeconds).toBeCloseTo(350 / 240, 8);
    expect(() => validatedResult({ ...result, turnFrameIndex: 700 })).toThrow();
    expect(
      validatedResult({
        ...result,
        version: "ballwise-browser-lab-1.0",
        turnFrameIndex: undefined,
        turnSeconds: undefined,
      }).primaryValue,
    ).toBe(2.5);
  });
  it("removes flying from selectable tests without invalidating archived history", () => {
    expect(TEST_IDS).not.toContain("flying_10m");
    const cmj = createBrowserResult({ ...source, attempt: attemptPlan(["cmj"])[0], end: 164 });
    const flying = {
      ...cmj,
      testId: "flying_10m",
      endFrameIndex: 300,
      endSeconds: 1.25,
      endPreviousSeconds: 299 / 240,
      elapsedSeconds: 1,
      primaryValue: 1,
      primaryUnit: "s",
      resolutionMin: 239 / 240,
      resolutionMax: 241 / 240,
      averageSpeedMps: 10,
    };
    expect(validatedResult(flying).averageSpeedMps).toBe(10);
  });
});
