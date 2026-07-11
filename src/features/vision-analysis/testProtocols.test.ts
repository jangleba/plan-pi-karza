import { describe, it, expect } from "vitest";
import {
  TEST_PROTOCOL_REGISTRY,
  ALL_TEST_TYPES,
  getTestProtocol,
} from "./testProtocols";
import { testAnalyzerRegistry } from "./testAnalyzerRegistry";
import { recognizeMovement, recognizeTestProtocol } from "./testProtocolRecognizer";
import { createAttemptSession } from "./attemptSessionManager";
import type { FramePose, Landmark } from "./types";
import { POSE } from "./types";

function landmarks(hipY: number, footY: number, hipX = 0.5): Landmark[] {
  const arr: Landmark[] = Array.from({ length: 33 }, () => ({ x: hipX, y: 0.5, z: 0, visibility: 0.9 }));
  arr[POSE.LEFT_HIP] = { x: hipX, y: hipY, z: 0, visibility: 0.95 };
  arr[POSE.RIGHT_HIP] = { x: hipX, y: hipY, z: 0, visibility: 0.95 };
  for (const i of [POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE, POSE.LEFT_HEEL, POSE.RIGHT_HEEL, POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX]) {
    arr[i] = { x: hipX, y: footY, z: 0, visibility: 0.95 };
  }
  return arr;
}

function pose(i: number, hipY: number, footY: number, hipX = 0.5): FramePose {
  const dt = 1 / 120;
  return {
    frameIndex: i,
    mediaTime: i * dt,
    presentationTimestamp: i * dt,
    sourceTimestampMs: Math.round(i * dt * 1000),
    sourceTimestampUs: Math.round(i * dt * 1_000_000),
    mediaPipeTimestampMs: Math.round(i * dt * 1000),
    landmarks: landmarks(hipY, footY, hipX),
    peopleCount: 1,
    trackingConfidence: 0.9,
  };
}

function cmjPoses(): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 90; i++) {
    const airborne = i >= 20 && i < 68;
    p.push(pose(i, airborne ? 0.5 : 0.55, airborne ? 0.5 : 0.9));
  }
  return p;
}

function pogoPoses(): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 120; i++) {
    const phase = i % 12;
    const airborne = phase >= 4;
    p.push(pose(i, 0.55, airborne ? 0.78 : 0.9));
  }
  return p;
}

describe("TestProtocolRegistry", () => {
  it("has a protocol for every real analyzer test (and no invented tests)", () => {
    expect(Object.keys(TEST_PROTOCOL_REGISTRY).sort()).toEqual(Object.keys(testAnalyzerRegistry).sort());
    expect(ALL_TEST_TYPES.length).toBe(12);
  });

  it("algorithmVersion is sourced from the analyzer registry", () => {
    for (const t of ALL_TEST_TYPES) {
      expect(getTestProtocol(t).algorithmVersion).toBe(testAnalyzerRegistry[t].analyzerVersion);
    }
  });

  it("spatial/timing tests require calibration in official requirements", () => {
    expect(getTestProtocol("broad_jump").officialResultRequirements.requiresCalibration).toBe(true);
    expect(getTestProtocol("sprint_20m").officialResultRequirements.requiresTimingLines).toBe(true);
    expect(getTestProtocol("cmj").officialResultRequirements.requiresCalibration).toBe(false);
  });
});

describe("TestProtocolRecognizer", () => {
  it("is deterministic across 10 runs (same frames, timestamps, signature)", () => {
    const runs = Array.from({ length: 10 }, () => recognizeMovement(cmjPoses()));
    for (const r of runs) {
      expect(r).toEqual(runs[0]);
    }
  });

  it("matches CMJ to a single-flight movement", () => {
    const rec = recognizeTestProtocol("cmj", cmjPoses());
    expect(rec.detectedSignature).toBe("SINGLE_FLIGHT");
    expect(rec.protocolMatch).toBe(true);
  });

  it("rejects CMJ when the video is a pogo series (WRONG_REPETITION_COUNT or mismatch)", () => {
    const rec = recognizeTestProtocol("cmj", pogoPoses());
    expect(rec.protocolMatch).toBe(false);
    expect(rec.errorCode).not.toBeNull();
  });

  it("gym technique always passes the gate (coach review)", () => {
    const rec = recognizeTestProtocol("analyze_gym_exercise", cmjPoses());
    expect(rec.protocolMatch).toBe(true);
  });
});

describe("AttemptSessionManager", () => {
  it("single-max test needs 2 valid attempts and keeps the best", () => {
    const s = createAttemptSession("cmj");
    s.addAttempt({ id: "a1", side: "none", valid: true, value: 30, higherIsBetter: true, analysisId: "x1" });
    let state = s.addAttempt({ id: "a2", side: "none", valid: true, value: 34, higherIsBetter: true, analysisId: "x2" });
    expect(state.complete).toBe(true);
    expect(state.finalValue).toBe(34);
  });

  it("allows a replacement attempt only when one was invalid", () => {
    const s = createAttemptSession("cmj");
    s.addAttempt({ id: "a1", side: "none", valid: false, value: null, higherIsBetter: true, analysisId: "x1" });
    const state = s.addAttempt({ id: "a2", side: "none", valid: true, value: 31, higherIsBetter: true, analysisId: "x2" });
    expect(state.complete).toBe(false);
    expect(state.canRecordMore).toBe(true);
  });
});
