import { describe, expect, it, vi } from "vitest";
import { createFrameSchedule, seekToFrame } from "./videoFrameReader";
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
});

describe("seekToFrame", () => {
  it("resolves immediately when currentTime already matches the target", async () => {
    const addEventListener = vi.fn();
    const video = {
      duration: 10,
      readyState: 2,
      currentTime: 1.004,
      addEventListener,
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;

    await seekToFrame(video, 1);

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
});