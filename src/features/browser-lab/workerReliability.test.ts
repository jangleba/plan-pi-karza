// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPoseDetector } from "./poseWorkerClient";
import { parseJumpVideoAsync } from "./videoParserAsync";

const mocks = vi.hoisted(() => ({ detect: vi.fn() }));
vi.mock("./pose", () => ({ detectPose: mocks.detect }));
const fixture = () => {
  const bytes = readFileSync(resolve("src/features/browser-lab/__fixtures__/240fps-bframes.mp4"));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
let workers: TestWorker[];
let mode: "constructor" | "error" | "messageerror" | "post" | "file-error" | "pending";
class TestWorker {
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(() => {
    if (mode === "post") throw new DOMException("Unavailable", "DataCloneError");
    queueMicrotask(() => {
      if (mode === "error") this.onerror?.();
      if (mode === "messageerror") this.onmessageerror?.();
      if (mode === "file-error")
        this.onmessage?.({ data: { error: "Nieprawidłowy film kontrolny" } });
    });
  });
  constructor() {
    if (mode === "constructor") throw new DOMException("Unavailable", "SecurityError");
    workers.push(this);
  }
}
beforeEach(() => {
  workers = [];
  mode = "pending";
  mocks.detect.mockReset().mockResolvedValue(null);
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap()),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Lab worker compatibility and cancellation", () => {
  it.each(["constructor", "error", "messageerror", "post"] as const)(
    "keeps the original film usable when worker %s fails",
    async (failure) => {
      mode = failure;
      const input = fixture();
      const size = input.byteLength;
      const parsed = await parseJumpVideoAsync(input, new AbortController().signal);
      expect(parsed.samples).toHaveLength(360);
      expect(input.byteLength).toBe(size);
      if (workers[0]) {
        expect(workers[0].terminate).toHaveBeenCalledOnce();
        expect(workers[0].postMessage.mock.calls[0]).toHaveLength(1);
      }
    },
  );
  it("does not parse a rejected file a second time", async () => {
    mode = "file-error";
    await expect(parseJumpVideoAsync(fixture(), new AbortController().signal)).rejects.toThrow(
      "Nieprawidłowy film kontrolny",
    );
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it.each(["timeout", "abort"])("settles a silent parser after %s", async (reason) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = parseJumpVideoAsync(fixture(), controller.signal).catch(
      (error: Error) => error,
    );
    if (reason === "abort") controller.abort();
    else await vi.advanceTimersByTimeAsync(20_000);
    expect(((await pending) as Error).name).toBe(
      reason === "abort" ? "AbortError" : "TimeoutError",
    );
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["constructor", "error", "messageerror", "post", "bitmap"] as const)(
    "uses the compatible pose task once after %s failure",
    async (failure) => {
      if (failure === "bitmap")
        vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("bitmap failed")));
      else mode = failure;
      const detector = createPoseDetector(new AbortController().signal);
      try {
        await expect(detector.detect(document.createElement("canvas"))).resolves.toBeNull();
        await expect(detector.detect(document.createElement("canvas"))).resolves.toBeNull();
        expect(mocks.detect).toHaveBeenCalledTimes(2);
        expect(workers).toHaveLength(failure === "constructor" ? 0 : 1);
        if (workers[0]) expect(workers[0].terminate).toHaveBeenCalledOnce();
      } finally {
        detector.dispose();
      }
    },
  );
  it("releases a bitmap that arrives after disposal", async () => {
    let finish: (value: ImageBitmap) => void = () => {};
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(
        () =>
          new Promise<ImageBitmap>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const detector = createPoseDetector(new AbortController().signal);
    const pending = detector
      .detect(document.createElement("canvas"))
      .catch((error: Error) => error);
    detector.dispose();
    expect(((await pending) as Error).name).toBe("AbortError");
    const image = bitmap();
    finish(image);
    await Promise.resolve();
    expect(image.close).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(mocks.detect).not.toHaveBeenCalled();
  });
  it("rejects a timed-out pose worker without repeating expensive analysis", async () => {
    vi.useFakeTimers();
    const detector = createPoseDetector(new AbortController().signal);
    const pending = detector
      .detect(document.createElement("canvas"))
      .catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(((await pending) as Error).name).toBe("TimeoutError");
    detector.dispose();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts a model load running in the compatibility task", async () => {
    mode = "constructor";
    mocks.detect.mockImplementation(() => new Promise(() => {}));
    const detector = createPoseDetector(new AbortController().signal);
    const pending = detector
      .detect(document.createElement("canvas"))
      .catch((error: Error) => error);
    await vi.waitFor(() => expect(mocks.detect).toHaveBeenCalledOnce());
    detector.dispose();
    expect(((await pending) as Error).name).toBe("AbortError");
  });
});
