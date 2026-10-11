import {
  createFile,
  DataStream,
  Endianness,
  type MP4BoxBuffer,
  type Sample,
  type Box,
} from "mp4box";
import {
  buildJumpTimeline,
  validateEdits,
  type JumpTimeline,
} from "./measurement";

export const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

export interface JumpVideo {
  timeline: JumpTimeline;
  config: VideoDecoderConfig;
  rotation: number;
  samples: {
    data: Uint8Array<ArrayBuffer>;
    isSync: boolean;
    timestampUs: number;
    durationUs: number;
  }[];
}

export function parseJumpVideo(buffer: ArrayBuffer): JumpVideo {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_VIDEO_BYTES)
    throw new Error(
      "Wybierz oryginalny film do 128 MB i 20 sekund, z jedną próbą.",
    );
  const mp4 = createFile(true);
  let parseError: string | null = null;
  mp4.onError = (_module, message) => {
    parseError = message;
  };
  const input = buffer as MP4BoxBuffer;
  input.fileStart = 0;
  try {
    mp4.appendBuffer(input);
    mp4.flush();
  } catch {
    throw new Error(
      "Film jest uszkodzony albo ma nieobsługiwany format. Wybierz oryginalny MP4 lub MOV.",
    );
  }
  if (parseError || !mp4.moov)
    throw new Error(
      "Nie można odczytać filmu. Wybierz oryginalny plik MP4 lub MOV.",
    );
  const info = mp4.getInfo();
  if (info.isFragmented || info.videoTracks.length !== 1)
    throw new Error(
      "Ten format filmu nie jest obsługiwany. Wybierz zwykły plik MP4 lub MOV z kamery.",
    );
  const track = info.videoTracks[0];
  validateEdits(track.edits);
  if (!track.video || track.video.width <= 0 || track.video.height <= 0)
    throw new Error(
      "Nie można odczytać rozdzielczości filmu. Wybierz oryginalny MP4 lub MOV.",
    );
  if (
    Math.max(track.video.width, track.video.height) > 4096 ||
    track.video.width * track.video.height > 4096 * 2160
  )
    throw new Error("Film przekracza 4K. Wybierz HD lub 4K, najlepiej 60 FPS.");
  if (!/^(avc1|avc3|hvc1|hev1)\./.test(track.codec))
    throw new Error("Wybierz film H.264 lub HEVC nagrany kamerą telefonu.");
  const metadata = mp4.getTrackSamplesInfo(track.id);
  const timeline = buildJumpTimeline(metadata);
  if (
    !metadata[0].is_sync ||
    metadata.some((s) => s.description_index !== metadata[0].description_index)
  )
    throw new Error(
      "Film nie ma stałego formatu klatek. Wybierz oryginalny plik z kamery.",
    );
  const entry = metadata[0].description as Sample["description"] & {
    avcC?: Box;
    hvcC?: Box;
  };
  const descriptionBox = entry.avcC ?? entry.hvcC;
  if (!descriptionBox)
    throw new Error("Brakuje danych potrzebnych do odczytania klatek filmu.");
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  descriptionBox.write(stream);
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    description: new Uint8Array(stream.buffer, 8),
  };
  const timestamps = new Map(
    timeline.frames.map((frame) => [frame.sampleIndex, frame.timestampUs]),
  );
  const samples = metadata.map((sample, index) => {
    const full = mp4.getTrackSample(track.id, index);
    if (!full?.data || full.data.byteLength !== sample.size)
      throw new Error(
        "Film jest niekompletny. Pobierz oryginał z telefonu i spróbuj ponownie.",
      );
    return {
      data: full.data,
      isSync: sample.is_sync,
      timestampUs: timestamps.get(index)!,
      durationUs: Math.round((sample.duration * 1_000_000) / sample.timescale),
    };
  });
  const matrix = track.matrix;
  const rotation = matrix
    ? (Math.round((Math.atan2(matrix[1] | 0, matrix[0] | 0) * 2) / Math.PI) *
        90 +
        360) %
      360
    : 0;
  return { timeline, config, samples, rotation };
}

export interface OpenedVideo extends JumpVideo {
  sourceName: string;
  sourceHash: string;
  sourceBytes: number;
}

function readOriginal(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => {
      reader.abort();
      reject(signal.reason ?? new DOMException("Anulowano", "AbortError"));
    };
    const clean = () => signal.removeEventListener("abort", cancel);
    reader.onload = () => {
      clean();
      resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = () => {
      clean();
      reject(
        new Error(
          "Nie udało się pobrać filmu. Zapisz oryginał w Plikach i wybierz go ponownie.",
        ),
      );
    };
    reader.onabort = clean;
    signal.addEventListener("abort", cancel, { once: true });
    reader.readAsArrayBuffer(file);
  });
}

export async function openJumpVideo(
  file: File,
  signal: AbortSignal,
): Promise<OpenedVideo> {
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
    throw new Error(
      "Film przekracza 128 MB. Nagraj krótszy klip (5–10 s) lub wybierz HD 60 FPS.",
    );
  const buffer = await readOriginal(file, signal);
  signal.throwIfAborted();
  const video = parseJumpVideo(buffer);
  const support = await VideoDecoder.isConfigSupported(video.config);
  signal.throwIfAborted();
  if (!support.supported)
    throw new Error(
      "Przeglądarka nie obsługuje kodeka tego filmu. W ustawieniach Aparatu wybierz „Najbardziej zgodny” i nagraj HD 60 FPS.",
    );
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  signal.throwIfAborted();
  return {
    ...video,
    sourceName: file.name || "nagranie",
    sourceBytes: file.size,
    sourceHash: [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  };
}

/** Decode a complete GOP, matching the target by PTS even with B frames. Caller owns the returned frame. */
export async function decodeJumpFrame(
  video: JumpVideo,
  index: number,
  signal: AbortSignal,
): Promise<VideoFrame> {
  signal.throwIfAborted();
  const target = video.timeline.frames[index];
  if (!target) throw new Error("Nie ma takiej klatki.");
  let start = target.sampleIndex;
  while (start > 0 && !video.samples[start].isSync) start--;
  let end = start + 1;
  while (end < video.samples.length && !video.samples[end].isSync) end++;
  let frame: VideoFrame | null = null;
  let decoderError: Error | null = null;
  const decoder = new VideoDecoder({
    output: (decoded) => {
      if (!signal.aborted && decoded.timestamp === target.timestampUs && !frame)
        frame = decoded;
      else decoded.close();
    },
    error: (error) => {
      decoderError = error;
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
    close();
    rejectStopped(reason);
  };
  const cancel = () =>
    stop(signal.reason ?? new DOMException("Anulowano", "AbortError"));
  const decoderClosed = () => decoder.state === "closed";
  signal.addEventListener("abort", cancel, { once: true });
  // Bound a stalled platform decoder as well as user cancellation.
  const timeout = setTimeout(
    () =>
      stop(
        new Error(
          "Odczyt klatki trwa za długo. Spróbuj ponownie albo wybierz krótszy film.",
        ),
      ),
    15_000,
  );
  try {
    decoder.configure(video.config);
    for (let i = start; i < end && !frame; i++) {
      signal.throwIfAborted();
      if (decoderError || decoderClosed())
        throw new Error("Nie udało się odczytać klatki filmu.");
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
        (video.config.codedWidth ?? 0) * (video.config.codedHeight ?? 0) >
        1920 * 1080
          ? 2
          : 8;
      while (decoder.decodeQueueSize > maxQueue && !frame) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2));
        signal.throwIfAborted();
        if (decoderError || decoderClosed())
          throw new Error("Odczyt klatki nie zakończył się. Spróbuj ponownie.");
      }
    }
    if (!frame) await Promise.race([decoder.flush(), stopped]);
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
