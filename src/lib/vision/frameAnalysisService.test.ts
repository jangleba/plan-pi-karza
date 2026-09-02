import { describe, expect, it } from "vitest";
import { computeFrameResult, isAthleteFrameAnalysisSupported } from "./frameAnalysisService";

describe("frameAnalysisService — pomiar skoku z potwierdzonych klatek", () => {
  it("kieruje zawodnika tylko do kompletnych przepływów klatkowych", () => {
    expect(isAthleteFrameAnalysisSupported("cmj")).toBe(true);
    expect(isAthleteFrameAnalysisSupported("broad_jump")).toBe(true);
    expect(isAthleteFrameAnalysisSupported("drop_jump")).toBe(false);
    expect(isAthleteFrameAnalysisSupported("sprint_20m")).toBe(false);
    expect(isAthleteFrameAnalysisSupported("pogo_jumps")).toBe(false);
  });

  it("liczy CMJ z czasu lotu i podaje zakres wynikający z jednej klatki", () => {
    const result = computeFrameResult({
      testId: "cmj",
      fps: 120,
      markers: { takeoff_frame: 100, landing_frame: 160 },
      markedBy: "user",
    });

    expect(result.status).toBe("frame_verified");
    expect(result.derived.frameCount).toBe(60);
    expect(result.derived.flightTime).toBe(0.5);
    expect(result.mainResultValue).toBe(30.6);
    expect(result.derived.jumpHeightMinCm).toBeLessThan(30.6);
    expect(result.derived.jumpHeightMaxCm).toBeGreaterThan(30.6);
    expect(result.derived.temporalResolutionMs).toBe(8.3);
  });

  it("obsługuje Squat Jump tą samą metodą czasu lotu", () => {
    const result = computeFrameResult({
      testId: "squat_jump",
      fps: 120,
      markers: { takeoff_frame: 10, landing_frame: 58 },
    });

    expect(result.status).toBe("frame_verified");
    expect(result.mainResultUnit).toBe("cm");
    expect(result.derived.flightTime).toBe(0.4);
  });

  it("liczy Drop Jump z kontaktu, lotu i RSI", () => {
    const result = computeFrameResult({
      testId: "drop_jump",
      fps: 240,
      markers: {
        first_contact_frame: 100,
        takeoff_frame: 148,
        landing_frame: 268,
      },
    });

    expect(result.status).toBe("frame_verified");
    expect(result.derived.contactTime).toBe(0.2);
    expect(result.derived.flightTime).toBe(0.5);
    expect(result.derived.reactiveStrengthIndex).toBe(1.53);
    expect(result.mainResultValue).toBe(1.53);
  });

  it("odrzuca nierealny czas lotu zamiast zapisywać fałszywy wynik", () => {
    const result = computeFrameResult({
      testId: "cmj",
      fps: 120,
      markers: { takeoff_frame: 100, landing_frame: 105 },
    });

    expect(result.status).toBe("invalid");
    expect(result.error).toContain("nierealny czas lotu");
  });

  it("oznacza wynik 30 FPS jako estymowany", () => {
    const result = computeFrameResult({
      testId: "cmj",
      fps: 30,
      markers: { takeoff_frame: 10, landing_frame: 25 },
    });

    expect(result.status).toBe("estimated");
  });

  it("akceptuje Broad Jump tylko z oficjalną kalibracją i klatką lądowania", () => {
    const result = computeFrameResult({
      testId: "broad_jump",
      fps: 120,
      markers: { landing_frame: 80 },
      manual: {
        distance_cm: 224.6,
        landing_point_u: 812.3,
        landing_point_v: 913.8,
        calibration_id: "cal-1",
        calibration_hash: "hash-1",
        calibration_reprojection_error_px: 0.8,
        calibration_official: true,
      },
    });

    expect(result.status).toBe("user_marked");
    expect(result.mainResultValue).toBe(225);
    expect(result.method).toBe("Calibrated Ground Plane");
  });

  it("odrzuca Broad Jump z centymetrami wpisanymi bez kalibracji", () => {
    const result = computeFrameResult({
      testId: "broad_jump",
      fps: 120,
      markers: { landing_frame: 80 },
      manual: { distance_cm: 225 },
    });

    expect(result.status).toBe("invalid");
    expect(result.error).toContain("kalibracji podłoża");
  });
});
