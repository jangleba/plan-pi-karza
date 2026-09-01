import { describe, expect, it, vi } from "vitest";
import {
  createCoarseFrameSchedule,
  createFrameSchedule,
  createPrecisionFrameSchedule,
  seekToFrame,
} from "./videoFrameReader";
import type { VideoMetadata } from "./types";

function metadata(partial: Partial<VideoMetadata>): VideoMetadata {
  return {
    fps: 30,
    fpsMeasured: true,
    declaredFps: null,
    durationSeconds: 1,
    frameCount: 30,
    width: 1080,
    height: 1920,
    orientation: "portrait",
    ...partial,
  };
}

describe("createFrameSchedule", () => {
  it("does not include unsafe timestamps near the end and remains strictly increasing", () => {
    const schedule = createFrameSchedule(metadata({ fps: 30, durationSeconds: 1, frameCount: 30 }));
    const safeDuration = 1 - Math.max(2 / 30, 0.05);

    expect(schedule.length).toBeGreaterThan(0);
    expect(schedule.at(-1)?.mediaTime).toBeLessThanOrEqual(safeDuration);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].sourceTimestampUs).toBeGreaterThan(schedule[i - 1].sourceTimestampUs);
      expect(schedule[i].mediaTime).toBeGreaterThan(schedule[i - 1].mediaTime);
    }
  });

  it("limits a 120 FPS sprint clip to a phone-safe coarse budget", () => {
    const schedule = createCoarseFrameSchedule(
      metadata({ fps: 120, durationSeconds: 12, frameCount: 1440 }),
      { targetFps: 12, maxFrames: 144 },
    );

    expect(schedule.length).toBeLessThanOrEqual(144);
    expect(schedule[0].sourceFrameIndex).toBe(0);
    expect(schedule.at(-1)?.mediaTime).toBeGreaterThan(11);
  });

  it("keeps source-rate frames only inside precision windows", () => {
    const schedule = createPrecisionFrameSchedule(
      metadata({ fps: 120, durationSeconds: 8, frameCount: 960 }),
      [
        { startSeconds: 1, endSeconds: 1.25 },
        { startSeconds: 5, endSeconds: 5.25 },
      ],
      { targetFps: 120, maxFrames: 720 },
    );

    expect(schedule.length).toBeGreaterThan(40);
    expect(
      schedule.every(
        (frame) =>
          (frame.mediaTime >= 1 && frame.mediaTime <= 1.25) ||
          (frame.mediaTime >= 5 && frame.mediaTime <= 5.25),
      ),
    ).toBe(true);
    const firstWindow = schedule.filter((frame) => frame.mediaTime < 2);
    expect(firstWindow[1].sourceFrameIndex - firstWindow[0].sourceFrameIndex).toBe(1);
  });
});

describe("seekToFrame", () => {
  it("resolves immediately when currentTime already matches the target", async () => {
    const addEventListener = vi.fn();
    const video = {
      duration: 10,
      readyState: 2,
      currentTime: 1.0002,
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;

    await expect(seekToFrame(video, 1)).resolves.toBe(1.0002);

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("rejects stalled seeks with FRAME_SEEK_TIMEOUT", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, EventListener>();
    const video = {
      duration: 10,
      readyState: 2,
      currentTime: 0,
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        listeners.set(event, listener);
      }),
      removeEventListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    } as unknown as HTMLVideoElement;

    const expectation = expect(seekToFrame(video, 1)).rejects.toMatchObject({
      code: "FRAME_SEEK_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(2_500);

    await expectation;
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });

  it("does not wait 2.5 s when paused Safari omits the video-frame callback after seek", async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, EventListener>();
    const video = {
      duration: 10,
      readyState: 2,
      currentTime: 0,
      requestVideoFrameCallback: vi.fn(() => 7),
      cancelVideoFrameCallback: vi.fn(),
      addEventListener: vi.fn((event: string, listener: EventListener) => {
        listeners.set(event, listener);
      }),
      removeEventListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    } as unknown as HTMLVideoElement;

    const result = seekToFrame(video, 1);
    listeners.get("seeked")?.(new Event("seeked"));
    await vi.advanceTimersByTimeAsync(80);

    await expect(result).resolves.toBe(1);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });
});
