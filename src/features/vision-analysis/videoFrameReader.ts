import type { VideoMetadata } from "./types";
import { vlog, vwarn } from "./devLog";

/** Callback wywoływany dla każdej zdekodowanej klatki. */
export type FrameHandler = (frame: {
  frameIndex: number;
  mediaTime: number;
  presentationTimestamp: number;
  sourceTimestampMs: number;
  video: HTMLVideoElement;
}) => Promise<void> | void;

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
      throw new VideoLoadError(
        "INVALID_MIME_TYPE",
        `Plik nie jest filmem (typ: ${type}).`,
      );
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
    throw new VideoLoadError(
      "NO_DIMENSIONS",
      "Nie udało się odczytać rozdzielczości filmu.",
    );
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
      const code = err ? map[err.code] ?? "VIDEO_ELEMENT_ERROR" : "VIDEO_ELEMENT_ERROR";
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
          fail("VIDEO_LOAD_STALLED", "Wczytywanie filmu utknęło. Sprawdź połączenie i spróbuj ponownie.");
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
 * Iteruje po rzeczywistych klatkach wideo, wywołując handler.
 * Preferuje requestVideoFrameCallback (dokładne mediaTime/presentationTime),
 * z fallbackiem do próbkowania po currentTime (seek).
 */
export async function iterateFrames(
  url: string,
  metadata: VideoMetadata,
  onFrame: FrameHandler,
  onProgress?: (processed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("webkit-playsinline", "true");
  video.preload = "auto";

  // Czekaj na dane do dekodowania z twardym limitem czasu (bez tego iOS
  // potrafi nigdy nie wyemitować loadeddata → nieskończone "dekodowanie").
  await new Promise<void>((resolve, reject) => {
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
      video.pause();
      video.src = "";
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

  const total = Math.max(1, metadata.frameCount);
  const supportsRVFC =
    typeof (video as unknown as Record<string, unknown>).requestVideoFrameCallback === "function";

  // Ścieżka 1: requestVideoFrameCallback (dokładne mediaTime podczas odtwarzania).
  // Uruchamiana tylko gdy odtwarzanie faktycznie ruszy; inaczej fallback seek.
  let playedFrames = 0;
  let rvfcError: unknown = null;
  if (supportsRVFC) {
    throwIfAborted(signal);
    playedFrames = await new Promise<number>((resolve) => {
      let index = 0;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        video.pause();
        resolve(index);
      };
      const abort = () => done();
      signal?.addEventListener("abort", abort, { once: true });
      // Watchdog: jeśli w 6 s nie pojawi się żadna klatka (autoplay zablokowany),
      // przerywamy i przechodzimy do fallbacku seek.
      const watchdog = setTimeout(() => {
        if (index === 0) {
          vwarn("iterateFrames", "rVFC nie wystartował — fallback do seek");
          done();
        }
      }, 6_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cb = async (_now: number, meta: any) => {
        if (finished || signal?.aborted) return done();
        const sourceTimestampMs = Math.max(0, Math.round(meta.mediaTime * 1000));
        try {
          await onFrame({
            frameIndex: index,
            mediaTime: meta.mediaTime,
            presentationTimestamp: meta.mediaTime,
            sourceTimestampMs,
            video,
          });
        } catch (err) {
          // Błąd analizy klatki (np. model pozy) nie może zawiesić promisa —
          // zapamiętaj i zakończ, żeby pipeline zwrócił konkretny błąd.
          rvfcError = err;
          return done();
        }
        index++;
        onProgress?.(index, total);
        if (video.ended || video.currentTime >= metadata.durationSeconds - 0.001) return done();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (video as any).requestVideoFrameCallback(cb);
      };
      video.onended = () => done();
      video.currentTime = 0;
      video
        .play()
        .then(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (video as any).requestVideoFrameCallback(cb);
        })
        .catch((err) => {
          vwarn("iterateFrames", "play() odrzucone — fallback do seek", err?.message);
          done();
        });
    }).finally(() => signal?.removeEventListener("abort", abort));
    throwIfAborted(signal);
    if (rvfcError) {
      video.src = "";
      throw rvfcError;
    }
    if (playedFrames > 0) {
      vlog("iterateFrames", `rVFC: ${playedFrames} klatek`);
      video.src = "";
      return;
    }
  }


  // Ścieżka 2 (fallback): próbkowanie po currentTime + event seeked.
  vlog("iterateFrames", "fallback seek", { fps: metadata.fps });
  video.pause();
  const step = 1 / Math.max(1, metadata.fps);
  let index = 0;
  for (let tSec = 0; tSec < metadata.durationSeconds; tSec += step) {
    throwIfAborted(signal);
    await seekTo(video, tSec);
    const sourceTimestampMs = Math.max(0, Math.round(video.currentTime * 1000));
    await onFrame({
      frameIndex: index,
      mediaTime: video.currentTime,
      presentationTimestamp: video.currentTime,
      sourceTimestampMs,
      video,
    });
    index++;
    onProgress?.(index, total);
  }
  vlog("iterateFrames", `seek: ${index} klatek`);
  video.src = "";
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, 3_000); // nie blokuj na uszkodzonym seeku
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}
