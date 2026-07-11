import { describe, it, expect } from "vitest";
import {
  calibrationKey,
  fitHomography,
  projectWorldToImage,
  mmPerPixelFromHomography,
  buildCalibrationProfile,
  isFitAcceptable,
  type CorrespondencePoint,
  type Homography,
} from "./calibrationProfiles";

/** Generuje punkty obrazu z zadanej homografii + szumu. */
function makePoints(H: Homography, wMm: number, hMm: number, noise = 0): CorrespondencePoint[] {
  const worlds = [
    { x: 0, y: 0 },
    { x: wMm / 2, y: 0 },
    { x: wMm, y: 0 },
    { x: wMm, y: hMm / 2 },
    { x: wMm, y: hMm },
    { x: wMm / 2, y: hMm },
    { x: 0, y: hMm },
    { x: 0, y: hMm / 2 },
  ];
  return worlds.map((w, i) => {
    const p = projectWorldToImage(H, w.x, w.y)!;
    const n = noise * (i % 2 === 0 ? 1 : -1);
    return { world: w, image: { u: p.u + n, v: p.v + n } };
  });
}

describe("calibrationKey", () => {
  it("rozróżnia kombinacje urządzenie/obiektyw/orientacja/fps/zoom", () => {
    const base = { deviceId: "iPhone 14", lens: "wide" as const, orientation: "portrait" as const, fps: 120, zoom: 1 };
    const k = calibrationKey(base);
    expect(k).toBe("iphone-14|wide|portrait|120fps|1x");
    expect(calibrationKey({ ...base, zoom: 2 })).not.toBe(k);
    expect(calibrationKey({ ...base, fps: 60 })).not.toBe(k);
    expect(calibrationKey({ ...base, lens: "ultrawide" })).not.toBe(k);
    expect(calibrationKey({ ...base, orientation: "landscape" })).not.toBe(k);
  });
});

describe("fitHomography", () => {
  it("odtwarza homografię idealnie przy braku szumu (reproj ~0)", () => {
    const H: Homography = [2, 0.1, 50, 0.05, 2.1, 40, 0.0002, 0.0001, 1];
    const pts = makePoints(H, 1000, 1000, 0);
    const fit = fitHomography(pts);
    expect(fit).not.toBeNull();
    expect(fit!.reprojectionErrorPx).toBeLessThan(0.01);
    expect(isFitAcceptable(fit!)).toBe(true);
  });

  it("raportuje wyższy reprojectionError przy szumie zaznaczeń", () => {
    const H: Homography = [2, 0, 50, 0, 2, 40, 0, 0, 1];
    const clean = fitHomography(makePoints(H, 1000, 1000, 0))!;
    const noisy = fitHomography(makePoints(H, 1000, 1000, 6))!;
    expect(noisy.reprojectionErrorPx).toBeGreaterThan(clean.reprojectionErrorPx);
  });

  it("zwraca null przy mniej niż 4 punktach", () => {
    expect(fitHomography([])).toBeNull();
  });

  it("mmPerPixel jest dodatnie i sensowne", () => {
    const H: Homography = [2, 0, 50, 0, 2, 40, 0, 0, 1];
    const fit = fitHomography(makePoints(H, 1000, 1000, 0))!;
    const mmpp = mmPerPixelFromHomography(fit, 1000, 1000);
    expect(mmpp).toBeGreaterThan(0);
    expect(mmpp).toBeCloseTo(0.5, 1); // skala 2 px/mm → 0.5 mm/px
  });
});

describe("buildCalibrationProfile", () => {
  it("buduje profil z kluczem i jakością kalibracji", () => {
    const H: Homography = [2, 0, 50, 0, 2, 40, 0, 0, 1];
    const fit = fitHomography(makePoints(H, 1000, 1000, 0))!;
    const profile = buildCalibrationProfile({
      parts: { deviceId: "iPhone 14", lens: "wide", orientation: "portrait", fps: 120, zoom: 1 },
      deviceLabel: "iPhone 14 Pro",
      fit,
      worldWidthMm: 1000,
      worldHeightMm: 1000,
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(profile.key).toBe("iphone-14|wide|portrait|120fps|1x");
    expect(profile.quality.status).toBe("calibrated");
    expect(profile.mmPerPixel).toBeGreaterThan(0);
  });
});
