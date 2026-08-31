import type { VideoMetadata } from "./types";
import { vlog } from "./devLog";

/** Callback wywoływany dla każdej zdekodowanej klatki. */
export type FrameHandler = (frame: {
  frameIndex: number;
  /** Stabilny indeks źródłowej klatki (deterministyczny między uruchomieniami). */
  sourceFrameIndex: number;
  mediaTime: number;
  presentationTimestamp: number;
  sourceTimestampMs: number;
  /** Rzeczywisty timestamp źródłowej klatki w mikrosekundach (pełna precyzja). */
  sourceTimestampUs: number;
  video: HTMLVideoElement;
}) => Promise<void> | void;

export interface ScheduledVideoFrame {
  frameIndex: number;
  sourceFrameIndex: number;
  mediaTime: number;
  presentationTimestamp: number;
  sourceTimestampMs: number;
  sourceTimestampUs: number;
}

export interface VideoTimeWindow {
  startSeconds: number;
  endSeconds: number;
}

export interface FrameScheduleOptions {
  /** Docelowa częstotliwość próbkowania; nigdy nie tworzy klatek spoza źródła. */
  targetFps?: number;
  /** Twardy budżet chroniący analizę na telefonie przed tysiącami seeków. */
  maxFrames?: number;
}

/** Błąd wczytywania wideo z konkretnym kodem (widoczny dla użytkownika). */
export class VideoLoadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VideoLoadError";
    this.code = code;
  }
}

const METADATA_TIMEOUT_MS = 10_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new VideoLoadError("ANALYSIS_ABORTED", "Analiza została przerwana.");
}

/** Wykrywa kontener z MIME lub rozszerzenia w URL. */
function detectContainer(mime: string | null, url: string): string | null {
  if (mime) {
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("quicktime")) return "mov";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("ogg")) return "ogg";
  }
  const clean = url.split("?")[0].toLowerCase();
  const m = clean.match(/\.(mp4|mov|m4v|webm|ogg|avi|mkv)$/);
  return m ? m[1] : null;
}

/**
 * Weryfikuje, że źródło filmu jest osiągalne (HTTP 200/206), ma typ wideo i
 * niezerowy rozmiar. Pomija blob:/object URL-e (plik jest już lokalnie w pamięci).
 * Zwraca rozpoznany MIME type, jeśli serwer go poda.
 */
async function probeSource(url: string): Promise<string | null> {
  if (url.startsWith("blob:") || url.startsWith("data:")) return null;
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1" } });
    if (!res.ok && res.status !== 206) {
      throw new VideoLoadError(
        "HTTP_" + res.status,
        `Serwer zwrócił status ${res.status} dla pliku filmu.`,
      );
    }
    const type = res.headers.get("content-type");
    if (type && !type.startsWith("video/") && !type.includes("octet-stream")) {
      throw new VideoLoadError("INVALID_MIME_TYPE", `Plik nie jest filmem (typ: ${type}).`);
    }
    const len = res.headers.get("content-range") || res.headers.get("content-length");
    if (len === "0") {
      throw new VideoLoadError("EMPTY_FILE", "Plik filmu jest pusty.");
    }
    // Zwolnij ewentualny strumień odpowiedzi.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return type;
  } catch (e) {
    if (e instanceof VideoLoadError) throw e;
    throw new VideoLoadError("NETWORK_ERROR", "Nie udało się pobrać pliku filmu z serwera.");
  }
}

/** Odczytuje metadane wideo z pliku (FPS oszacowane z rzeczywistych klatek). */
export async function readVideoMetadata(
  url: string,
  declaredFps: number | null,
): Promise<VideoMetadata> {
  const mime = await probeSource(url);

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("webkit-playsinline", "true");
  video.preload = "auto";
  video.src = url;

  await loadMetadataWithTimeout(video, url);

  const width = video.videoWidth;
  const height = video.videoHeight;
  const durationSeconds = video.duration;

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    video.src = "";
    throw new VideoLoadError(
      "NO_DURATION",
      "Nie udało się odczytać długości filmu. Nagraj lub wyeksportuj film ponownie.",
    );
  }
  if (!width || !height) {
    video.src = "";
    throw new VideoLoadError("NO_DIMENSIONS", "Nie udało się odczytać rozdzielczości filmu.");
  }

  // Oszacowanie FPS i realne timestampy z rzeczywistych klatek (requestVideoFrameCallback).
  let measuredFps: number | null = null;
  let frameTimestamps: number[] = [];
  const supportsRVFC =
    typeof (video as unknown as Record<string, unknown>).requestVideoFrameCallback === "function";
  if (supportsRVFC) {
    const est = await estimateFpsFromFrames(video);
    measuredFps = est.fps;
    frameTimestamps = est.timestamps;
  }

  const fps = measuredFps ?? declaredFps ?? 30;
  const frameCount = Math.round(durationSeconds * fps);
  const orientation: VideoMetadata["orientation"] =
    width === height ? "square" : width > height ? "landscape" : "portrait";

  video.src = "";
  return {
    fps: Math.round(fps),
    fpsMeasured: measuredFps != null,
    declaredFps,
    durationSeconds,
    frameCount: Number.isFinite(frameCount) ? frameCount : 0,
    width,
    height,
    orientation,
    container: detectContainer(mime, url),
    codec: mime,
    frameTimestamps,
  };
}

/**
 * Czeka na `loadedmetadata` z twardym timeoutem 10 s i obsługą
 * error/abort/stalled/suspend. Zawsze kończy się sukcesem lub VideoLoadError.
 */
function loadMetadataWithTimeout(video: HTMLVideoElement, url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(stalledTimer);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("canplay", onLoaded);
      video.removeEventListener("error", onError);
      video.removeEventListener("abort", onAbort);
      video.removeEventListener("stalled", onStalled);
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (code: string, message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      video.src = "";
      reject(new VideoLoadError(code, message));
    };

    const onLoaded = () => {
      if (video.readyState >= 1 && Number.isFinite(video.duration)) ok();
    };
    const onError = () => {
      const err = video.error;
      const map: Record<number, string> = {
        1: "VIDEO_ABORTED",
        2: "NETWORK_ERROR",
        3: "DECODE_ERROR",
        4: "SRC_NOT_SUPPORTED",
      };
      const code = err ? (map[err.code] ?? "VIDEO_ELEMENT_ERROR") : "VIDEO_ELEMENT_ERROR";
      fail(
        code,
        code === "SRC_NOT_SUPPORTED" || code === "DECODE_ERROR"
          ? "Format filmu nie jest obsługiwany w przeglądarce. Wyeksportuj jako MP4 (H.264)."
          : "Nie udało się wczytać filmu.",
      );
    };
    const onAbort = () => fail("VIDEO_LOAD_ABORTED", "Wczytywanie filmu zostało przerwane.");
    // stalled/suspend nie kończy od razu — tylko jeśli metadane nie pojawią się szybko.
    let stalledTimer: ReturnType<typeof setTimeout>;
    const onStalled = () => {
      clearTimeout(stalledTimer);
      stalledTimer = setTimeout(() => {
        if (video.readyState < 1) {
          fail(
            "VIDEO_LOAD_STALLED",
            "Wczytywanie filmu utknęło. Sprawdź połączenie i spróbuj ponownie.",
          );
        }
      }, 4000);
    };

    const timer = setTimeout(() => {
      fail(
        "METADATA_LOAD_TIMEOUT",
        "Odczyt metadanych filmu przekroczył 10 s. Wyeksportuj film jako MP4 (H.264) i spróbuj ponownie.",
      );
    }, METADATA_TIMEOUT_MS);

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("canplay", onLoaded);
    video.addEventListener("error", onError);
    video.addEventListener("abort", onAbort);
    video.addEventListener("stalled", onStalled);

    // Wymuś rozpoczęcie ładowania (iOS bywa leniwy z preload="metadata").
    try {
      video.load();
    } catch {
      /* ignore */
    }
    // Jeśli metadane już są (cache), zakończ natychmiast.
    if (video.readyState >= 1 && Number.isFinite(video.duration)) ok();
    void url;
  });
}

/** Mierzy FPS i realne timestampy licząc klatki przez krótki fragment odtwarzania. */
async function estimateFpsFromFrames(
  video: HTMLVideoElement,
): Promise<{ fps: number | null; timestamps: number[] }> {
  return new Promise((resolve) => {
    const times: number[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.pause();
      if (times.length < 4) return resolve({ fps: null, timestamps: times });
      const diffs: number[] = [];
      for (let i = 1; i < times.length; i++) diffs.push(times[i] - times[i - 1]);
      diffs.sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      resolve({ fps: median > 0 ? 1 / median : null, timestamps: times });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (_now: number, meta: any) => {
      times.push(meta.mediaTime);
      if (times.length >= 20 || meta.mediaTime > 1.2) return finish();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (video as any).requestVideoFrameCallback(cb);
    };
    video.currentTime = 0;
    video
      .play()
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (video as any).requestVideoFrameCallback(cb);
      })
      .catch(() => resolve({ fps: null, timestamps: [] }));
    setTimeout(finish, 4000);
  });
}

/**
 * Iteruje po klatkach wideo w sposób DETERMINISTYCZNY.
 *
 * Numeracja i timestampy klatek NIE zależą od requestVideoFrameCallback,
 * szybkości urządzenia, performance.now() ani kolejności Promise. Zamiast tego
 * budujemy stałą siatkę klatek na podstawie fps i długości filmu i seekujemy do
 * dokładnie tych samych czasów przy każdym uruchomieniu. Dzięki temu ten sam
 * plik + ta sama wersja algorytmu zawsze dają identyczny zestaw sourceTimestamp.
 */
export async function iterateFrames(
  url: string,
  metadata: VideoMetadata,
  onFrame: FrameHandler,
  onProgress?: (processed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const schedule = createFrameSchedule(metadata);
  await withLoadedVideoElement(url, signal, async (video) => {
    let processed = 0;
    for (const frame of schedule) {
      throwIfAborted(signal);
      const presentedTime = await seekToFrame(video, frame.mediaTime, signal);
      const actualTime = Number.isFinite(presentedTime) ? presentedTime : frame.mediaTime;
      const sourceTimestampUs = Math.round(actualTime * 1_000_000);
      await onFrame({
        ...frame,
        mediaTime: actualTime,
        presentationTimestamp: actualTime,
        sourceTimestampMs: Math.round(sourceTimestampUs / 1000),
        sourceTimestampUs,
        video,
      });
      processed += 1;
      onProgress?.(processed, schedule.length);
    }
  });
}

export function createFrameSchedule(metadata: VideoMetadata): ScheduledVideoFrame[] {
  const fps = Math.max(1, Math.round(metadata.fps));
  const frameCount = Math.max(
    1,
    metadata.frameCount > 0 ? metadata.frameCount : Math.round(metadata.durationSeconds * fps),
  );
  const safeTailSeconds = Math.max(2 / fps, 0.05);
  const safeDuration = Math.max(0, metadata.durationSeconds - safeTailSeconds);
  const frames: ScheduledVideoFrame[] = [];
  let lastSourceTimestampUs = -1;
  for (let sourceFrameIndex = 0; sourceFrameIndex < frameCount; sourceFrameIndex++) {
    const sourceTimestampUs = Math.round((sourceFrameIndex * 1_000_000) / fps);
    const mediaTime = sourceTimestampUs / 1_000_000;
    if (mediaTime > safeDuration) break;
    if (sourceTimestampUs <= lastSourceTimestampUs) continue;
    lastSourceTimestampUs = sourceTimestampUs;
    frames.push({
      frameIndex: sourceFrameIndex,
      sourceFrameIndex,
      mediaTime,
      presentationTimestamp: mediaTime,
      sourceTimestampMs: Math.round(sourceTimestampUs / 1000),
      sourceTimestampUs,
    });
  }
  vlog("frame_schedule", "deterministic seek grid", {
    fps,
    scheduledFrames: frames.length,
    safeDuration,
    safeTailSeconds,
  });
  return frames;
}

/**
 * Rzadki, równomierny przebieg po całym filmie. Służy wyłącznie do znalezienia
 * sylwetki, rodzaju ruchu i okien zdarzeń — nie jest źródłem końcowego czasu.
 */
export function createCoarseFrameSchedule(
  metadata: VideoMetadata,
  options: FrameScheduleOptions = {},
): ScheduledVideoFrame[] {
  const full = createFrameSchedule(metadata);
  const targetFps = Math.max(1, Math.min(metadata.fps, options.targetFps ?? 20));
  const maxFrames = Math.max(2, Math.floor(options.maxFrames ?? 240));
  const sourceStride = Math.max(1, Math.ceil(metadata.fps / targetFps));
  const sampled = full.filter((_, index) => index % sourceStride === 0);
  if (full.length > 0 && sampled.at(-1)?.sourceFrameIndex !== full.at(-1)?.sourceFrameIndex) {
    sampled.push(full[full.length - 1]);
  }
  return evenlyLimitSchedule(sampled, maxFrames);
}

/**
 * Dokładny przebieg po wskazanych oknach czasu. Klatki pochodzą z siatki
 * źródłowej; przy długim materiale budżet może obniżyć częstotliwość, co jest
 * później widoczne w realnych timestampach i niepewności wyniku.
 */
export function createPrecisionFrameSchedule(
  metadata: VideoMetadata,
  windows: VideoTimeWindow[],
  options: FrameScheduleOptions = {},
): ScheduledVideoFrame[] {
  if (windows.length === 0) return [];
  const normalized = normalizeWindows(windows, metadata.durationSeconds);
  if (normalized.length === 0) return [];
  const full = createFrameSchedule(metadata);
  const targetFps = Math.max(1, Math.min(metadata.fps, options.targetFps ?? metadata.fps));
  const sourceStride = Math.max(1, Math.ceil(metadata.fps / targetFps));
  const selected = full.filter(
    (frame, index) =>
      index % sourceStride === 0 &&
      normalized.some(
        (window) => frame.mediaTime >= window.startSeconds && frame.mediaTime <= window.endSeconds,
      ),
  );
  return evenlyLimitSchedule(selected, Math.max(2, Math.floor(options.maxFrames ?? 720)));
}

function normalizeWindows(windows: VideoTimeWindow[], durationSeconds: number): VideoTimeWindow[] {
  const clipped = windows
    .map((window) => ({
      startSeconds: Math.max(0, Math.min(durationSeconds, window.startSeconds)),
      endSeconds: Math.max(0, Math.min(durationSeconds, window.endSeconds)),
    }))
    .filter((window) => window.endSeconds > window.startSeconds)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const merged: VideoTimeWindow[] = [];
  for (const window of clipped) {
    const previous = merged.at(-1);
    if (!previous || window.startSeconds > previous.endSeconds) {
      merged.push({ ...window });
    } else {
      previous.endSeconds = Math.max(previous.endSeconds, window.endSeconds);
    }
  }
  return merged;
}

function evenlyLimitSchedule(
  schedule: ScheduledVideoFrame[],
  maxFrames: number,
): ScheduledVideoFrame[] {
  if (schedule.length <= maxFrames) return schedule;
  if (maxFrames <= 1) return schedule.length > 0 ? [schedule[0]] : [];
  const selected: ScheduledVideoFrame[] = [];
  let lastIndex = -1;
  for (let i = 0; i < maxFrames; i++) {
    const index = Math.round((i * (schedule.length - 1)) / (maxFrames - 1));
    if (index === lastIndex) continue;
    selected.push(schedule[index]);
    lastIndex = index;
  }
  return selected;
}

export async function withLoadedVideoElement<T>(
  url: string,
  signal: AbortSignal | undefined,
  handler: (video: HTMLVideoElement) => Promise<T>,
): Promise<T> {
  throwIfAborted(signal);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("webkit-playsinline", "true");
  video.preload = "auto";
  try {
    await waitForFrameData(video, signal);
    video.pause();
    return await handler(video);
  } finally {
    video.pause();
    video.src = "";
  }
}

function waitForFrameData(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onOk);
      video.removeEventListener("canplay", onOk);
      video.removeEventListener("error", onErr);
      signal?.removeEventListener("abort", onAbort);
    };
    const onOk = () => {
      if (settled || video.readyState < 2) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onErr = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new VideoLoadError("DECODE_ERROR", "Nie udało się wczytać wideo do analizy."));
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new VideoLoadError("ANALYSIS_ABORTED", "Analiza została przerwana."));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new VideoLoadError(
          "FRAME_LOAD_TIMEOUT",
          "Wczytanie klatek przekroczyło limit czasu. Wyeksportuj film jako MP4 (H.264).",
        ),
      );
    }, 15_000);
    video.addEventListener("loadeddata", onOk);
    video.addEventListener("canplay", onOk);
    video.addEventListener("error", onErr);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      video.load();
    } catch {
      /* ignore */
    }
    if (video.readyState >= 2) onOk();
  });
}

export function seekToFrame(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
): Promise<number> {
  const safeTailSeconds = 0.05;
  const duration = Number.isFinite(video.duration) ? video.duration : time;
  const maxTarget = Math.max(0, duration - safeTailSeconds);
  const target = Math.min(Math.max(0, time), maxTarget);

  // 0.5 ms nie pomija sąsiedniej klatki nawet przy 240 FPS (odstęp ~4.17 ms).
  if (video.readyState >= 2 && Math.abs(video.currentTime - target) <= 0.0005) {
    return Promise.resolve(video.currentTime);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let animationFrameId: number | null = null;
    let videoFrameCallbackId: number | null = null;
    const videoFrameApi = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata: { mediaTime?: number }) => void,
      ) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (animationFrameId != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoFrameCallbackId != null && videoFrameApi.cancelVideoFrameCallback) {
        videoFrameApi.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    const resolveDone = (presentedTime?: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Number.isFinite(presentedTime) ? presentedTime! : video.currentTime);
    };

    const rejectWith = (code: string, message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new VideoLoadError(code, message));
    };

    const waitForPresentedFrame = () => {
      if (videoFrameApi.requestVideoFrameCallback) {
        videoFrameCallbackId = videoFrameApi.requestVideoFrameCallback((_now, metadata) =>
          resolveDone(metadata.mediaTime),
        );
        return;
      }
      if (typeof requestAnimationFrame === "function") {
        animationFrameId = requestAnimationFrame(() => resolveDone(video.currentTime));
        return;
      }
      resolveDone(video.currentTime);
    };

    const onSeeked = () => waitForPresentedFrame();
    const onError = () => rejectWith("FRAME_SEEK_ERROR", "Nie udało się odczytać klatki filmu.");
    const onAbort = () => rejectWith("ANALYSIS_ABORTED", "Analiza została przerwana.");
    const timer = setTimeout(() => {
      rejectWith("FRAME_SEEK_TIMEOUT", "FRAME_SEEK_TIMEOUT");
    }, 2_500);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    video.currentTime = target;
  });
}
