import { describe, it, expect } from "vitest";
import {
  fitHomography,
  buildCalibrationProfile,
  type CorrespondencePoint,
} from "./calibrationProfiles";
import { groundDistanceMm, invert3x3, applyInverse } from "./homographyGeometry";
import { projectWorldToImage } from "./calibrationProfiles";

/**
 * TEST PRAWDZIWEJ KALIBRACJI (część 8 wymagań).
 *
 * Symulujemy realną kamerę pod kątem (perspektywa) o znanej macierzy world→image.
 * Kalibrujemy prostokąt o znanych wymiarach, a następnie mierzymy przez
 * homografię 5 dodatkowych odcinków podłoża o znanej długości i porównujemy
 * z rzeczywistością. Każdy odcinek mierzymy 10× — musi być identycznie.
 */

// Prawdziwa (nieznana algorytmowi) homografia world(mm)→image(px) kamery pod kątem.
const TRUE_H = [
  0.42, 0.06, 320,
  0.03, 0.38, 210,
  0.00018, 0.00031, 1,
] as const;

function projectTrue(x: number, y: number): { u: number; v: number } {
  const w = TRUE_H[6] * x + TRUE_H[7] * y + TRUE_H[8];
  return {
    u: (TRUE_H[0] * x + TRUE_H[1] * y + TRUE_H[2]) / w,
    v: (TRUE_H[3] * x + TRUE_H[4] * y + TRUE_H[5]) / w,
  };
}

describe("Kalibracja: test znanych odległości przez homografię", () => {
  // Prostokąt kalibracyjny 1000 × 600 mm, 8 punktów (rogi + środki boków).
  const W = 1000;
  const Hmm = 600;
  const calibWorld: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: Hmm },
    { x: 0, y: Hmm },
    { x: W / 2, y: 0 },
    { x: W, y: Hmm / 2 },
    { x: W / 2, y: Hmm },
    { x: 0, y: Hmm / 2 },
  ];
  const points: CorrespondencePoint[] = calibWorld.map((wpt) => ({
    world: wpt,
    image: projectTrue(wpt.x, wpt.y),
  }));

  const fit = fitHomography(points)!;

  it("dopasowuje homografię z niskim błędem reprojekcji", () => {
    expect(fit).not.toBeNull();
    expect(fit.reprojectionErrorPx).toBeLessThan(0.5);
  });

  it("mierzy 5 znanych odcinków z małym błędem i idealną powtarzalnością", () => {
    const segments: {
      id: string;
      a: { x: number; y: number };
      b: { x: number; y: number };
    }[] = [
      { id: "S1", a: { x: 100, y: 100 }, b: { x: 400, y: 100 } }, // 300 mm
      { id: "S2", a: { x: 200, y: 150 }, b: { x: 200, y: 550 } }, // 400 mm
      { id: "S3", a: { x: 0, y: 0 }, b: { x: 800, y: 600 } }, // 1000 mm
      { id: "S4", a: { x: 300, y: 500 }, b: { x: 900, y: 100 } }, // 721.11 mm
      { id: "S5", a: { x: 50, y: 300 }, b: { x: 950, y: 300 } }, // 900 mm
    ];

    const rows: {
      segmentId: string;
      actualDistanceMm: number;
      measuredDistanceMm: number;
      absoluteErrorMm: number;
      relativeErrorPercent: number;
    }[] = [];

    let maxErr = 0;
    let sumErr = 0;

    for (const s of segments) {
      const actual = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      const pa = projectTrue(s.a.x, s.a.y);
      const pb = projectTrue(s.b.x, s.b.y);

      // 10 powtórzeń — każde MUSI być identyczne.
      const measurements: number[] = [];
      for (let r = 0; r < 10; r++) {
        const m = groundDistanceMm(fit.homography, pa, pb)!;
        measurements.push(m);
      }
      for (const m of measurements) expect(m).toBe(measurements[0]);

      const measured = measurements[0];
      const absErr = Math.abs(measured - actual);
      maxErr = Math.max(maxErr, absErr);
      sumErr += absErr;
      rows.push({
        segmentId: s.id,
        actualDistanceMm: Math.round(actual * 100) / 100,
        measuredDistanceMm: measured,
        absoluteErrorMm: Math.round(absErr * 100) / 100,
        relativeErrorPercent: Math.round((absErr / actual) * 10000) / 100,
      });
    }

    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.log(
      `Największy błąd: ${Math.round(maxErr * 100) / 100} mm · Średni błąd: ${
        Math.round((sumErr / rows.length) * 100) / 100
      } mm`,
    );

    // Odwrotność * homografia daje przyzwoitą dokładność (idealna kamera → <2 mm).
    expect(maxErr).toBeLessThan(2);
  });

  it("invert3x3 jest poprawną odwrotnością (H·H⁻¹ ≈ I)", () => {
    const inv = invert3x3(fit.homography)!;
    const back = applyInverse(inv, ...Object.values(projectWorldToImage(fit.homography, 500, 300)!) as [number, number]);
    expect(back).not.toBeNull();
    expect(Math.abs(back!.x - 500)).toBeLessThan(0.5);
    expect(Math.abs(back!.y - 300)).toBeLessThan(0.5);
  });
});
