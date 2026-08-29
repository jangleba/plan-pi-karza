import { describe, it, expect } from "vitest";
import {
  computeVideoHash,
  frameConfigurationHash,
  calibrationHashFrom,
  arePointsCollinear,
  validateGroundPoints,
  convexHull,
  pointInPolygon,
  isAreaWithinCalibration,
  buildCalibrationRecord,
  buildKnownDistanceRecord,
  buildSprintTimingLines,
  type ImagePointPx,
  type GroundPointMm,
} from "./videoCalibration";

// Prosta scena: prostokąt 2000×1000 mm rzutowany perspektywicznie na obraz.
const imagePoints: ImagePointPx[] = [
  { u: 200, v: 800 },
  { u: 1000, v: 780 },
  { u: 1050, v: 500 },
  { u: 300, v: 520 },
];
const groundPoints: GroundPointMm[] = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1000 },
  { x: 0, y: 1000 },
];

describe("videoHash", () => {
  it("jest deterministyczny dla tych samych bajtów", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(computeVideoHash(bytes)).toBe(
      computeVideoHash(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
  });
  it("różni się dla różnych bajtów", () => {
    expect(computeVideoHash(new Uint8Array([1, 2, 3]))).not.toBe(
      computeVideoHash(new Uint8Array([1, 2, 4])),
    );
  });
});

describe("frameConfigurationHash / calibrationHash", () => {
  it("frame config deterministyczny", () => {
    const cfg = { width: 1080, height: 1920, fps: 120, orientation: "portrait" };
    expect(frameConfigurationHash(cfg)).toBe(frameConfigurationHash({ ...cfg }));
  });
  it("calibrationHash zależy od punktów", () => {
    const a = calibrationHashFrom(imagePoints, groundPoints);
    const b = calibrationHashFrom(imagePoints, groundPoints);
    expect(a).toBe(b);
  });
});

describe("geometria", () => {
  it("wykrywa punkty współliniowe", () => {
    expect(
      arePointsCollinear([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe(true);
    expect(arePointsCollinear(groundPoints)).toBe(false);
  });
  it("odrzuca <4 punkty", () => {
    expect(validateGroundPoints(imagePoints.slice(0, 3), groundPoints.slice(0, 3)).ok).toBe(false);
  });
  it("akceptuje 4 niewspółliniowe punkty", () => {
    expect(validateGroundPoints(imagePoints, groundPoints).ok).toBe(true);
  });
  it("convex hull + point-in-polygon", () => {
    const hull = convexHull(imagePoints);
    expect(pointInPolygon({ u: 600, v: 640 }, hull)).toBe(true);
    expect(pointInPolygon({ u: 0, v: 0 }, hull)).toBe(false);
  });
  it("sprawdza pokrycie obszaru testu", () => {
    const hull = convexHull(imagePoints);
    expect(isAreaWithinCalibration([{ u: 600, v: 640 }], hull)).toBe(true);
    expect(isAreaWithinCalibration([{ u: 5000, v: 5000 }], hull)).toBe(false);
  });
});

describe("buildCalibrationRecord", () => {
  it("buduje właściwe linie START/split/meta dla sprintu 20 m", () => {
    const lines = buildSprintTimingLines("sprint_20m", 20000, 2000);
    expect(lines?.map((line) => line.role)).toEqual([
      "START",
      "SPLIT_5M",
      "SPLIT_10M",
      "SPLIT_15M",
      "FINISH",
    ]);
    expect(lines?.map((line) => line.worldXmm)).toEqual([0, 5000, 10000, 15000, 20000]);
  });

  it("buduje rekord z homografią i odwrotnością", () => {
    const res = buildCalibrationRecord({
      videoHash: "vh_test",
      calibrationType: "MANUAL_GROUND_POINTS",
      referenceFrameIndex: 12,
      referenceTimestampUs: 200000,
      imagePointsPx: imagePoints,
      groundPointsMm: groundPoints,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.homographyMatrix).not.toBeNull();
    expect(res.record.inverseHomographyMatrix).not.toBeNull();
    expect(res.record.reprojectionErrorPx).toBeGreaterThanOrEqual(0);
    expect(res.record.calibratedAreaPolygonPx.length).toBeGreaterThanOrEqual(3);
    expect(res.record.spatialResultStatus).toBe("OFFICIAL");
  });

  it("zapisuje linie czasu razem z kalibracją filmu", () => {
    const timingLines = [
      {
        id: "start",
        role: "START" as const,
        groundStartPointMm: { x: 0, y: 0 },
        groundEndPointMm: { x: 0, y: 1000 },
        direction: "forward" as const,
      },
      {
        id: "finish",
        role: "FINISH" as const,
        groundStartPointMm: { x: 2000, y: 0 },
        groundEndPointMm: { x: 2000, y: 1000 },
        direction: "forward" as const,
      },
    ];
    const res = buildCalibrationRecord({
      videoHash: "vh_timing",
      calibrationType: "MANUAL_GROUND_POINTS",
      referenceFrameIndex: 12,
      referenceTimestampUs: 200000,
      imagePointsPx: imagePoints,
      groundPointsMm: groundPoints,
      timingLines,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.timingLines).toEqual(timingLines);
    expect(res.record.timingLines).not.toBe(timingLines);
  });

  it("PONOWNE OTWARCIE FILMU odtwarza identyczną kalibrację (determinizm)", () => {
    const opts = {
      videoHash: "vh_same",
      calibrationType: "MANUAL_GROUND_POINTS" as const,
      referenceFrameIndex: 12,
      referenceTimestampUs: 200000,
      imagePointsPx: imagePoints,
      groundPointsMm: groundPoints,
      now: "2026-01-01T00:00:00.000Z",
      calibrationId: "fixed-id",
    };
    const runs = Array.from({ length: 10 }, () => buildCalibrationRecord(opts));
    const first = runs[0];
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    for (const r of runs) {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.record.homographyMatrix).toEqual(first.record.homographyMatrix);
      expect(r.record.inverseHomographyMatrix).toEqual(first.record.inverseHomographyMatrix);
      expect(r.record.calibrationHash).toBe(first.record.calibrationHash);
      expect(r.record.reprojectionErrorPx).toBe(first.record.reprojectionErrorPx);
      expect(r.record.calibrationId).toBe(first.record.calibrationId);
    }
  });

  it("odrzuca punkty współliniowe", () => {
    const res = buildCalibrationRecord({
      videoHash: "vh_x",
      calibrationType: "MANUAL_GROUND_POINTS",
      referenceFrameIndex: 0,
      referenceTimestampUs: 0,
      imagePointsPx: [
        { u: 0, v: 0 },
        { u: 1, v: 1 },
        { u: 2, v: 2 },
        { u: 3, v: 3 },
      ],
      groundPointsMm: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
    });
    expect(res.ok).toBe(false);
  });
});

describe("buildKnownDistanceRecord", () => {
  it("pozostaje TECHNIQUE_ONLY (brak pełnej homografii)", () => {
    const res = buildKnownDistanceRecord({
      videoHash: "vh_kd",
      referenceFrameIndex: 3,
      referenceTimestampUs: 50000,
      segments: [{ a: { u: 100, v: 100 }, b: { u: 500, v: 100 }, lengthMm: 1000 }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.spatialResultStatus).toBe("TECHNIQUE_ONLY");
    expect(res.record.homographyMatrix).toBeNull();
  });
});
