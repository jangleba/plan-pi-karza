import { describe, it, expect } from "vitest";
import {
  calcTemporalResolution,
  calcSpatialResolution,
  validateCalibrationQuality,
  eventUncertaintyMs,
  summedTimeUncertaintyMs,
  jumpHeightUncertaintyCm,
  distanceUncertaintyMm,
  speedUncertaintyMps,
  precisionFromUncertainty,
  formatResult,
  computeMeasurementAccuracy,
  JUMP_FPS_POLICY,
  GRAVITY_STANDARD,
} from "./measurementAccuracy";

describe("TemporalResolutionCalculator", () => {
  it("liczy FPS z realnych timestampów (mediana odstępu), nie z deklaracji", () => {
    // 240 FPS → 4166.67 us odstępu
    const us = Array.from({ length: 10 }, (_, i) => Math.round(i * 1_000_000 / 240));
    const t = calcTemporalResolution(us);
    expect(t.measuredFps).toBeGreaterThan(239);
    expect(t.measuredFps).toBeLessThan(241);
    expect(t.temporalResolutionMs).toBeCloseTo(t.frameIntervalMs / 2, 5);
    expect(t.reliable).toBe(true);
  });

  it("jest odporny na drobne wahania odstępu (mediana)", () => {
    const us = [0, 16600, 33400, 50000, 66700, 83300];
    const t = calcTemporalResolution(us);
    expect(t.measuredFps).toBeGreaterThan(58);
    expect(t.measuredFps).toBeLessThan(62);
  });
});

describe("SpatialResolutionCalculator", () => {
  it("liczy mm/piksel i zwraca null bez kalibracji", () => {
    expect(calcSpatialResolution(null)).toBeNull();
    const s = calcSpatialResolution({ referencePixels: 100, referenceMillimeters: 1000 });
    expect(s?.mmPerPixel).toBe(10);
  });
});

describe("CalibrationQualityValidator", () => {
  it("wymaga kalibracji gdy required=true a brak danych", () => {
    const r = validateCalibrationQuality({ required: true, present: false });
    expect(r.status).toBe("required");
    expect(r.errors).toContain("CALIBRATION_REQUIRED");
  });
  it("wykrywa niestabilne markery i zbyt duży reprojectionError", () => {
    expect(
      validateCalibrationQuality({ required: true, present: true, markerStablePx: 5 }).status,
    ).toBe("unstable");
    expect(
      validateCalibrationQuality({ required: true, present: true, reprojectionErrorPx: 9 }).status,
    ).toBe("error_too_high");
  });
});

describe("MeasurementUncertaintyCalculator", () => {
  it("event uncertainty jest konserwatywne: max ze źródeł", () => {
    expect(eventUncertaintyMs({ frameIntervalMs: 8, interpolationResidualMs: 1 })).toBe(4);
    expect(
      eventUncertaintyMs({ frameIntervalMs: 4, interpolationResidualMs: 3, detectionStabilityMs: 5 }),
    ).toBe(5);
  });

  it("propaguje niepewność czasu lotu na wysokość poprawnie (dh = g·t/4·dt)", () => {
    const t = 0.5;
    const dt = 0.01;
    const expected = ((GRAVITY_STANDARD * t) / 4) * dt * 100;
    expect(jumpHeightUncertaintyCm(t, dt)).toBeCloseTo(expected, 3);
  });

  it("sumuje niepewności zdarzeń dla czasu lotu", () => {
    expect(summedTimeUncertaintyMs(4, 4)).toBe(8);
  });

  it("łączy niepewności dystansu przez RSS", () => {
    expect(distanceUncertaintyMm([3, 4])).toBe(5);
  });

  it("propaguje niepewność prędkości", () => {
    const u = speedUncertaintyMps(20, 0.05, 3, 0.02);
    expect(u).toBeGreaterThan(0);
    expect(Number.isFinite(u)).toBe(true);
  });
});

describe("ResultPrecisionFormatter", () => {
  it("dopasowuje precyzję do niepewności — nie pokazuje fałszywej dokładności", () => {
    expect(precisionFromUncertainty(0.006)).toBe(3);
    expect(precisionFromUncertainty(0.08)).toBe(2);
    expect(precisionFromUncertainty(12)).toBe(0);
  });

  it("formatuje wynik z zakresem niepewności", () => {
    const f = formatResult(35.9, 0.8, "cm");
    expect(f.display).toContain("±");
    expect(f.displayWithUnit).toContain("cm");
  });
});

describe("MeasurementAccuracyEngine — quality tiers", () => {
  const base = {
    domain: "temporal" as const,
    fpsPolicy: JUMP_FPS_POLICY,
    calibration: validateCalibrationQuality({ required: false, present: false }),
    relativeUncertainty: 0.02,
    maxRelativeUncertainty: 0.05,
    protocolMatch: true,
    referenceValidated: false,
  };

  it("nie przyznaje LAB_GRADE bez walidacji referencyjnej nawet przy 240 FPS", () => {
    const m = computeMeasurementAccuracy({
      ...base,
      temporal: calcTemporalResolution([0, 4167, 8334, 12500, 16667]),
      repeatability: "verified",
    });
    expect(m.qualityTier).not.toBe("LAB_GRADE");
    expect(["HIGH_ACCURACY", "STANDARD_ESTIMATE"]).toContain(m.qualityTier);
  });

  it("blokuje wynik przy zbyt niskim FPS", () => {
    const m = computeMeasurementAccuracy({
      ...base,
      temporal: calcTemporalResolution([0, 40000, 80000, 120000]), // 25 FPS
      repeatability: "verified",
    });
    expect(m.qualityTier).toBe("INSUFFICIENT_QUALITY");
    expect(m.errors).toContain("FRAME_RATE_TOO_LOW");
    expect(m.officialResult).toBe(false);
  });

  it("odrzuca gdy niepewność przekracza limit", () => {
    const m = computeMeasurementAccuracy({
      ...base,
      relativeUncertainty: 0.2,
      temporal: calcTemporalResolution([0, 8334, 16668, 25000, 33334]), // 120 FPS
      repeatability: "verified",
    });
    expect(m.errors).toContain("RESULT_UNCERTAINTY_TOO_HIGH");
    expect(m.officialResult).toBe(false);
  });

  it("wynik oficjalny gdy protokół, powtarzalność i FPS spełnione", () => {
    const m = computeMeasurementAccuracy({
      ...base,
      temporal: calcTemporalResolution([0, 8334, 16668, 25000, 33334]),
      repeatability: "verified",
    });
    expect(m.officialResult).toBe(true);
    expect(m.validationStatus).toBe("official");
  });
});
