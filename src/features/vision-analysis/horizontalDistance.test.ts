import { describe, it, expect } from "vitest";
import type { AnalysisContext, DetectedEvent, FramePose, Landmark } from "./types";
import { POSE } from "./types";
import { measureGroundHorizontalDistance } from "./horizontalDistance";
import {
  buildCalibrationRecord,
  canInheritCalibration,
  sceneSignatureFromRecord,
  frameConfigurationHash,
  type ImagePointPx,
  type GroundPointMm,
} from "./videoCalibration";

const WIDTH = 1920;
const HEIGHT = 1080;

/**
 * Kalibracja planarna: podłoże (mm) rzutowane liniowo na piksele.
 *   u = ox + x * sx      (x w mm wzdłuż osi ruchu)
 *   v = oy - y * sy      (y w mm w głąb sceny)
 * Cztery niewspółliniowe punkty wystarczą do wyznaczenia homografii.
 */
const OX = 200;
const OY = 900;
const SX = 0.5; // px per mm poziomo
const SY = 0.5;

function worldToPx(x: number, y: number): ImagePointPx {
  return { u: OX + x * SX, v: OY - y * SY };
}

function buildRecord(opts?: { withTakeoffLine?: boolean; landingArea?: ImagePointPx[] }) {
  const groundPointsMm: GroundPointMm[] = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 0, y: 1000 },
    { x: 3000, y: 1000 },
  ];
  const imagePointsPx = groundPointsMm.map((p) => worldToPx(p.x, p.y));
  const takeoffLinePx: [ImagePointPx, ImagePointPx] = [worldToPx(0, 0), worldToPx(0, 1000)];
  const built = buildCalibrationRecord({
    videoHash: "vh_test",
    calibrationType: "MANUAL_GROUND_POINTS",
    referenceFrameIndex: 0,
    referenceTimestampUs: 0,
    imagePointsPx,
    groundPointsMm,
    takeoffLinePx: opts?.withTakeoffLine === false ? undefined : takeoffLinePx,
    landingAreaPolygonPx: opts?.landingArea,
    now: "2026-01-01T00:00:00.000Z",
    calibrationId: "cal_test",
  });
  if (!built.ok) throw new Error("kalibracja nieudana: " + built.errors.join(", "));
  return built.record;
}

function emptyLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
}

function pose(frameIndex: number, heelXmm: number, heelYmm = 500): FramePose {
  const lm = emptyLandmarks();
  const px = worldToPx(heelXmm, heelYmm);
  const nx = px.u / WIDTH;
  const ny = px.v / HEIGHT;
  for (const idx of [POSE.LEFT_HEEL, POSE.RIGHT_HEEL, POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX]) {
    lm[idx] = { x: nx, y: ny, z: 0, visibility: 1 };
  }
  return {
    frameIndex,
    mediaTime: frameIndex / 120,
    presentationTimestamp: frameIndex / 120,
    sourceTimestampUs: Math.round((frameIndex / 120) * 1e6),
    landmarks: lm,
    peopleCount: 1,
    trackingConfidence: 1,
  };
}

function ctxWith(record: ReturnType<typeof buildRecord> | null, landingXmm: number): AnalysisContext {
  return {
    testType: "broad_jump",
    metadata: {
      fps: 120,
      fpsMeasured: true,
      declaredFps: 120,
      durationSeconds: 1,
      frameCount: 3,
      width: WIDTH,
      height: HEIGHT,
      orientation: "landscape",
    },
    poses: [pose(0, 0), pose(1, landingXmm / 2), pose(2, landingXmm)],
    cameraSetup: "side",
    calibration: record ? { homography: record.homographyMatrix ?? undefined } : null,
    calibrationRecord: record,
  };
}

const EVENTS: DetectedEvent[] = [
  { type: "takeoff", frameIndex: 0, timestampSeconds: 0, confidence: 0.9 },
  { type: "landing", frameIndex: 2, timestampSeconds: 0.9, confidence: 0.9 },
];

describe("horizontalDistance — pomiar pięty przez homografię", () => {
  it("Broad Jump bez kalibracji → NO_HOMOGRAPHY", () => {
    const res = measureGroundHorizontalDistance(ctxWith(null, 2200), EVENTS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("NO_HOMOGRAPHY");
  });

  it("Broad Jump z kalibracją → mierzy prostopadłą odległość pięty (cm)", () => {
    const res = measureGroundHorizontalDistance(ctxWith(buildRecord(), 2200), EVENTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.distanceCm).toBeCloseTo(220, 0);
  });

  it("bez linii wybicia → NO_TAKEOFF_LINE", () => {
    const res = measureGroundHorizontalDistance(
      ctxWith(buildRecord({ withTakeoffLine: false }), 2200),
      EVENTS,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("NO_TAKEOFF_LINE");
  });

  it("lądowanie poza obszarem kalibracji → LANDING_OUT_OF_CALIBRATION_AREA", () => {
    // Strefa lądowania ograniczona do x<1500 mm; skok 2200 mm wypada poza nią.
    const landingArea = [worldToPx(0, 0), worldToPx(1500, 0), worldToPx(1500, 1000), worldToPx(0, 1000)];
    const res = measureGroundHorizontalDistance(
      ctxWith(buildRecord({ landingArea }), 2200),
      EVENTS,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("LANDING_OUT_OF_CALIBRATION_AREA");
  });

  it("zasłonięta pięta (visibility niskie) → HEEL_OCCLUDED", () => {
    const ctx = ctxWith(buildRecord(), 2200);
    const lm = ctx.poses[2].landmarks!;
    for (const idx of [POSE.LEFT_HEEL, POSE.RIGHT_HEEL]) lm[idx].visibility = 0.1;
    const res = measureGroundHorizontalDistance(ctx, EVENTS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("HEEL_OCCLUDED");
  });

  it("10 identycznych analiz → identyczny wynik i piksel pięty", () => {
    const results = Array.from({ length: 10 }, () =>
      measureGroundHorizontalDistance(ctxWith(buildRecord(), 2200), EVENTS),
    );
    const first = results[0];
    expect(first.ok).toBe(true);
    for (const r of results) expect(JSON.stringify(r)).toBe(JSON.stringify(first));
  });
});

describe("canInheritCalibration — potwierdzenie zgodności sceny", () => {
  const fc = frameConfigurationHash({ width: WIDTH, height: HEIGHT, fps: 120, orientation: "landscape" });

  it("druga próba bez zmiany kamery → można odziedziczyć", () => {
    const rec = buildRecord();
    const sig = sceneSignatureFromRecord(rec, fc, "bg1");
    const res = canInheritCalibration(sig, { ...sig });
    expect(res.ok).toBe(true);
  });

  it("druga próba po przesunięciu kamery → CAMERA_SETUP_CHANGED", () => {
    const rec = buildRecord();
    const sig = sceneSignatureFromRecord(rec, fc, "bg1");
    const moved = {
      ...sig,
      markerPointsPx: sig.markerPointsPx.map((p) => ({ u: p.u + 40, v: p.v + 20 })),
    };
    const res = canInheritCalibration(sig, moved);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CAMERA_SETUP_CHANGED");
  });
});
