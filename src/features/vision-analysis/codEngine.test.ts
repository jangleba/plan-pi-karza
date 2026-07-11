import { describe, it, expect } from "vitest";
import { detectCod505, detectCodFiveTenFive, type CodInput } from "./codEngine";
import { TimingLineRegistry } from "./timingPlane";
import type { FramePose, Landmark, TimingLineSpec } from "./types";
import type { Homography } from "./calibrationProfiles";

/**
 * Testy wspólnego silnika COD.
 *
 * Homografia world(mm)→image(px): u = 0.03·x + 100, v = 0.03·y.
 *  world x = (u - 100) / 0.03
 */
const WIDTH = 1000;
const HEIGHT = 1000;
const H: Homography = [0.03, 0, 100, 0, 0.03, 0, 0, 0, 1];

function lm(x: number, y: number, vis = 1): Landmark {
  return { x, y, z: 0, visibility: vis };
}

function line(id: string, role: TimingLineSpec["role"], x: number): TimingLineSpec {
  return { id, role, groundStartPointMm: { x, y: 0 }, groundEndPointMm: { x, y: 3000 } };
}

/** Buduje klatkę z torsem i stopami w zadanych pozycjach znormalizowanych. */
function frame(i: number, tsUs: number, torsoNorm: number, leftFootNorm: number, rightFootNorm: number): FramePose {
  const arr: Landmark[] = new Array(33).fill(null).map(() => lm(torsoNorm, 0.4));
  arr[0] = lm(torsoNorm, 0.2);
  arr[11] = lm(torsoNorm, 0.4);
  arr[12] = lm(torsoNorm, 0.4);
  arr[23] = lm(torsoNorm, 0.5);
  arr[24] = lm(torsoNorm, 0.5);
  arr[27] = lm(leftFootNorm, 0.8);
  arr[28] = lm(rightFootNorm, 0.8);
  arr[29] = lm(leftFootNorm, 0.82); // LEFT_HEEL
  arr[30] = lm(rightFootNorm, 0.82); // RIGHT_HEEL
  return {
    frameIndex: i,
    sourceFrameIndex: i,
    mediaTime: tsUs / 1_000_000,
    presentationTimestamp: tsUs / 1_000_000,
    sourceTimestampUs: tsUs,
    landmarks: arr,
    peopleCount: 1,
    trackingConfidence: 0.9,
  };
}

/** Trajektoria torsu i stóp jako wartości znormalizowane u/width w czasie. */
function poseSeq(
  path: number[],
  fps: number,
  footOffset: { left: number; right: number } = { left: 0, right: 0 },
): FramePose[] {
  const intervalUs = Math.round(1_000_000 / fps);
  return path.map((torso, i) =>
    frame(i, i * intervalUs, torso, torso + footOffset.left, torso + footOffset.right),
  );
}

/** Ścieżka: start → apex → koniec (liniowo, deterministycznie). */
function ramp(from: number, to: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => from + (to - from) * (i / (n - 1)));
}

// --------------------------- 505 ---------------------------

const LINES_505 = [line("timing", "TIMING_A", 0), line("turn", "TURN_LINE", 5000)];

function input505(over?: Partial<CodInput>): CodInput {
  // torso: 0.08 → 0.30 (cross TIMING_A fwd, foot reach turn) → 0.08 (cross back)
  const path = [...ramp(0.08, 0.3, 20), ...ramp(0.3, 0.08, 20)];
  return {
    poses: poseSeq(path, 120, { left: 0.02, right: 0 }),
    homography: H,
    registry: TimingLineRegistry.from(LINES_505),
    width: WIDTH,
    height: HEIGHT,
    cameraStable: true,
    ...over,
  };
}

describe("CodEngine — 505 (pojedynczy zwrot 180°)", () => {
  it("505 bez zwrotu (zwykły sprint) → TURN_NOT_DETECTED", () => {
    const path = ramp(0.08, 0.5, 40); // tylko do przodu, brak powrotu
    const res = detectCod505(input505({ poses: poseSeq(path, 120) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TURN_NOT_DETECTED");
  });

  it("505 z niewłaściwą nogą → WRONG_TURNING_SIDE", () => {
    // Lewa stopa najdalej wysunięta → strona 'left'; oczekiwano 'right'.
    const res = detectCod505(input505({ expectedTurningSide: "right" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_TURNING_SIDE");
  });

  it("505 lewa noga → OFFICIAL, turningSide=left, czas z przecięć", () => {
    const res = detectCod505(input505({ expectedTurningSide: "left" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.turningSide).toBe("left");
    expect(res.resultQuality).toBe("OFFICIAL");
    expect(res.totalTimeS).toBeGreaterThan(0);
    expect(res.secondCrossingTimestampUs).toBeGreaterThan(res.firstCrossingTimestampUs);
  });

  it("505 prawa noga → turningSide=right", () => {
    const res = detectCod505(input505({
      poses: poseSeq([...ramp(0.08, 0.3, 20), ...ramp(0.3, 0.08, 20)], 120, { left: 0, right: 0.02 }),
      expectedTurningSide: "right",
    }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.turningSide).toBe("right");
  });

  it("505 bez dotarcia do linii zwrotu → TURN_LINE_NOT_REACHED", () => {
    // apex torsu 0.18 → world x ~2667 < 4600 (nie dosięga strefy zwrotu 5000mm).
    const path = [...ramp(0.08, 0.18, 20), ...ramp(0.18, 0.08, 20)];
    const res = detectCod505(input505({ poses: poseSeq(path, 120) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TURN_LINE_NOT_REACHED");
  });

  it("505 zły kierunek pierwszego przecięcia → WRONG_CROSSING_DIRECTION", () => {
    const path = ramp(0.3, 0.02, 40); // start po prawej, tylko w lewo
    const res = detectCod505(input505({ poses: poseSeq(path, 120) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_CROSSING_DIRECTION");
  });

  it("505 brak linii → TIMING_LINES_REQUIRED", () => {
    const res = detectCod505(input505({ registry: TimingLineRegistry.from([line("timing", "TIMING_A", 0)]) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TIMING_LINES_REQUIRED");
  });

  it("505 ruch kamery → CALIBRATION_CAMERA_MOVED", () => {
    const res = detectCod505(input505({ cameraStable: false }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CALIBRATION_CAMERA_MOVED");
  });

  it("505 ten sam film 10× → identyczne klatki, timestampy, czas", () => {
    const sigs = Array.from({ length: 10 }, () => {
      const r = detectCod505(input505({ expectedTurningSide: "left" }));
      if (!r.ok) return "FAIL";
      return JSON.stringify({
        first: r.firstCrossingTimestampUs,
        second: r.secondCrossingTimestampUs,
        total: r.totalTimeS,
        side: r.turningSide,
        frames: r.crossings.map((c) => [c.frameBeforeIndex, c.frameAfterIndex, c.interpolationFraction]),
      });
    });
    expect(new Set(sigs).size).toBe(1);
    expect(sigs[0]).not.toBe("FAIL");
  });
});

// --------------------------- 5-10-5 ---------------------------

const LINES_5105 = [
  line("center", "CENTER", 5000),
  line("left", "TURN_LEFT", 0),
  line("right", "TURN_RIGHT", 10000),
];
// image u: CENTER=250, TURN_LEFT=100, TURN_RIGHT=400 → norm: 0.25 / 0.10 / 0.40

function input5105(over?: Partial<CodInput>): CodInput {
  // start 0.23 → prawo 0.42 (reach RIGHT), → lewo 0.08 (reach LEFT), → 0.26 (final center)
  const path = [...ramp(0.23, 0.42, 16), ...ramp(0.42, 0.08, 16), ...ramp(0.08, 0.26, 16)];
  return {
    poses: poseSeq(path, 120),
    homography: H,
    registry: TimingLineRegistry.from(LINES_5105),
    width: WIDTH,
    height: HEIGHT,
    cameraStable: true,
    ...over,
  };
}

describe("CodEngine — 5-10-5 (podwójny zwrot)", () => {
  it("prawidłowy 5-10-5 → OFFICIAL, 3 przecięcia CENTER, czas", () => {
    const res = detectCodFiveTenFive(input5105());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.crossings).toHaveLength(3);
    expect(res.resultQuality).toBe("OFFICIAL");
    expect(res.totalTimeS).toBeGreaterThan(0);
  });

  it("5-10-5 z błędną kolejnością (drugi zwrot na tę samą stronę) → WRONG_LINE_SEQUENCE", () => {
    // prawo → środek → prawo (nie dochodzi do TURN_LEFT).
    const path = [...ramp(0.23, 0.42, 16), ...ramp(0.42, 0.18, 16), ...ramp(0.18, 0.42, 16)];
    const res = detectCodFiveTenFive(input5105({ poses: poseSeq(path, 120) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_LINE_SEQUENCE");
  });

  it("5-10-5 bez zwrotu (zwykły bieg) → TURN_NOT_DETECTED", () => {
    const res = detectCodFiveTenFive(input5105({ poses: poseSeq(ramp(0.23, 0.6, 40), 120) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TURN_NOT_DETECTED");
  });

  it("5-10-5 brak jednej linii → TIMING_LINES_REQUIRED", () => {
    const res = detectCodFiveTenFive(input5105({
      registry: TimingLineRegistry.from([line("center", "CENTER", 5000), line("right", "TURN_RIGHT", 10000)]),
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("TIMING_LINES_REQUIRED");
  });

  it("5-10-5 ten sam film 10× → identyczne wyniki", () => {
    const sigs = Array.from({ length: 10 }, () => {
      const r = detectCodFiveTenFive(input5105());
      if (!r.ok) return "FAIL";
      return JSON.stringify({
        first: r.firstCrossingTimestampUs,
        second: r.secondCrossingTimestampUs,
        total: r.totalTimeS,
        frames: r.crossings.map((c) => [c.frameBeforeIndex, c.frameAfterIndex, c.interpolationFraction]),
      });
    });
    expect(new Set(sigs).size).toBe(1);
    expect(sigs[0]).not.toBe("FAIL");
  });
});
