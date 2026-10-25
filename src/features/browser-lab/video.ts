import { parseJumpVideoAsync } from "./videoParserAsync";
import { MAX_VIDEO_BYTES, type JumpVideo } from "./videoParser";
import { awaitLabTask } from "./asyncTask";
export { MAX_VIDEO_BYTES, parseJumpVideo, displayRotation } from "./videoParser";
export type { JumpVideo } from "./videoParser";
export interface OpenedVideo extends JumpVideo {
  sourceName: string;
  sourceHash: string;
  sourceBytes: number;
}

function readOriginal(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timeout = setTimeout(() => {
      reader.abort();
      clean();
      reject(
        new DOMException(
          "Pobieranie filmu trwa za długo. Zapisz oryginał w Plikach i spróbuj ponownie.",
          "TimeoutError",
        ),
      );
    }, 30_000);
    const cancel = () => {
      reader.abort();
      clean();
      reject(signal.reason ?? new DOMException("Anulowano", "AbortError"));
    };
    const clean = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    };
    reader.onload = () => {
      clean();
      resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = () => {
      clean();
      reject(
        new Error("Nie udało się pobrać filmu. Zapisz oryginał w Plikach i wybierz go ponownie."),
      );
    };
    reader.onabort = clean;
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else {
      try {
        reader.readAsArrayBuffer(file);
      } catch (reason) {
        clean();
        reject(reason);
      }
    }
  });
}

export async function openJumpVideo(file: File, signal: AbortSignal): Promise<OpenedVideo> {
  signal.throwIfAborted();
  if (
    !globalThis.isSecureContext ||
    typeof VideoDecoder === "undefined" ||
    typeof EncodedVideoChunk === "undefined"
  )
    throw new Error(
      "Ta przeglądarka nie obsługuje dokładnego odczytu klatek. Otwórz BallWise w aktualnym Safari na iPhonie albo w Chrome na komputerze, przez HTTPS.",
    );
  if (file.size > MAX_VIDEO_BYTES)
    throw new Error("Film przekracza 128 MB. Nagraj krótszy klip (5–10 s) lub wybierz HD 60 FPS.");
  const buffer = await readOriginal(file, signal);
  signal.throwIfAborted();
  const digest = await awaitLabTask(
    crypto.subtle.digest("SHA-256", buffer),
    signal,
    20_000,
    "Przygotowanie filmu trwa za długo.",
  );
  signal.throwIfAborted();
  const video = await parseJumpVideoAsync(buffer, signal);
  const support = await awaitLabTask(
    VideoDecoder.isConfigSupported(video.config),
    signal,
    10_000,
    "Sprawdzenie kodeka filmu trwa za długo.",
  );
  signal.throwIfAborted();
  if (!support.supported)
    throw new Error(
      "Przeglądarka nie obsługuje kodeka tego filmu. W ustawieniach Aparatu wybierz „Najbardziej zgodny” i nagraj HD 60 FPS.",
    );
  return {
    ...video,
    sourceName: file.name || "nagranie",
    sourceBytes: file.size,
    sourceHash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""),
  };
}

/** Decode a complete GOP, matching the target by PTS even with B frames. Caller owns the returned frame. */
export async function decodeJumpFrame(
  video: JumpVideo,
  index: number,
  signal: AbortSignal,
): Promise<VideoFrame> {
  return decodeFrame(video, index, signal);
}

/** An owner-scoped, bounded GOP cache. Returned frames belong to the caller.
 * AUTO supplies its planned indices so a decoded GOP can serve later samples;
 * the editor retains neighbouring frames. Dispose on video replacement/unmount. */
export function createJumpFrameDecoder(video: JumpVideo, plannedIndices: readonly number[] = []) {
  const cache = new Map<number, VideoFrame>();
  const lifetime = new AbortController();
  const clear = () => {
    for (const frame of cache.values()) frame.close();
    cache.clear();
  };
  let queued: Promise<unknown> = Promise.resolve();
  return {
    dispose() {
      lifetime.abort();
      clear();
    },
    decode(index: number, signal: AbortSignal): Promise<VideoFrame> {
      const task = queued.then(async () => {
        signal.throwIfAborted();
        lifetime.signal.throwIfAborted();
        const hit = cache.get(index);
        if (hit) {
          cache.delete(index);
          return hit;
        }
        clear();
        // Conservative RGBA estimate; at most six retained frames and 48 MiB,
        // in addition to the frame currently owned by the caller.
        const frameBytes =
          (video.config.codedWidth ?? 4096) * (video.config.codedHeight ?? 2160) * 4;
        const maxFrames = Math.min(6, Math.floor((48 * 1024 * 1024) / frameBytes));
        const candidates = plannedIndices.length
          ? plannedIndices.filter((candidate) => candidate > index)
          : [index + 1, index - 1, index + 2, index - 2, index + 3, index - 3];
        const { start, end } = gopBounds(video, index);
        const wanted = new Map(
          candidates
            .filter((candidate) => {
              const sample = video.timeline.frames[candidate]?.sampleIndex;
              return sample !== undefined && sample >= start && sample < end;
            })
            .slice(0, maxFrames)
            .map((candidate) => [video.timeline.frames[candidate].timestampUs, candidate]),
        );
        const controller = new AbortController();
        const abort = () =>
          controller.abort(signal.aborted ? signal.reason : lifetime.signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        lifetime.signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted || lifetime.signal.aborted) abort();
        try {
          return await decodeFrame(
            video,
            index,
            controller.signal,
            wanted.size
              ? (frame) => {
                  const candidate = wanted.get(frame.timestamp);
                  if (candidate === undefined || cache.has(candidate)) return false;
                  cache.set(candidate, frame);
                  return true;
                }
              : undefined,
          );
        } catch (reason) {
          clear();
          throw reason;
        } finally {
          signal.removeEventListener("abort", abort);
          lifetime.signal.removeEventListener("abort", abort);
        }
      });
      queued = task.catch(() => {});
      return task;
    },
  };
}

function gopBounds(video: JumpVideo, index: number) {
  const target = video.timeline.frames[index];
  if (!target) throw new Error("Nie ma takiej klatki.");
  let start = target.sampleIndex;
  while (start > 0 && !video.samples[start].isSync) start--;
  let end = start + 1;
  while (end < video.samples.length && !video.samples[end].isSync) end++;
  return { start, end };
}

async function decodeFrame(
  video: JumpVideo,
  index: number,
  signal: AbortSignal,
  retain?: (frame: VideoFrame) => boolean,
): Promise<VideoFrame> {
  signal.throwIfAborted();
  const target = video.timeline.frames[index];
  if (!target) throw new Error("Nie ma takiej klatki.");
  const { start, end } = gopBounds(video, index);
  let frame: VideoFrame | null = null;
  let decoderError: Error | null = null;
  let stoppedReason: unknown;
  const decoder = new VideoDecoder({
    output: (decoded) => {
      if (signal.aborted || stoppedReason) decoded.close();
      else if (decoded.timestamp === target.timestampUs && !frame) frame = decoded;
      else if (retain?.(decoded)) return;
      else decoded.close();
    },
    error: (error) => {
      decoderError = error;
      queueMicrotask(() => stop(error));
    },
  });
  const close = () => {
    if (decoder.state !== "closed") decoder.close();
  };
  let rejectStopped: (reason: unknown) => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStopped = reject;
  });
  // Cancellation may happen while we are yielding, before flush is awaited.
  void stopped.catch(() => {});
  const stop = (reason: unknown) => {
    stoppedReason = reason;
    close();
    rejectStopped(reason);
  };
  const cancel = () => stop(signal.reason ?? new DOMException("Anulowano", "AbortError"));
  const decoderClosed = () => decoder.state === "closed";
  signal.addEventListener("abort", cancel, { once: true });
  // Bound a stalled platform decoder as well as user cancellation.
  const timeout = setTimeout(
    () =>
      stop(new Error("Odczyt klatki trwa za długo. Spróbuj ponownie albo wybierz krótszy film.")),
    15_000,
  );
  try {
    decoder.configure(video.config);
    for (let i = start; i < end && (!frame || retain); i++) {
      signal.throwIfAborted();
      if (stoppedReason) throw stoppedReason;
      if (decoderError || decoderClosed()) throw new Error("Nie udało się odczytać klatki filmu.");
      const sample = video.samples[i];
      decoder.decode(
        new EncodedVideoChunk({
          type: sample.isSync ? "key" : "delta",
          timestamp: sample.timestampUs,
          duration: sample.durationUs,
          data: sample.data,
        }),
      );
      // Bound queued compressed frames and yield to UI input during long GOPs.
      const maxQueue =
        (video.config.codedWidth ?? 0) * (video.config.codedHeight ?? 0) > 1920 * 1080 ? 2 : 8;
      while (decoder.decodeQueueSize > maxQueue && (!frame || retain)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2));
        signal.throwIfAborted();
        if (stoppedReason) throw stoppedReason;
        if (decoderError || decoderClosed())
          throw new Error("Odczyt klatki nie zakończył się. Spróbuj ponownie.");
      }
    }
    if (!frame || retain) await Promise.race([decoder.flush(), stopped]);
    signal.throwIfAborted();
    if (decoderError || !frame)
      throw new Error(
        "Nie można potwierdzić dokładnej klatki. Spróbuj ponownie albo wybierz inny oryginalny film.",
      );
    const result = frame;
    frame = null;
    return result;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    close();
    (frame as VideoFrame | null)?.close();
  }
}
