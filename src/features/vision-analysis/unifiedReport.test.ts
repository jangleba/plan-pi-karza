import { describe, it, expect } from "vitest";
import { buildUnifiedReport } from "./unifiedReport";
import type { VideoAnalysisResult } from "./types";

function baseResult(over: Partial<VideoAnalysisResult> = {}): VideoAnalysisResult {
  return {
    analysisId: "a1",
    testType: "cmj",
    status: "completed",
    videoMetadata: { fps: 120, durationSeconds: 3, frameCount: 360, width: 720, height: 1280 },
    keyEvents: [
      { type: "takeoff", frameIndex: 40, timestampSeconds: 0.333, confidence: 0.9 },
      { type: "landing", frameIndex: 92, timestampSeconds: 0.766, confidence: 0.88 },
    ],
    metrics: [
      { key: "jump_height", label: "Wysokość skoku", value: 35.94, unit: "cm", confidence: 0.9, uncertainty: 0.8, displayPrecision: 1, display: "35.9 ± 0.8 cm" },
    ],
    overallConfidence: 0.9,
    qualityIssues: [],
    retakeInstructions: [],
    analyzerVersion: "cmj-1.0.0",
    decodedFrames: 350,
    analyzedFrames: 340,
    recognition: { selectedTestType: "cmj", detectedSignature: "SINGLE_FLIGHT", detectedTestConfidence: 0.87, protocolMatch: true },
    measurement: {
      qualityTier: "HIGH_ACCURACY",
      repeatabilityStatus: "verified",
      calibrationStatus: "not_required",
      validationStatus: "official",
      officialResult: true,
      errors: [],
      sourceFrameRate: 119.8,
      frameIntervalMs: 8.35,
      temporalResolutionMs: 4.17,
      spatialResolutionMmPerPixel: null,
      relativeUncertainty: 0.022,
    },
    ...over,
  };
}

describe("buildUnifiedReport", () => {
  it("mapuje OFFICIAL i wszystkie wymagane pola raportu", () => {
    const r = buildUnifiedReport(baseResult());
    expect(r.resultStatus).toBe("OFFICIAL");
    expect(r.qualityTier).toBe("HIGH_ACCURACY");
    expect(r.selectedTestType).toBe("cmj");
    expect(r.detectedTestType).toBe("SINGLE_FLIGHT");
    expect(r.protocolMatch).toBe(true);
    expect(r.measuredFrameRate).toBeCloseTo(119.8);
    expect(r.decodedFrames).toBe(350);
    expect(r.analyzedFrames).toBe(340);
    expect(r.algorithmVersion).toBe("cmj-1.0.0");
    expect(r.protocolVersion).toBeTruthy();
    expect(r.resultRelativeUncertainty).toBeCloseTo(0.022);
    expect(r.keyEvents).toHaveLength(2);
    expect(r.metrics[0].display).toContain("±");
  });

  it("buduje sekcję Jak zmierzono z klatkami przed/po i niepewnością", () => {
    const r = buildUnifiedReport(baseResult());
    expect(r.howMeasured).toHaveLength(2);
    const takeoff = r.howMeasured[0];
    expect(takeoff.frameBefore).toBe(39);
    expect(takeoff.frameAfter).toBe(41);
    expect(takeoff.markedBodyPart).toContain("stopa");
    expect(takeoff.uncertaintyMs).toBeCloseTo(4.175, 2);
    expect(takeoff.adapter).toContain("cmj@");
  });

  it("wynik bez officialResult jest ESTIMATED", () => {
    const r = buildUnifiedReport(
      baseResult({ measurement: { ...baseResult().measurement!, officialResult: false, qualityTier: "STANDARD_ESTIMATE" } }),
    );
    expect(r.resultStatus).toBe("ESTIMATED");
    expect(r.qualityTier).toBe("STANDARD_ESTIMATE");
  });

  it("technique_only → TECHNIQUE_ONLY", () => {
    const r = buildUnifiedReport(baseResult({ status: "technique_only", metrics: [], measurement: undefined }));
    expect(r.resultStatus).toBe("TECHNIQUE_ONLY");
    expect(r.qualityTier).toBe("INSUFFICIENT_QUALITY");
  });

  it("invalid/calibration_required/failed → REJECTED", () => {
    for (const status of ["invalid_recording", "calibration_required", "failed"] as const) {
      const r = buildUnifiedReport(baseResult({ status, metrics: [], measurement: undefined }));
      expect(r.resultStatus).toBe("REJECTED");
    }
  });

  it("nigdy nie mapuje LAB_GRADE — spłaszcza do HIGH_ACCURACY", () => {
    const r = buildUnifiedReport(
      baseResult({ measurement: { ...baseResult().measurement!, qualityTier: "LAB_GRADE" } }),
    );
    expect(r.qualityTier).toBe("HIGH_ACCURACY");
  });

  it("ten sam wynik daje identyczny raport (determinizm)", () => {
    const a = JSON.stringify(buildUnifiedReport(baseResult()));
    const b = JSON.stringify(buildUnifiedReport(baseResult()));
    expect(a).toBe(b);
  });
});
