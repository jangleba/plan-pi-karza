// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLabCamera, recordLabCamera } from "./camera";

class Recorder {
  static isTypeSupported = vi.fn((type: string) =>
    type.startsWith("video/mp4"),
  );
  static all: Recorder[] = [];
  mimeType = "video/mp4";
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
  });
  constructor(_stream: unknown, _options: unknown) {
    Recorder.all.push(this);
  }
}
function fixture() {
  let fps = 30;
  const track = {
    stop: vi.fn(),
    getCapabilities: () => ({ frameRate: { min: 15, max: 240 } }),
    getSettings: () => ({ frameRate: fps, width: 1920, height: 1080 }),
    applyConstraints: vi.fn(
      async (constraints: { frameRate: { exact: number } }) => {
        const target = constraints.frameRate.exact;
        if (target > 60)
          throw new DOMException("Unsupported mode", "OverconstrainedError");
        fps = target;
      },
    ),
  };
  const stream = {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  const gum = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: gum } });
  return { track, stream, gum };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("MediaRecorder", Recorder);
  Recorder.all = [];
  Recorder.isTypeSupported.mockImplementation((type: string) =>
    type.startsWith("video/mp4"),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("camera negotiation and recording lifecycle", () => {
  it("requests the rear camera without audio and falls back to a supported actual FPS", async () => {
    const { track, gum } = fixture();
    const camera = await openLabCamera(new AbortController().signal);
    expect(gum.mock.calls[0][0]).toMatchObject({
      audio: false,
      video: { facingMode: { exact: "environment" } },
    });
    expect(
      track.applyConstraints.mock.calls.map(([c]) => c.frameRate.exact),
    ).toEqual([240, 120, 60]);
    expect(camera.settings.frameRate).toBe(60);
  });
  it("allows a browser-exposed 24 FPS mode without requesting unavailable high rates", async () => {
    const { track } = fixture();
    track.getCapabilities = () => ({ frameRate: { min: 15, max: 24 } });
    const camera = await openLabCamera(new AbortController().signal);
    expect(
      track.applyConstraints.mock.calls.map(([c]) => c.frameRate.exact),
    ).toEqual([24]);
    expect(camera.settings.frameRate).toBe(24);
  });
  it("releases camera access obtained after cancellation", async () => {
    const { track, stream, gum } = fixture();
    let resolve!: (stream: MediaStream) => void;
    gum.mockImplementationOnce(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const controller = new AbortController();
    const outcome = openLabCamera(controller.signal).catch(
      (reason: unknown) => reason,
    );
    controller.abort();
    resolve(stream);
    expect(((await outcome) as DOMException).name).toBe("AbortError");
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it("offers a useful permission error and does not silently switch to another capture flow", async () => {
    const { gum } = fixture();
    gum.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    await expect(openLabCamera(new AbortController().signal)).rejects.toThrow(
      "Zezwól na kamerę",
    );
    expect(gum).toHaveBeenCalledOnce();
  });
  it("rejects an unsupported recording container before asking for camera access", async () => {
    const { gum } = fixture();
    Recorder.isTypeSupported.mockReturnValue(false);
    await expect(openLabCamera(new AbortController().signal)).rejects.toThrow(
      "Nagrywanie w Lab nie jest dostępne",
    );
    expect(gum).not.toHaveBeenCalled();
  });
  it("keeps encoded chunks intact, stops at 8 seconds and releases the camera after final data", async () => {
    const { track } = fixture();
    const camera = await openLabCamera(new AbortController().signal);
    const progress = vi.fn();
    const recording = recordLabCamera(
      camera,
      new AbortController().signal,
      progress,
    );
    const recorder = Recorder.all.at(-1)!;
    recorder.ondataavailable!({ data: new Blob(["first"]) });
    await vi.advanceTimersByTimeAsync(8000);
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
    recorder.ondataavailable!({ data: new Blob(["last"]) });
    recorder.onstop!();
    const file = await recording.finished;
    expect(file.name).toMatch(/^BallWise-.*\.mp4$/);
    expect(file.size).toBe(9);
    expect(file.type).toBe("video/mp4");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["abort", "error", "stalled-stop"])(
    "settles %s without leaving camera tracks or timers alive",
    async (mode) => {
      const { track } = fixture();
      const controller = new AbortController();
      const camera = await openLabCamera(controller.signal);
      const recording = recordLabCamera(camera, controller.signal, vi.fn());
      const outcome = recording.finished.catch((reason: unknown) => reason);
      const recorder = Recorder.all.at(-1)!;
      if (mode === "abort") controller.abort();
      else if (mode === "error") recorder.onerror!();
      else {
        recording.stop();
        await vi.advanceTimersByTimeAsync(5000);
      }
      expect(await outcome).toBeInstanceOf(Error);
      expect(track.stop).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
