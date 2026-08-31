import { describe, it, expect } from "vitest";
import {
  detectCalibratedCrossings,
  elapsedSeconds,
  type CrossingInput,
} from "./calibratedLineCrossing";
import type { FramePose, Landmark, TimingLineSpec } from "./types";
import type { Homography } from "./calibrationProfiles";

const WIDTH = 1000;
const HEIGHT = 1000;

/** Homografia world(mm)→image(px): u = 0.1·x + 100, v = 0.1·y (linia pionowa). */
const H: Homography = [0.1, 0, 100, 0, 0.1, 0, 0, 0, 1];

const LINES: TimingLineSpec[] = [
  { id: "start", worldXmm: 0, direction: "forward" }, // → image u = 100
  { id: "finish", worldXmm: 2000, direction: "forward" }, // → image u = 300
];

function landmark(x: number, y: number): Landmark {
  return { x, y, z: 0, visibility: 1 };
}

/** Buduje deterministyczną serię klatek: tułów przemieszcza się w poziomie. */
function buildPoses(frames = 40, fps = 120): FramePose[] {
  const intervalUs = Math.round(1_000_000 / fps);
  const poses: FramePose[] = [];
  for (let i = 0; i < frames; i++) {
    const normX = 0.02 + (i / (frames - 1)) * 0.4; // u: 20 → 420 px
    const normY = 0.3; // v = 300 px
    const lm: Landmark[] = new Array(33).fill(null).map(() => landmark(normX, normY));
    poses.push({
      frameIndex: i,
      sourceFrameIndex: i,
      mediaTime: (i * intervalUs) / 1_000_000,
      presentationTimestamp: (i * intervalUs) / 1_000_000,
      sourceTimestampUs: i * intervalUs,
      landmarks: lm,
      peopleCount: 1,
      trackingConfidence: 0.9,
    });
  }
  return poses;
}

function baseInput(): CrossingInput {
  return {
    poses: buildPoses(),
    homography: H,
    timingLines: LINES,
    width: WIDTH,
    height: HEIGHT,
    cameraStable: true,
  };
}

describe("CalibratedLineCrossingEngine", () => {
  it("wykrywa przecięcie obu linii i liczy elapsed", () => {
    const res = detectCalibratedCrossings(baseInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.crossings).toHaveLength(2);
    const [start, finish] = res.crossings.sort(
      (a, b) => a.crossingTimestampUs - b.crossingTimestampUs,
    );
    expect(start.lineId).toBe("start");
    expect(finish.lineId).toBe("finish");
    expect(elapsedSeconds(start, finish)).toBeGreaterThan(0);
  });

  it("jest w PEŁNI POWTARZALNY: 10/10 identycznych wyników", () => {
    const runs = Array.from({ length: 10 }, () => detectCalibratedCrossings(baseInput()));
    const signature = (r: ReturnType<typeof detectCalibratedCrossings>) =>
      r.ok
        ? JSON.stringify(
            r.crossings.map((c) => ({
              lineId: c.lineId,
              frameBeforeIndex: c.frameBeforeIndex,
              frameAfterIndex: c.frameAfterIndex,
              crossingTimestampUs: c.crossingTimestampUs,
              interpolationFraction: c.interpolationFraction,
            })),
          )
        : "FAIL";
    const first = signature(runs[0]);
    for (const r of runs) expect(signature(r)).toBe(first);

    // Elapsed też identyczny 10/10.
    const elapsed = runs.map((r) => {
      if (!r.ok) return -1;
      const [a, b] = [...r.crossings].sort((x, y) => x.crossingTimestampUs - y.crossingTimestampUs);
      return elapsedSeconds(a, b);
    });
    expect(new Set(elapsed).size).toBe(1);
  });

  it("blokuje bez homografii → TIMING_LINE_NOT_CALIBRATED", () => {
    const res = detectCalibratedCrossings({ ...baseInput(), homography: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TIMING_LINE_NOT_CALIBRATED");
  });

  it("blokuje bez linii → TIMING_LINE_NOT_CALIBRATED", () => {
    const res = detectCalibratedCrossings({ ...baseInput(), timingLines: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TIMING_LINE_NOT_CALIBRATED");
  });

  it("blokuje po ruchu kamery → CALIBRATION_CAMERA_MOVED", () => {
    const res = detectCalibratedCrossings({ ...baseInput(), cameraStable: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CALIBRATION_CAMERA_MOVED");
  });

  it("wykrywa zły kierunek → WRONG_CROSSING_DIRECTION", () => {
    const res = detectCalibratedCrossings({
      ...baseInput(),
      timingLines: [{ id: "start", worldXmm: 0, direction: "backward" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_CROSSING_DIRECTION");
  });

  it("brak przecięcia → LINE_CROSSING_NOT_DETECTED", () => {
    const res = detectCalibratedCrossings({
      ...baseInput(),
      timingLines: [{ id: "far", worldXmm: 100000, direction: "forward" }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("LINE_CROSSING_NOT_DETECTED");
  });

  it("liczy niepewność z lokalnych klatek przy linii, nie z rzadkiego kontekstu", () => {
    const full = buildPoses();
    const keep = new Set([0, 6, 7, 8, 9, 15, 21, 26, 27, 28, 29, 35, 39]);
    const mixed = full.filter((_, index) => keep.has(index));
    const res = detectCalibratedCrossings({ ...baseInput(), poses: mixed });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(
      Math.max(...res.crossings.map((crossing) => crossing.crossingUncertaintyMs)),
    ).toBeLessThan(5);
  });
});
