import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisPipelineSnapshot } from "./types";

const mocks = vi.hoisted(() => {
  const schedule = [
    {
      frameIndex: 0,
      sourceFrameIndex: 0,
      mediaTime: 0,
      presentationTimestamp: 0,
      sourceTimestampMs: 0,
      sourceTimestampUs: 0,
    },
    {
      frameIndex: 1,
      sourceFrameIndex: 1,
      mediaTime: 0.01,
      presentationTimestamp: 0.01,
      sourceTimestampMs: 10,
      sourceTimestampUs: 10_000,
    },
    {
      frameIndex: 2,
      sourceFrameIndex: 2,
      mediaTime: 0.02,
      presentationTimestamp: 0.02,
      sourceTimestampMs: 20,
      sourceTimestampUs: 20_000,
    },
  ];
  return {
    schedule,
    precisionSchedule: [] as typeof schedule,
    seekToFrame: vi.fn(),
    detectPose: vi.fn(),
    video: { currentTime: 0 },
  };
});

vi.mock("./videoFrameReader", () => ({
  createFrameSchedule: () => mocks.schedule,
  createCoarseFrameSchedule: () => mocks.schedule,
  createPrecisionFrameSchedule: () => mocks.precisionSchedule,
  seekToFrame: mocks.seekToFrame,
  withLoadedVideoElement: async (
    _url: string,
    _signal: AbortSignal | undefined,
    handler: (video: HTMLVideoElement) => Promise<unknown>,
  ) => handler(mocks.video as HTMLVideoElement),
  readVideoMetadata: vi.fn(),
}));

vi.mock("./poseEngine", () => ({
  clearPoseDebugLog: vi.fn(),
  closePoseEngine: vi.fn(),
  detectPose: mocks.detectPose,
  flushPoseDebugLog: vi.fn(),
  FRAME_TIMESTAMP_ORDER_USER_MESSAGE: "FRAME_TIMESTAMP_ORDER_USER_MESSAGE",
  isPoseSupported: () => true,
}));

import { AnalysisPipelineController } from "./AnalysisPipelineController";
import { extractFramesAndEstimatePose } from "./runVideoAnalysis";
import type { RunOptions } from "./runVideoAnalysis";
import type { FramePose, VideoMetadata } from "./types";

function pose(frameIndex: number): FramePose {
  return {
    frameIndex,
    sourceFrameIndex: frameIndex,
    mediaTime: frameIndex / 100,
    presentationTimestamp: frameIndex / 100,
    sourceTimestampMs: frameIndex * 10,
    sourceTimestampUs: frameIndex * 10_000,
    mediaPipeTimestampMs: frameIndex * 10,
    landmarks: [{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }],
    peopleCount: 1,
    trackingConfidence: 0.9,
  };
}

const metadata: VideoMetadata = {
  fps: 100,
  fpsMeasured: true,
  declaredFps: null,
  durationSeconds: 0.03,
  frameCount: 3,
  width: 1080,
  height: 1920,
  orientation: "portrait",
};

const opts: RunOptions = {
  testType: "cmj",
  videoUrl: "blob:test-video",
  declaredFps: null,
  cameraSetup: "side",
};

describe("extractFramesAndEstimatePose accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.precisionSchedule.length = 0;
    mocks.seekToFrame.mockResolvedValue(undefined);
    mocks.detectPose.mockImplementation((_video, frameIndex: number) =>
      Promise.resolve(pose(frameIndex)),
    );
  });

  it("does not complete extractFrames after the first decoded frame", async () => {
    const updates: AnalysisPipelineSnapshot[] = [];
    const controller = new AnalysisPipelineController("run-accounting-first", (snapshot) => {
      updates.push(snapshot);
    });

    const output = await extractFramesAndEstimatePose(
      opts,
      controller,
      "run-accounting-first",
      metadata,
    );

    expect(output.scheduledFrames).toBe(3);
    expect(output.processedScheduleFrames).toBe(3);
    expect(output.extractedFrames).toBe(3);
    expect(output.attemptedPoseFrames).toBe(3);
    expect(
      updates.some(
        (snapshot) =>
          snapshot.stages.extractFrames.status === "completed" &&
          snapshot.stages.extractFrames.output?.processedScheduleFrames !== 3,
      ),
    ).toBe(false);
  });

  it("counts every scheduled frame as processed even when seek fails", async () => {
    mocks.seekToFrame.mockImplementation((_video, _time, _signal) => {
      if (mocks.seekToFrame.mock.calls.length === 2) {
        const error = new Error("FRAME_SEEK_TIMEOUT");
        (error as Error & { code: string }).code = "FRAME_SEEK_TIMEOUT";
        return Promise.reject(error);
      }
      return Promise.resolve();
    });
    const controller = new AnalysisPipelineController("run-accounting-seek");

    const output = await extractFramesAndEstimatePose(
      opts,
      controller,
      "run-accounting-seek",
      metadata,
    );

    expect(output.processedScheduleFrames).toBe(3);
    expect(output.extractedFrames).toBe(2);
    expect(output.attemptedPoseFrames).toBe(2);
    expect(output.frameLog.map((entry) => entry.skippedReason)).toContain("FRAME_SEEK_TIMEOUT");
  });

  it("does not leave extractFrames or estimatePose running after an error on the last frame", async () => {
    mocks.seekToFrame.mockImplementation((_video, _time, _signal) => {
      if (mocks.seekToFrame.mock.calls.length === 3) {
        const error = new Error("FRAME_SEEK_TIMEOUT");
        (error as Error & { code: string }).code = "FRAME_SEEK_TIMEOUT";
        return Promise.reject(error);
      }
      return Promise.resolve();
    });
    const controller = new AnalysisPipelineController("run-accounting-last");

    const output = await extractFramesAndEstimatePose(
      opts,
      controller,
      "run-accounting-last",
      metadata,
    );
    const snapshot = controller.snapshot();

    expect(output.processedScheduleFrames).toBe(3);
    expect(snapshot.stages.extractFrames.status).toBe("completed");
    expect(snapshot.stages.estimatePose.status).toBe("completed");
    expect(snapshot.stages.extractFrames.status).not.toBe("running");
    expect(snapshot.stages.estimatePose.status).not.toBe("running");
  });

  it("fails estimatePose instead of leaving it running when no frames decode", async () => {
    mocks.seekToFrame.mockRejectedValue(
      Object.assign(new Error("FRAME_SEEK_ERROR"), { code: "FRAME_SEEK_ERROR" }),
    );
    const controller = new AnalysisPipelineController("run-accounting-none");

    await expect(
      extractFramesAndEstimatePose(opts, controller, "run-accounting-none", metadata),
    ).rejects.toMatchObject({
      code: "NO_DECODED_FRAMES",
    });
    expect(controller.snapshot().stages.estimatePose.status).toBe("failed");
  });

  it("reports coarse and precision frame progress as two truthful passes", async () => {
    mocks.precisionSchedule.push(
      {
        frameIndex: 10,
        sourceFrameIndex: 10,
        mediaTime: 0.1,
        presentationTimestamp: 0.1,
        sourceTimestampMs: 100,
        sourceTimestampUs: 100_000,
      },
      {
        frameIndex: 11,
        sourceFrameIndex: 11,
        mediaTime: 0.11,
        presentationTimestamp: 0.11,
        sourceTimestampMs: 110,
        sourceTimestampUs: 110_000,
      },
    );
    const frameProgress: Array<{
      passType: "coarse" | "precision";
      completedFrames: number;
      totalFrames: number;
    }> = [];
    const controller = new AnalysisPipelineController("run-accounting-progress");

    const output = await extractFramesAndEstimatePose(
      { ...opts, onFrameProgress: (progress) => frameProgress.push(progress) },
      controller,
      "run-accounting-progress",
      metadata,
    );

    expect(output.scheduledFrames).toBe(5);
    expect(frameProgress).toContainEqual({
      passType: "coarse",
      completedFrames: 3,
      totalFrames: 3,
    });
    expect(frameProgress).toContainEqual({
      passType: "precision",
      completedFrames: 0,
      totalFrames: 2,
    });
    expect(frameProgress.at(-1)).toEqual({
      passType: "precision",
      completedFrames: 2,
      totalFrames: 2,
    });
  });
});
