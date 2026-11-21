/**
 * Analiza nagrania modelem pozy (MediaPipe, działa w telefonie – wideo nie opuszcza urządzenia).
 * Zwraca pionową pozycję stóp w każdej klatce (0 = góra, 1 = dół) do wykrycia lotu.
 */
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// pięty i czubki stóp (ankle 27/28 jako zapas)
const FEET = [29, 30, 31, 32];
const ANKLES = [27, 28];

type Landmark = { x: number; y: number; visibility?: number };
type Landmarker = { detectForVideo: (v: HTMLVideoElement, ts: number) => { landmarks: Array<Landmark[]> }; close: () => void };
let cached: Promise<Landmarker> | null = null;
// MediaPipe wymaga ściśle rosnących znaczników czasu w całym życiu modelu
let lastTs = 0;

async function landmarker(): Promise<Landmarker> {
  if (!cached) {
    cached = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: "GPU" | "CPU") =>
        PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numPoses: 1 });
      // GPU szybciej; gdy telefon/przeglądarka go nie da – procesor
      const lm = await make("GPU").catch(() => make("CPU"));
      return lm as unknown as Landmarker;
    })();
    cached.catch(() => { cached = null; });
  }
  return cached;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const done = () => { v.removeEventListener("seeked", done); res(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

/** Pozycja stóp w każdej klatce nagrania. onProgress: 0–1. */
export async function footTrack(src: string, fps: number, onProgress: (p: number) => void): Promise<Array<number | null>> {
  const lm = await landmarker();
  const v = document.createElement("video");
  v.src = src; v.muted = true; v.playsInline = true; v.preload = "auto";
  await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("Nie można odczytać filmu")); });
  const frames = Math.floor(v.duration * fps);
  const out: Array<number | null> = [];
  for (let i = 0; i < frames; i++) {
    await seek(v, (i + 0.5) / fps);
    lastTs += 1 + Math.round(1000 / fps);
    const r = lm.detectForVideo(v, lastTs);
    const pts = r.landmarks[0];
    if (!pts) { out.push(null); }
    else {
      const pick = (ids: number[]) => ids.map((k) => pts[k]).filter((p) => p && (p.visibility ?? 1) > 0.5).map((p) => p!.y);
      const ys = pick(FEET).length ? pick(FEET) : pick(ANKLES);
      out.push(ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null);
    }
    if (i % 5 === 0) onProgress(i / frames);
  }
  onProgress(1);
  return out;
}

/** Punkty sylwetki w pikselach filmu (do automatycznego pomiaru skoku w dal). */
export interface PoseSample { eyeY: number; heelY: number; footY: number; heelXs: number[]; toeXs: number[] }

/** Oczy 2 i 5, pięty 29 i 30, czubki stóp 31 i 32. Zwraca klatki (null = brak sylwetki). onProgress: 0–1. */
export async function poseTrack(src: string, fps: number, onProgress: (p: number) => void): Promise<Array<PoseSample | null>> {
  const lm = await landmarker();
  const v = document.createElement("video");
  v.src = src; v.muted = true; v.playsInline = true; v.preload = "auto";
  await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("Nie można odczytać filmu")); });
  const W = v.videoWidth, H = v.videoHeight;
  const frames = Math.floor(v.duration * fps);
  const out: Array<PoseSample | null> = [];
  const ok = (p?: Landmark) => !!p && (p.visibility ?? 1) > 0.5;
  for (let i = 0; i < frames; i++) {
    await seek(v, (i + 0.5) / fps);
    lastTs += 1 + Math.round(1000 / fps);
    const pts = lm.detectForVideo(v, lastTs).landmarks[0];
    if (!pts) { out.push(null); }
    else {
      const eyes = [2, 5].map((k) => pts[k]).filter(ok);
      const heels = [29, 30].map((k) => pts[k]).filter(ok);
      const toes = [31, 32].map((k) => pts[k]).filter(ok);
      if (!eyes.length || !heels.length || !toes.length) out.push(null);
      else {
        const feetY = [...heels, ...toes].map((p) => p!.y * H);
        out.push({
          eyeY: (eyes.reduce((a, p) => a + p!.y, 0) / eyes.length) * H,
          heelY: Math.max(...heels.map((p) => p!.y * H)),
          footY: feetY.reduce((a, b) => a + b, 0) / feetY.length,
          heelXs: heels.map((p) => p!.x * W), toeXs: toes.map((p) => p!.x * W),
        });
      }
    }
    if (i % 5 === 0) onProgress(i / frames);
  }
  onProgress(1);
  return out;
}
