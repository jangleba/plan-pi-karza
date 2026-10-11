import { MAX_VIDEO_BYTES } from "./video";

export interface LabCamera {
  stream: MediaStream;
  mimeType: string;
  settings: MediaTrackSettings;
}

export function stopCamera(camera: LabCamera) {
  camera.stream.getTracks().forEach((track) => track.stop());
}

function recordingTypes() {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  )
    return [];
  return ["video/mp4;codecs=avc1", "video/mp4"].filter((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/** Negotiate modes exposed by the browser, never guess a phone model or hardware FPS. */
export async function openLabCamera(signal: AbortSignal): Promise<LabCamera> {
  signal.throwIfAborted();
  const mimeTypes = recordingTypes();
  if (
    !globalThis.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia ||
    !mimeTypes.length
  )
    throw new Error(
      "Nagrywanie w Lab nie jest dostępne. Otwórz opublikowaną aplikację w Safari lub wybierz film.",
    );
  let stream: MediaStream | null = null;
  try {
    const constraints: MediaTrackConstraints = {
      facingMode: { exact: "environment" },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1920 },
      frameRate: { ideal: 60, max: 240 },
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: constraints,
      });
    } catch (reason) {
      if (
        !(reason instanceof DOMException) ||
        reason.name !== "OverconstrainedError"
      )
        throw reason;
      signal.throwIfAborted();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...constraints, facingMode: { ideal: "environment" } },
      });
    }
    signal.throwIfAborted();
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("Kamera nie udostępniła obrazu. Wybierz film.");
    const capabilities =
      typeof track.getCapabilities === "function"
        ? track.getCapabilities()
        : {};
    const rates = [
      ...new Set([
        Math.min(240, capabilities.frameRate?.max ?? 240),
        240,
        120,
        60,
        50,
        30,
        25,
        24,
        15,
      ]),
    ]
      .filter((rate) => rate >= 15)
      .sort((a, b) => b - a);
    for (const fps of rates) {
      if (
        capabilities.frameRate?.max !== undefined &&
        capabilities.frameRate.max < fps
      )
        continue;
      try {
        await track.applyConstraints({
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1920 },
          frameRate: { exact: fps },
        });
        signal.throwIfAborted();
        const actual = track.getSettings().frameRate;
        // Some platforms ignore a constraint; do not advertise the requested FPS.
        if (actual === undefined || actual >= fps * 0.95) break;
      } catch (reason) {
        signal.throwIfAborted();
        if (
          !(reason instanceof DOMException) ||
          reason.name !== "OverconstrainedError"
        )
          throw reason;
      }
    }
    signal.throwIfAborted();
    // Check recorder construction before offering Start. Encoding can still fail at runtime.
    for (const mimeType of mimeTypes) {
      try {
        new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
        return { stream, mimeType, settings: track.getSettings() };
      } catch (reason) {
        if (
          !(reason instanceof DOMException) ||
          reason.name !== "NotSupportedError"
        )
          throw reason;
      }
    }
    throw new Error(
      "Kamera nie obsługuje zapisu MP4 w Lab. Wybierz film z Aparatu.",
    );
  } catch (reason) {
    stream?.getTracks().forEach((track) => track.stop());
    if (signal.aborted) throw signal.reason;
    if (
      reason instanceof DOMException &&
      ["NotAllowedError", "SecurityError"].includes(reason.name)
    )
      throw new Error(
        "Brak dostępu do kamery. Zezwól na kamerę w Safari. W podglądzie Lovable otwórz opublikowaną aplikację albo wybierz film.",
      );
    if (
      reason instanceof DOMException &&
      ["NotReadableError", "NotFoundError"].includes(reason.name)
    )
      throw new Error(
        "Kamera jest niedostępna lub zajęta. Zamknij inne aplikacje używające kamery i spróbuj ponownie.",
      );
    throw reason;
  }
}

/** Record original MP4 chunks, without resampling frames or using UI-clock timing for measurement. */
export function recordLabCamera(
  camera: LabCamera,
  signal: AbortSignal,
  onSeconds: (seconds: number) => void,
) {
  signal.throwIfAborted();
  const recorder = new MediaRecorder(camera.stream, {
    mimeType: camera.mimeType,
    videoBitsPerSecond: 12_000_000,
  });
  const chunks: Blob[] = [];
  let bytes = 0;
  let settled = false;
  let stopping = false;
  let finish!: (file: File) => void;
  let fail!: (reason: unknown) => void;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  const finished = new Promise<File>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  // The caller may cancel during countdown/teardown before awaiting completion.
  void finished.catch(() => {});
  const clean = () => {
    clearTimeout(maximum);
    clearInterval(progress);
    clearTimeout(stopTimeout);
    signal.removeEventListener("abort", cancel);
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
  };
  const reject = (reason: unknown) => {
    if (settled) return;
    settled = true;
    clean();
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* Already stopped by the platform. */
      }
    }
    stopCamera(camera);
    fail(reason);
  };
  const cancel = () =>
    reject(signal.reason ?? new DOMException("Anulowano", "AbortError"));
  const stop = () => {
    if (settled || stopping) return;
    stopping = true;
    clearTimeout(maximum);
    clearInterval(progress);
    // Bound a platform recorder that never sends its final data/stop event.
    stopTimeout = setTimeout(
      () =>
        reject(new Error("Kamera nie zakończyła nagrania. Spróbuj ponownie.")),
      5000,
    );
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch (reason) {
      reject(reason);
    }
  };
  recorder.ondataavailable = (event) => {
    if (settled || !event.data.size) return;
    bytes += event.data.size;
    if (bytes > MAX_VIDEO_BYTES)
      reject(new Error("Nagranie przekracza 128 MB. Nagraj krótszą próbę."));
    else chunks.push(event.data);
  };
  recorder.onerror = () =>
    reject(
      new Error(
        "Nie udało się nagrać filmu. Spróbuj ponownie lub wybierz film.",
      ),
    );
  recorder.onstop = () => {
    if (settled) return;
    if (!bytes) {
      reject(new Error("Kamera nie zapisała filmu. Nagraj ponownie."));
      return;
    }
    settled = true;
    clean();
    stopCamera(camera);
    finish(
      new File(
        chunks,
        `BallWise-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`,
        { type: recorder.mimeType || camera.mimeType },
      ),
    );
  };
  signal.addEventListener("abort", cancel, { once: true });
  const maximum = setTimeout(stop, 8000);
  const progress = setInterval(
    () => onSeconds(Math.min(8, Math.floor((Date.now() - started) / 1000))),
    250,
  );
  try {
    recorder.start(1000);
  } catch (reason) {
    reject(reason);
  }
  return { finished, stop };
}
