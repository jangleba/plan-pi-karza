import { describe, it, expect } from "vitest";
import { detectBraking, type BrakingInput } from "./brakingEngine";
import { TimingLineRegistry } from "./timingPlane";
import type { FramePose, Landmark, TimingLineSpec } from "./types";
import type { Homography } from "./calibrationProfiles";

/**
 * Testy silnika hamowania (Sprint-to-Stop / DECELERATION).
 *
 * Homografia world(mm)→image(px): u = 0.03·x + 100, v = 0.03·y.
 *   world x = (u - 100) / 0.03  →  u = 0.03·x + 100
 * Dla torsu/stóp znormalizowanych t: u = t·1000 → world x = (t·1000 - 100)/0.03.
 */
const WIDTH = 1000;
const HEIGHT = 1000;
const H: Homography = [0.03, 0, 100, 0, 0.03, 0, 0, 0, 1];

/** world x (mm) → znormalizowana pozycja pozioma (u/width). */
function normFromWorld(xmm: number): number {
  return (0.03 * xmm + 100) / WIDTH;
}

function lm(x: number, y: number, vis = 1): Landmark {
  return { x, y, z: 0, visibility: vis };
}

function line(id: string, role: TimingLineSpec["role"], x: number): TimingLineSpec {
  return { id, role, groundStartPointMm: { x, y: 0 }, groundEndPointMm: { x, y: 3000 } };
}

function frame(i: number, tsUs: number, torsoNorm: number, footNorm: number, footY = 0.8): FramePose {
  const arr: Landmark[] = new Array(33).fill(null).map(() => lm(torsoNorm, 0.4));
  arr[0] = lm(torsoNorm, 0.2);
  arr[11] = lm(torsoNorm, 0.4);
  arr[12] = lm(torsoNorm, 0.4);
  arr[23] = lm(torsoNorm, 0.5);
  arr[24] = lm(torsoNorm, 0.5);
  arr[27] = lm(footNorm, footY);
  arr[28] = lm(footNorm, footY);
  arr[29] = lm(footNorm, footY + 0.02);
  arr[30] = lm(footNorm, footY + 0.02);
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

/**
 * Buduje serię z pozycji świata (mm). Tors i stopa mają tę samą pozycję poziomą
 * (pomiar prędkości = stopa; wejście = tors). fps steruje odstępem timestampów.
 */
function poseSeqWorld(worldXmm: number[], fps: number): FramePose[] {
  const intervalUs = Math.round(1_000_000 / fps);
  return worldXmm.map((x, i) => {
    const n = normFromWorld(x);
    return frame(i, i * intervalUs, n, n);
  });
}

/**
 * Profil ruchu hamowania: sprint ze stałą prędkością do strefy, potem
 * deceleracja do zatrzymania. Zwraca pozycje świata (mm).
 */
function brakingProfile(opts: {
  entrySpeedMs: number;
  fps: number;
  approachMm: number;
  stopMm: number;
  decelFrames: number;
}): number[] {
  const { entrySpeed, fps } = { entrySpeed: opts.entrySpeedMs, fps: opts.fps };
  const dt = 1 / fps;
  const stepMm = entrySpeed * dt * 1000;
  const xs: number[] = [];
  let x = 0;
  // Faza sprintu do wejścia strefy.
  while (x < opts.approachMm) {
    xs.push(x);
    x += stepMm;
  }
  // Faza hamowania: liniowe wytracanie prędkości do zera na dystansie do stopMm.
  const brakeDist = opts.stopMm - x;
  for (let k = 1; k <= opts.decelFrames; k++) {
    const frac = k / opts.decelFrames;
    // pozycja: kwadratowe wyhamowanie (prędkość maleje liniowo)
    const eased = 1 - (1 - frac) ** 2;
    xs.push(x + brakeDist * eased);
  }
  // Pełne zatrzymanie: kilka klatek w miejscu.
  const last = xs[xs.length - 1];
  for (let k = 0; k < 8; k++) xs.push(last);
  return xs;
}

const ZONE = [
  line("entry", "BRAKING_ENTRY", 5000),
  line("zs", "STOP_ZONE_START", 6500),
  line("ze", "STOP_ZONE_END", 8500),
];

function calibratedInput(over?: Partial<BrakingInput>): BrakingInput {
  const xs = brakingProfile({
    entrySpeedMs: 6,
    fps: 120,
    approachMm: 5200,
    stopMm: 7500,
    decelFrames: 24,
  });
  return {
    poses: poseSeqWorld(xs, 120),
    homography: H,
    registry: TimingLineRegistry.from(ZONE),
    width: WIDTH,
    height: HEIGHT,
    cameraStable: true,
    ...over,
  };
}

describe("BrakingEngine — Sprint-to-Stop (CALIBRATED)", () => {
  it("prawidłowe hamowanie → pełne metryki i zatrzymanie w strefie", () => {
    const res = detectBraking(calibratedInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("CALIBRATED");
    expect(res.entrySpeedMs).toBeGreaterThan(3);
    expect(res.stopTimestampUs).toBeGreaterThan(res.brakingStartTimestampUs);
    expect(res.brakingTimeS).toBeGreaterThan(0);
    expect(res.brakingDistanceMm).not.toBeNull();
    expect(res.contactsDuringBraking).toBeGreaterThanOrEqual(0);
    expect(res.bodyControl.decelerationSmoothness).not.toBeNull();
  });

  it("brak strefy (brak linii) → tryb technique_only, bez prędkości/metrów", () => {
    const res = detectBraking(calibratedInput({ registry: TimingLineRegistry.from([]) }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("TECHNIQUE_ONLY");
    expect(res.entrySpeedMs).toBeNull();
    expect(res.brakingDistanceMm).toBeNull();
  });

  it("brak zatrzymania (bieg przez strefę) → NO_SPEED_REDUCTION / STOP_NOT_DETECTED", () => {
    // Stała prędkość przez cały czas, bez hamowania.
    const dt = 1 / 120;
    const step = 6 * dt * 1000;
    const xs = Array.from({ length: 60 }, (_, i) => i * step);
    const res = detectBraking(calibratedInput({ poses: poseSeqWorld(xs, 120) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(["NO_SPEED_REDUCTION", "STOP_NOT_DETECTED"]).toContain(res.code);
  });

  it("zwykły sprint (brak redukcji prędkości) → NO_SPEED_REDUCTION", () => {
    const dt = 1 / 120;
    const step = 7 * dt * 1000;
    const xs = Array.from({ length: 50 }, (_, i) => i * step);
    const res = detectBraking(calibratedInput({ poses: poseSeqWorld(xs, 120) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(["NO_SPEED_REDUCTION", "STOP_NOT_DETECTED"]).toContain(res.code);
  });

  it("zbyt wolne wejście (brak prawidłowego sprintu) → INVALID_APPROACH_SPRINT", () => {
    const xs = brakingProfile({ entrySpeedMs: 1.5, fps: 120, approachMm: 5200, stopMm: 6800, decelFrames: 24 });
    const res = detectBraking(calibratedInput({ poses: poseSeqWorld(xs, 120) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("INVALID_APPROACH_SPRINT");
  });

  it("zatrzymanie poza strefą → STOP_OUT_OF_ZONE", () => {
    // Zatrzymanie na 3000 mm, przed strefą 6500–8500.
    const xs = brakingProfile({ entrySpeedMs: 6, fps: 120, approachMm: 5200, stopMm: 5600, decelFrames: 24 });
    const res = detectBraking(calibratedInput({ poses: poseSeqWorld(xs, 120) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("STOP_OUT_OF_ZONE");
  });

  it("zmiana kierunku zamiast zatrzymania → DIRECTION_CHANGE_NOT_STOP", () => {
    // Sprint w strefę, potem wyraźny ruch wstecz (zmiana kierunku).
    const dt = 1 / 120;
    const step = 6 * dt * 1000;
    const fwd = Array.from({ length: 20 }, (_, i) => i * step);
    const peak = fwd[fwd.length - 1];
    const back = Array.from({ length: 20 }, (_, i) => peak - (i + 1) * step);
    const res = detectBraking(calibratedInput({ poses: poseSeqWorld([...fwd, ...back], 120) }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("DIRECTION_CHANGE_NOT_STOP");
  });

  it("druga próba po zmianie kadru (kamera poruszona) → CALIBRATION_CAMERA_MOVED", () => {
    const res = detectBraking(calibratedInput({ cameraStable: false }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("CALIBRATION_CAMERA_MOVED");
  });

  it("znana prędkość wejściowa z bramki jest respektowana", () => {
    const res = detectBraking(calibratedInput({ knownEntrySpeedMs: 7.2 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entrySpeedMs).toBe(7.2);
  });

  it("ten sam film 10× → identyczne klatki, timestampy i wynik", () => {
    const sigs = Array.from({ length: 10 }, () => {
      const r = detectBraking(calibratedInput());
      if (!r.ok) return "FAIL";
      return JSON.stringify({
        entry: r.entryTimestampUs,
        start: r.brakingStartTimestampUs,
        stop: r.stopTimestampUs,
        time: r.brakingTimeS,
        dist: r.brakingDistanceMm,
        speed: r.entrySpeedMs,
        contacts: r.contactsDuringBraking,
      });
    });
    expect(new Set(sigs).size).toBe(1);
    expect(sigs[0]).not.toBe("FAIL");
  });
});

describe("BrakingEngine — TECHNIQUE_ONLY (bez kalibracji)", () => {
  function techInput(over?: Partial<BrakingInput>): BrakingInput {
    // Ruch tylko w pikselach: przyspieszenie, potem hamowanie do stopu.
    const dt = 1 / 120;
    const step = 6 * dt * 1000; // mm — ale bez homografii traktowane jako px norm
    const xs = brakingProfile({ entrySpeedMs: 6, fps: 120, approachMm: 5200, stopMm: 7500, decelFrames: 24 });
    void step;
    return {
      poses: poseSeqWorld(xs, 120),
      homography: null,
      registry: TimingLineRegistry.from([]),
      width: WIDTH,
      height: HEIGHT,
      cameraStable: true,
      ...over,
    };
  }

  it("wykrywa hamowanie bez prędkości i metrów", () => {
    const res = detectBraking(techInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("TECHNIQUE_ONLY");
    expect(res.resultQuality).toBe("TECHNIQUE_ONLY");
    expect(res.entrySpeedMs).toBeNull();
    expect(res.brakingDistanceMm).toBeNull();
    expect(res.brakingTimeS).toBeGreaterThan(0);
  });

  it("technique_only ten sam film 10× → identyczne wyniki", () => {
    const sigs = Array.from({ length: 10 }, () => {
      const r = detectBraking(techInput());
      if (!r.ok) return "FAIL";
      return JSON.stringify({ start: r.brakingStartTimestampUs, stop: r.stopTimestampUs, time: r.brakingTimeS });
    });
    expect(new Set(sigs).size).toBe(1);
    expect(sigs[0]).not.toBe("FAIL");
  });
});
