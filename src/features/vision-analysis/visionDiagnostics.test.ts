import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FramePose, VideoMetadata } from "./types";

const mocks = vi.hoisted(() => {
  const frameCount = 12;
  const schedule = Array.from({ length: frameCount }, (_, i) => ({
    frameIndex: i,
    sourceFrameIndex: i,
    mediaTime: i / 30,
    presentationTimestamp: i / 30,
    sourceTimestampMs: Math.round((i * 1000) / 30),
    sourceTimestampUs: Math.round((i * 1_000_000) / 30),
  }));

  const metadata: VideoMetadata = {
    fps: 30,
    fpsMeasured: true,
    declaredFps: 30,
    durationSeconds: frameCount / 30,
    frameCount,
    width: 1080,
    height: 1920,
    orientation: "portrait",
  };

  /** Klatki bez wiarygodnych bioder/stóp — sygnatura ruchu jest UNKNOWN. */
  function unreliablePose(frameIndex: number): FramePose {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
    return {
      frameIndex,
      sourceFrameIndex: frameIndex,
      mediaTime: schedule[frameIndex].mediaTime,
      presentationTimestamp: schedule[frameIndex].mediaTime,
      sourceTimestampMs: schedule[frameIndex].sourceTimestampMs,
      sourceTimestampUs: schedule[frameIndex].sourceTimestampUs,
      mediaPipeTimestampMs: schedule[frameIndex].sourceTimestampMs,
      landmarks,
      peopleCount: 1,
      trackingConfidence: 0.1,
    };
  }

  return {
    schedule,
    metadata,
    unreliablePose,
    seekToFrame: vi.fn(),
    detectPose: vi.fn(),
    readVideoMetadata: vi.fn(),
    video: { currentTime: 0 },
  };
});

vi.mock("./videoFrameReader", () => ({
  createFrameSchedule: () => mocks.schedule,
  createCoarseFrameSchedule: () => mocks.schedule,
  createPrecisionFrameSchedule: () => [],
  seekToFrame: mocks.seekToFrame,
  withLoadedVideoElement: async (
    _url: string,
    _signal: AbortSignal | undefined,
    handler: (video: HTMLVideoElement) => Promise<unknown>,
  ) => handler(mocks.video as HTMLVideoElement),
  readVideoMetadata: mocks.readVideoMetadata,
}));

vi.mock("./poseEngine", () => ({
  clearPoseDebugLog: vi.fn(),
  closePoseEngine: vi.fn(),
  detectPose: mocks.detectPose,
  flushPoseDebugLog: vi.fn(),
  FRAME_TIMESTAMP_ORDER_USER_MESSAGE: "FRAME_TIMESTAMP_ORDER_USER_MESSAGE",
  isPoseSupported: () => true,
  getPoseEngineDiagnostics: () => ({
    poseDelegate: "CPU",
    timestampCorrectionsCount: 1,
    maximumTimestampCorrectionMs: 2,
  }),
}));

import { runVideoAnalysis, type RunOptions } from "./runVideoAnalysis";

const baseOpts: RunOptions = {
  testType: "pogo_jumps",
  videoUrl: "blob:test-video",
  declaredFps: 30,
  cameraSetup: "side",
};

describe("Vision Lab diagnostics (Phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readVideoMetadata.mockResolvedValue(mocks.metadata);
    mocks.seekToFrame.mockResolvedValue(undefined);
    mocks.detectPose.mockImplementation((_video, frameIndex: number) =>
      Promise.resolve(mocks.unreliablePose(frameIndex)),
    );
  });

  it("does not include diagnostics when debugDiagnostics is not set", async () => {
    const result = await runVideoAnalysis(baseOpts);
    expect(result.status).toBe("invalid_recording");
    expect(result.diagnostics).toBeUndefined();
    expect("diagnostics" in result).toBe(false);
  });

  it("does not include diagnostics when debugDiagnostics is explicitly false", async () => {
    const result = await runVideoAnalysis({ ...baseOpts, debugDiagnostics: false });
    expect(result.diagnostics).toBeUndefined();
    expect("diagnostics" in result).toBe(false);
  });

  it("returns exactly the documented diagnostics fields when debugDiagnostics is true", async () => {
    const result = await runVideoAnalysis({ ...baseOpts, debugDiagnostics: true });
    expect(result.status).toBe("invalid_recording");
    const diagnostics = result.diagnostics;
    expect(diagnostics).toBeDefined();
    if (!diagnostics) return;

    expect(Object.keys(diagnostics).sort()).toEqual(
      [
        "analysisRunId",
        "declaredFps",
        "measuredFps",
        "fpsSourceUsed",
        "scheduledFrameCount",
        "firstTimestampsMs",
        "lastTimestampsMs",
        "decodedFrames",
        "attemptedPoseFrames",
        "validPoseFrames",
        "poseErrors",
        "timestampOrderErrors",
        "poseDelegate",
        "timestampCorrectionsCount",
        "maximumTimestampCorrectionMs",
        "airSegmentsCount",
        "contactsCount",
        "repeatedCyclesCount",
        "firstRepeatedCycles",
        "movementSignature",
        "selectedTestType",
        "recognizedTestType",
        "detectedRepetitions",
        "requiredRepetitions",
        "protocolMatch",
        "protocolDecisionReason",
        "calibrationPresent",
        "pipelineSnapshot",
      ].sort(),
    );

    expect(diagnostics.analysisRunId).toBe(result.analysisId);
    expect(diagnostics.declaredFps).toBe(30);
    expect(diagnostics.measuredFps).toBe(30);
    expect(diagnostics.fpsSourceUsed).toBe("measured");
    expect(diagnostics.scheduledFrameCount).toBe(mocks.schedule.length);
    expect(diagnostics.firstTimestampsMs.length).toBeLessThanOrEqual(10);
    expect(diagnostics.lastTimestampsMs.length).toBeLessThanOrEqual(10);
    expect(diagnostics.decodedFrames).toBe(mocks.schedule.length);
    expect(diagnostics.attemptedPoseFrames).toBe(mocks.schedule.length);
    expect(diagnostics.validPoseFrames).toBe(mocks.schedule.length);
    expect(diagnostics.poseErrors).toBe(0);
    expect(diagnostics.timestampOrderErrors).toBe(0);
    expect(diagnostics.poseDelegate).toBe("CPU");
    expect(diagnostics.timestampCorrectionsCount).toBe(1);
    expect(diagnostics.maximumTimestampCorrectionMs).toBe(2);
    expect(diagnostics.movementSignature).toBe("UNKNOWN");
    expect(diagnostics.selectedTestType).toBe("pogo_jumps");
    expect(diagnostics.protocolMatch).toBe(false);
    expect(typeof diagnostics.protocolDecisionReason).toBe("string");
    expect(diagnostics.calibrationPresent).toBe(false);
    expect(diagnostics.firstRepeatedCycles.length).toBeLessThanOrEqual(5);
    expect(diagnostics.pipelineSnapshot.analysisRunId).toBe(result.analysisId);
  });

  it("never persists diagnostics to Supabase or localStorage (in-memory only)", async () => {
    const hasLocalStorage = typeof localStorage !== "undefined";
    const setItemSpy = hasLocalStorage ? vi.spyOn(localStorage, "setItem") : null;
    const result = await runVideoAnalysis({ ...baseOpts, debugDiagnostics: true });
    expect(result.diagnostics).toBeDefined();
    if (setItemSpy) {
      expect(setItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    }
  });
});
