import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJumpFrameDecoder, parseJumpVideo } from "./video";
const video = () => {
  const input = readFileSync(new URL("./__fixtures__/240fps-bframes.mp4", import.meta.url));
  return parseJumpVideo(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer,
  );
};
type Frame = { timestamp: number; close: ReturnType<typeof vi.fn> };
let frames: Frame[];
let allocations: number;
let hanging: boolean;
let closeDecoder: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  frames = [];
  allocations = 0;
  hanging = false;
  closeDecoder = vi.fn<() => void>();
  vi.stubGlobal(
    "EncodedVideoChunk",
    class {
      constructor(public input: { timestamp: number }) {}
    },
  );
  vi.stubGlobal(
    "VideoDecoder",
    class {
      state = "unconfigured";
      decodeQueueSize = 0;
      private pending: Frame[] = [];
      constructor(private callbacks: { output: (frame: Frame) => void }) {
        allocations++;
      }
      configure() {
        this.state = "configured";
      }
      decode(chunk: { input: { timestamp: number } }) {
        const frame = { timestamp: chunk.input.timestamp, close: vi.fn() };
        frames.push(frame);
        this.pending.push(frame);
      }
      async flush() {
        if (hanging) return new Promise<void>(() => {});
        for (const frame of [...this.pending].reverse()) this.callbacks.output(frame);
        this.pending = [];
      }
      close() {
        this.state = "closed";
        closeDecoder();
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("owned decoded GOP cache", () => {
  it("serves planned AUTO samples from one GOP and closes every retained frame", async () => {
    const source = video();
    const decoder = createJumpFrameDecoder(source, [31, 50, 90]);
    const signal = new AbortController().signal;
    const first = await decoder.decode(31, signal);
    first.close();
    expect(frames.filter((frame) => !frame.close.mock.calls.length)).toHaveLength(2);
    const second = await decoder.decode(50, signal);
    expect(second.timestamp).toBe(source.timeline.frames[50].timestampUs);
    second.close();
    expect(allocations).toBe(1);
    decoder.dispose();
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  });
  it("keeps only one extra 4K frame under the 48 MiB cache budget", async () => {
    const source = video();
    source.config.codedWidth = 3840;
    source.config.codedHeight = 2160;
    const decoder = createJumpFrameDecoder(source, [31, 50, 60, 70, 80, 90]);
    const first = await decoder.decode(31, new AbortController().signal);
    first.close();
    expect(frames.filter((frame) => !frame.close.mock.calls.length)).toHaveLength(1);
    decoder.dispose();
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  });
  it("reuses neighbours in the editor but never shares caller-owned frames", async () => {
    const source = video();
    const decoder = createJumpFrameDecoder(source);
    const signal = new AbortController().signal;
    const first = await decoder.decode(31, signal);
    first.close();
    const next = await decoder.decode(32, signal);
    expect(next.timestamp).toBe(source.timeline.frames[32].timestampUs);
    expect(allocations).toBe(1);
    decoder.dispose();
    expect((next as unknown as Frame).close).not.toHaveBeenCalled();
    next.close();
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  });
  it("disposal cancels the active decoder and rejects queued requests", async () => {
    hanging = true;
    const decoder = createJumpFrameDecoder(video());
    const first = decoder.decode(31, new AbortController().signal).catch((error: Error) => error);
    const queued = decoder.decode(32, new AbortController().signal).catch((error: Error) => error);
    await Promise.resolve();
    decoder.dispose();
    expect(((await first) as Error).name).toBe("AbortError");
    expect(((await queued) as Error).name).toBe("AbortError");
    expect(allocations).toBe(1);
    expect(closeDecoder).toHaveBeenCalledOnce();
  });
});
