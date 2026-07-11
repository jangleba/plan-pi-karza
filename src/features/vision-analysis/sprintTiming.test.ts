import { describe, it, expect } from "vitest";
import {
  TimingLineRegistry,
  detectTimingPlaneCrossings,
  CrossingUncertaintyCalculator,
  type TimingPlaneInput,
} from "./timingPlane";
import type { FramePose, Landmark, TimingLineSpec } from "./types";
import type { Homography } from "./calibrationProfiles";

/**
 * Testy silnika sprintu z importowanego filmu (Timing Plane).
 *
 * Homografia world(mm)→image(px): u = 0.03·x + 100, v = 0.03·y.
 *  START/TIMING_A ground x=0      → image u = 100
 *  FINISH ground x=20000          → image u = 700
 *  TIMING_B ground x=10000        → image u = 400
 */
const WIDTH = 1000;
const HEIGHT = 1000;
const H: Homography = [0.03, 0, 100, 0, 0.03, 0, 0, 0, 1];

function line(id: string, role: TimingLineSpec["role"], x: number): TimingLineSpec {
  return {
    id,
    role,
    groundStartPointMm: { x, y: 0 },
    groundEndPointMm: { x, y: 3000 },
    direction: "forward",
  };
}

const SPRINT_LINES: TimingLineSpec[] = [line("start", "START", 0), line("finish", "FINISH", 20000)];
const FLYING_LINES: TimingLineSpec[] = [
  line("a", "TIMING_A", 0),
  line("b", "TIMING_B", 10000),
];

function lm(x: number, y: number, vis = 1): Landmark {
  return { x, y, z: 0, visibility: vis };
}

/** Sekwencja klatek: sylwetka przemieszcza się poziomo, dużo w kadrze. */
function buildPoses(opts?: {
  frames?: number;
  fps?: number;
  torsoVisibility?: number;
  silhouetteHeight?: number;
  reverse?: boolean;
  xStart?: number;
  xEnd?: number;
}): FramePose[] {
  const frames = opts?.frames ?? 60;
  const fps = opts?.fps ?? 240;
  const vis = opts?.torsoVisibility ?? 1;
  const sil = opts?.silhouetteHeight ?? 0.6;
  const xs = opts?.reverse ? 0.75 : opts?.xStart ?? 0.02;
  const xe = opts?.reverse ? 0.02 : opts?.xEnd ?? 0.75;
  const intervalUs = Math.round(1_000_000 / fps);
  const poses: FramePose[] = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const normX = xs + (xe - xs) * t;
    const topY = 0.2;
    const bottomY = topY + sil;
    const arr: Landmark[] = new Array(33).fill(null).map(() => lm(normX, 0.5));
    arr[0] = lm(normX, topY); // NOSE
    arr[11] = lm(normX, 0.4, vis); // shoulders/hips (torso ref)
    arr[12] = lm(normX, 0.4, vis);
    arr[23] = lm(normX, 0.55, vis);
    arr[24] = lm(normX, 0.55, vis);
    arr[27] = lm(normX, bottomY); // ankles
    arr[28] = lm(normX, bottomY);
    poses.push({
      frameIndex: i,
      sourceFrameIndex: i,
      mediaTime: (i * intervalUs) / 1_000_000,
      presentationTimestamp: (i * intervalUs) / 1_000_000,
      sourceTimestampUs: i * intervalUs,
      landmarks: arr,
      peopleCount: 1,
      trackingConfidence: 0.9,
    });
  }
  return poses;
}

function sprintInput(over?: Partial<TimingPlaneInput>): TimingPlaneInput {
  return {
    poses: buildPoses(),
    homography: H,
    registry: TimingLineRegistry.from(SPRINT_LINES),
    requiredRoles: ["START", "FINISH"],
    width: WIDTH,
    height: HEIGHT,
    cameraStable: true,
    protocolDistanceMm: 20000,
    ...over,
  };
}

describe("TimingPlaneCrossingEngine — sprint z importowanego filmu", () => {
  it("1. Sprint bez linii → TIMING_LINE_NOT_CALIBRATED (REJECTED)", () => {
    const res = detectTimingPlaneCrossings(
      sprintInput({ registry: TimingLineRegistry.from([]) }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.resultQuality).toBe("REJECTED");
      expect(res.code).toBe("TIMING_LINE_NOT_CALIBRATED");
    }
  });

  it("2. Sprint z liniami → OFFICIAL, dwa przecięcia z rolami, dystans znany", () => {
    const res = detectTimingPlaneCrossings(sprintInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.crossings).toHaveLength(2);
    const roles = res.crossings.map((c) => c.role).sort();
    expect(roles).toEqual(["FINISH", "START"]);
    expect(res.distanceMm).toBe(20000);
    expect(res.resultQuality).toBe("OFFICIAL");
    // Log przecięcia: każde ma frameBefore/After i signedDistanceToPlane.
    for (const c of res.crossings) {
      expect(c.frameBeforeIndex).toBeGreaterThanOrEqual(0);
      expect(c.frameAfterIndex).toBeGreaterThan(c.frameBeforeIndex);
      expect(Number.isFinite(c.signedDistanceToPlane)).toBe(true);
    }
  });

  it("3. Flying Sprint bez TIMING_B → MISSING_TIMING_LINE", () => {
    const res = detectTimingPlaneCrossings({
      ...sprintInput(),
      registry: TimingLineRegistry.from([line("a", "TIMING_A", 0)]),
      requiredRoles: ["TIMING_A", "TIMING_B"],
      protocolDistanceMm: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MISSING_TIMING_LINE");
  });

  it("3b. Flying Sprint z TIMING_A/TIMING_B → dystans z kalibracji linii", () => {
    const res = detectTimingPlaneCrossings({
      ...sprintInput(),
      registry: TimingLineRegistry.from(FLYING_LINES),
      requiredRoles: ["TIMING_A", "TIMING_B"],
      protocolDistanceMm: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.distanceMm).toBe(10000);
  });

  it("4. Przecięcie w złym kierunku → WRONG_CROSSING_DIRECTION", () => {
    const res = detectTimingPlaneCrossings(sprintInput({ poses: buildPoses({ reverse: true }) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_CROSSING_DIRECTION");
  });

  it("5. Film zbyt szeroki, mała sylwetka → ATHLETE_TOO_SMALL", () => {
    const res = detectTimingPlaneCrossings(
      sprintInput({ poses: buildPoses({ silhouetteHeight: 0.08 }) }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ATHLETE_TOO_SMALL");
  });

  it("5b. Zasłonięty tułów → TORSO_OCCLUDED", () => {
    const res = detectTimingPlaneCrossings(
      sprintInput({ poses: buildPoses({ torsoVisibility: 0.1 }) }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TORSO_OCCLUDED");
  });

  it("6. Film 60 FPS → wynik ESTIMATED (podwyższona niepewność)", () => {
    const res = detectTimingPlaneCrossings(sprintInput({ poses: buildPoses({ fps: 60 }) }));
    // 60 FPS: interwał ~16.67ms, niepewność ~8.33ms > OFFICIAL, <= limit 12ms.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.resultQuality).toBe("ESTIMATED");
  });

  it("7. Film 120 i 240 FPS → OFFICIAL", () => {
    for (const fps of [120, 240]) {
      const res = detectTimingPlaneCrossings(sprintInput({ poses: buildPoses({ fps }) }));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.resultQuality).toBe("OFFICIAL");
    }
  });

  it("7b. Bardzo wysokie FPS (240) — niepewność liczona z realnych timestampów", () => {
    const poses = buildPoses({ fps: 240 });
    expect(CrossingUncertaintyCalculator.frameIntervalMs(poses)).toBeCloseTo(1000 / 240, 3);
  });

  it("8. Ten sam film 10 razy → identyczne klatki, timestampy i elapsed", () => {
    const signatures = Array.from({ length: 10 }, () => {
      const res = detectTimingPlaneCrossings(sprintInput());
      if (!res.ok) return "FAIL";
      const ord = [...res.crossings].sort((a, b) => a.crossingTimestampUs - b.crossingTimestampUs);
      return JSON.stringify(
        ord.map((c) => ({
          role: c.role,
          frameBeforeIndex: c.frameBeforeIndex,
          frameAfterIndex: c.frameAfterIndex,
          crossingTimestampUs: c.crossingTimestampUs,
          interpolationFraction: c.interpolationFraction,
          signedDistanceToPlane: c.signedDistanceToPlane,
        })),
      );
    });
    expect(new Set(signatures).size).toBe(1);
    expect(signatures[0]).not.toBe("FAIL");
  });

  it("blokuje po ruchu kamery → CALIBRATION_CAMERA_MOVED", () => {
    const res = detectTimingPlaneCrossings(sprintInput({ cameraStable: false }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CALIBRATION_CAMERA_MOVED");
  });

  it("blokuje bez znanego dystansu (brak kalibracji ground + brak protokołu)", () => {
    const res = detectTimingPlaneCrossings({
      ...sprintInput(),
      registry: TimingLineRegistry.from([
        { id: "start", role: "START", worldXmm: 0, direction: "forward" },
        { id: "finish", role: "FINISH", worldXmm: 2000, direction: "forward" },
      ]),
      protocolDistanceMm: null,
    });
    // worldXmm daje znany dystans 2000 → nadal OK; usuwamy też worldXmm:
    const res2 = detectTimingPlaneCrossings({
      ...sprintInput(),
      registry: TimingLineRegistry.from([
        { id: "start", role: "START", direction: "forward" },
        { id: "finish", role: "FINISH", direction: "forward" },
      ]),
      protocolDistanceMm: null,
    });
    expect(res.ok).toBe(true);
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.code).toBe("DISTANCE_UNKNOWN");
  });
});
