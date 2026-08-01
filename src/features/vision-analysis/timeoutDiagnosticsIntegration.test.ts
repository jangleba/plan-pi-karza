import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FramePose, VideoMetadata } from "./types";
import { TimeoutDiagnosticsRecorder } from "./timeoutDiagnostics";

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

describe("Vision Lab timeout diagnostics (Phase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readVideoMetadata.mockResolvedValue(mocks.metadata);
    mocks.seekToFrame.mockResolvedValue(undefined);
    mocks.detectPose.mockImplementation((_video, frameIndex: number) =>
      Promise.resolve(mocks.unreliablePose(frameIndex)),
    );
  });

  it("does not include timeoutDiagnostics when debugDiagnostics is not set", async () => {
    const result = await runVideoAnalysis(baseOpts);
    expect(result.timeoutDiagnostics).toBeUndefined();
    expect("timeoutDiagnostics" in result).toBe(false);
  });

  it("attaches a full timeoutDiagnostics report on invalid_recording results", async () => {
    const result = await runVideoAnalysis({ ...baseOpts, debugDiagnostics: true });
    expect(result.status).toBe("invalid_recording");
    const report = result.timeoutDiagnostics;
    expect(report).toBeDefined();
    if (!report) return;
    expect(report.analysisRunId).toBe(result.analysisId);
    expect(report.scheduledFrameCount).toBe(mocks.schedule.length);
    expect(report.processedFrameCount).toBe(mocks.schedule.length);
    expect(report.extractedFrameCount).toBe(mocks.schedule.length);
    expect(report.poseFrameCount).toBe(mocks.schedule.length);
    expect(report.declaredFps).toBe(30);
    expect(report.measuredFps).toBe(30);
    expect(report.fpsSource).toBe("measured");
    expect(report.poseDelegate).toBe("CPU");
    expect(report.timestampCorrectionCount).toBe(1);
    expect(report.protocolRecognition).not.toBeNull();
    expect(report.protocolRecognition?.protocolMatch).toBe(false);
    expect(report.currentStage).toBe("recognize_protocol");
  });

  it("accepts a caller-provided recorder and keeps updating it in place", async () => {
    const recorder = new TimeoutDiagnosticsRecorder("external-run");
    const result = await runVideoAnalysis({
      ...baseOpts,
      debugDiagnostics: true,
      timeoutRecorder: recorder,
    });
    expect(result.timeoutDiagnostics?.scheduledFrameCount).toBe(mocks.schedule.length);
    // The same recorder instance keeps the latest state — usable after an
    // external hard timeout aborts waiting on the returned promise.
    expect(recorder.snapshot().scheduledFrameCount).toBe(mocks.schedule.length);
  });

  it("attaches a partial timeoutDiagnostics report even when analysis fails before extraction", async () => {
    mocks.readVideoMetadata.mockResolvedValue({ ...mocks.metadata, frameCount: 0 });
    const result = await runVideoAnalysis({ ...baseOpts, debugDiagnostics: true });
    expect(result.status).toBe("failed");
    const report = result.timeoutDiagnostics;
    expect(report).toBeDefined();
    if (!report) return;
    expect(report.currentStage).toBe("read_metadata");
    expect(report.scheduledFrameCount).toBe(0);
  });

  it("never persists timeoutDiagnostics to Supabase or localStorage (in-memory only)", async () => {
    const hasLocalStorage = typeof localStorage !== "undefined";
    const setItemSpy = hasLocalStorage ? vi.spyOn(localStorage, "setItem") : null;
    const result = await runVideoAnalysis({ ...baseOpts, debugDiagnostics: true });
    expect(result.timeoutDiagnostics).toBeDefined();
    if (setItemSpy) {
      expect(setItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    }
  });
});
