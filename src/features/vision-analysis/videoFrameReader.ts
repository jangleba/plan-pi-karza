import type { VideoMetadata } from "./types";

/** Callback wywoływany dla każdej zdekodowanej klatki. */
export type FrameHandler = (frame: {
  frameIndex: number;
  mediaTime: number;
  presentationTimestamp: number;
  video: HTMLVideoElement;
}) => Promise<void> | void;

/** Odczytuje metadane wideo z pliku (FPS oszacowane z rzeczywistych klatek). */
export async function readVideoMetadata(
  url: string,
  declaredFps: number | null,
): Promise<VideoMetadata> {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Nie udało się odczytać metadanych wideo."));
  });

  const width = video.videoWidth;
  const height = video.videoHeight;
  const durationSeconds = video.duration;

  // Oszacowanie FPS z rzeczywistych timestampów klatek (requestVideoFrameCallback).
  let measuredFps: number | null = null;
  const supportsRVFC =
    typeof (video as unknown as Record<string, unknown>).requestVideoFrameCallback === "function";
  if (supportsRVFC && Number.isFinite(durationSeconds)) {
    measuredFps = await estimateFpsFromFrames(video);
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
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    frameCount: Number.isFinite(frameCount) ? frameCount : 0,
    width,
    height,
    orientation,
  };
}

/** Mierzy FPS licząc klatki przez krótki fragment odtwarzania. */
async function estimateFpsFromFrames(video: HTMLVideoElement): Promise<number | null> {
  return new Promise((resolve) => {
    const times: number[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.pause();
      if (times.length < 4) return resolve(null);
      const diffs: number[] = [];
      for (let i = 1; i < times.length; i++) diffs.push(times[i] - times[i - 1]);
      diffs.sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      resolve(median > 0 ? 1 / median : null);
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
      .catch(() => resolve(null));
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
): Promise<void> {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Nie udało się wczytać wideo do analizy."));
  });

  const total = Math.max(1, metadata.frameCount);
  const supportsRVFC =
    typeof (video as unknown as Record<string, unknown>).requestVideoFrameCallback === "function";

  if (supportsRVFC) {
    await new Promise<void>((resolve) => {
      let index = 0;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        video.pause();
        resolve();
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cb = async (now: number, meta: any) => {
        await onFrame({
          frameIndex: index,
          mediaTime: meta.mediaTime,
          presentationTimestamp: meta.mediaTime,
          video,
        });
        index++;
        onProgress?.(index, total);
        if (video.ended || video.currentTime >= metadata.durationSeconds - 0.001) return done();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (video as any).requestVideoFrameCallback(cb);
      };
      video.onended = done;
      video
        .play()
        .then(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (video as any).requestVideoFrameCallback(cb);
        })
        .catch(done);
    });
    video.src = "";
    return;
  }

  // Fallback: seek co 1/fps sekundy.
  const step = 1 / metadata.fps;
  let index = 0;
  for (let tSec = 0; tSec < metadata.durationSeconds; tSec += step) {
    await seekTo(video, tSec);
    await onFrame({
      frameIndex: index,
      mediaTime: video.currentTime,
      presentationTimestamp: video.currentTime,
      video,
    });
    index++;
    onProgress?.(index, total);
  }
  video.src = "";
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
    video.currentTime = time;
  });
}
