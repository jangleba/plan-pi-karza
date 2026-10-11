import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseJumpVideo, decodeJumpFrame, openJumpVideo } from "./video";

const bytes = () => {
  const file = readFileSync(
    new URL("./__fixtures__/240fps-bframes.mp4", import.meta.url),
  );
  return file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
};

describe("MP4/MOV exact frame reader", () => {
  it.each([
    ["hd-30fps.mp4", 30, 1920, 1080],
    ["4k-60fps.mp4", 60, 3840, 2160],
    ["camera-fragmented-24fps.mp4", 24, 320, 180],
  ])(
    "accepts a real %s original with its own timestamps",
    (name, fps, width, height) => {
      const file = readFileSync(
        new URL(`./__fixtures__/${name}`, import.meta.url),
      );
      const video = parseJumpVideo(
        file.buffer.slice(
          file.byteOffset,
          file.byteOffset + file.byteLength,
        ) as ArrayBuffer,
      );
      expect(video.timeline.fps).toBeCloseTo(fps as number, 8);
      expect(video.config.codedWidth).toBe(width);
      expect(video.config.codedHeight).toBe(height);
      expect(video.samples).toHaveLength(
        name === "camera-fragmented-24fps.mp4" ? 48 : 60,
      );
      expect(video.samples.every((sample) => sample.data.byteLength > 0)).toBe(
        true,
      );
    },
  );
  it("reads HEVC samples and decoder description from a real QuickTime MOV", () => {
    const file = readFileSync(
      new URL("./__fixtures__/240fps-hevc.mov", import.meta.url),
    );
    const video = parseJumpVideo(
      file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
      ) as ArrayBuffer,
    );
    expect(video.config.codec).toMatch(/^hvc1\./);
    expect(video.config.description?.byteLength).toBeGreaterThan(20);
    expect(video.samples).toHaveLength(240);
    expect(video.timeline.fps).toBeCloseTo(240, 8);
  });
  it("extracts every sample, its original PTS and AVC configuration from a real B-frame MP4", () => {
    const video = parseJumpVideo(bytes());
    expect(video.samples).toHaveLength(360);
    expect(video.timeline.fps).toBeCloseTo(240, 8);
    expect(video.timeline.durationSeconds).toBeCloseTo(1.5, 8);
    expect(video.config.codec).toMatch(/^avc1\./);
    expect(video.config.description?.byteLength).toBeGreaterThan(10);
    expect(video.timeline.frames.some((f, i) => f.sampleIndex !== i)).toBe(
      true,
    );
    expect(video.samples.every((s) => s.data.byteLength > 0)).toBe(true);
  });
  it("rejects truncated and non-video files", () => {
    expect(() => parseJumpVideo(new ArrayBuffer(0))).toThrow();
    expect(() => parseJumpVideo(bytes().slice(0, 32))).toThrow();
    expect(() =>
      parseJumpVideo(new TextEncoder().encode("not a video").buffer),
    ).toThrow();
  });
  it("uses timestamp identity, closes other outputs and closes the decoder", async () => {
    const video = parseJumpVideo(bytes());
    const outputs: { timestamp: number; close: ReturnType<typeof vi.fn> }[] =
      [];
    let closed = false;
    vi.stubGlobal(
      "EncodedVideoChunk",
      class {
        constructor(public data: unknown) {}
      },
    );
    vi.stubGlobal(
      "VideoDecoder",
      class {
        state = "unconfigured";
        decodeQueueSize = 0;
        constructor(private callbacks: { output: (f: unknown) => void }) {}
        configure() {
          this.state = "configured";
        }
        decode(chunk: { data: { timestamp: number } }) {
          outputs.push({ timestamp: chunk.data.timestamp, close: vi.fn() });
        }
        async flush() {
          for (const f of [...outputs].reverse()) this.callbacks.output(f);
        }
        close() {
          closed = true;
          this.state = "closed";
        }
      },
    );
    try {
      const frame = await decodeJumpFrame(
        video,
        31,
        new AbortController().signal,
      );
      expect(frame.timestamp).toBe(video.timeline.frames[31].timestampUs);
      expect(outputs.filter((o) => !o.close.mock.calls.length)).toHaveLength(1);
      expect(closed).toBe(true);
      frame.close();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not read a file on browsers without exact decoding", async () => {
    vi.stubGlobal("VideoDecoder", undefined);
    const file = { arrayBuffer: vi.fn() } as unknown as File;
    try {
      await expect(
        openJumpVideo(file, new AbortController().signal),
      ).rejects.toThrow("przeglądarka");
      expect(file.arrayBuffer).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("honors cancellation before allocating a platform decoder", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      decodeJumpFrame(parseJumpVideo(bytes()), 0, controller.signal),
    ).rejects.toThrow();
  });
  it.each(["timeout", "cancel"])(
    "settles a stalled flush after %s and releases its decoder",
    async (mode) => {
      vi.useFakeTimers();
      const close = vi.fn();
      const controller = new AbortController();
      vi.stubGlobal("EncodedVideoChunk", class {});
      vi.stubGlobal(
        "VideoDecoder",
        class {
          state = "configured";
          decodeQueueSize = 0;
          configure() {}
          decode() {}
          flush() {
            return new Promise<void>(() => {});
          }
          close() {
            this.state = "closed";
            close();
          }
        },
      );
      try {
        const outcome = decodeJumpFrame(
          parseJumpVideo(bytes()),
          31,
          controller.signal,
        ).catch((error: unknown) => error);
        if (mode === "cancel") controller.abort();
        else await vi.advanceTimersByTimeAsync(15_000);
        const reason = await outcome;
        expect(reason).toBeInstanceOf(Error);
        if (mode === "timeout")
          expect((reason as Error).message).toContain("trwa za długo");
        else expect((reason as Error).name).toBe("AbortError");
        expect(close).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    },
  );
});
