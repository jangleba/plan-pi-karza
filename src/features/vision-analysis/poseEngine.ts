import type { FramePose, Landmark } from "./types";
import { POSE } from "./types";
import { vlog } from "./devLog";

/**
 * Silnik pozy oparty na MediaPipe Pose Landmarker. Ładowany dynamicznie
 * (tylko w przeglądarce) — model i WASM z CDN. Zwraca landmarki per klatka.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let filesetPromise: Promise<any> | null = null;
let landmarkerPromise: Promise<PoseLandmarkerSession> | null = null;
let activeAnalysisRunId: string | null = null;
let poseLandmarkerInstanceSeq = 0;

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createLandmarkerInstance(): Promise<any> {
  const vision = await import("@mediapipe/tasks-vision");
  const { FilesetResolver, PoseLandmarker } = vision;
  filesetPromise ??= timeout(FilesetResolver.forVisionTasks(WASM_ROOT), 12_000, "WASM");
  const fileset = await filesetPromise;
  const options = {
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
  } as const;
  try {
    return await timeout(
      PoseLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      }),
      12_000,
      "PoseLandmarker GPU",
    );
  } catch {
    return timeout(
      PoseLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      }),
      12_000,
      "PoseLandmarker CPU",
    );
  }
}

interface PoseLandmarkerSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  landmarker: any;
  analysisRunId: string;
  instanceId: string;
  lastTimestampMs: number;
  closed: boolean;
}

interface DetectPoseOptions {
  analysisRunId: string;
  passType?: "coarse" | "precision";
  sourceTimestampMs?: number;
  sourceTimestampUs?: number;
  sourceFrameIndex?: number;
}

interface VisionTimestampDebugRow {
  frameIndex: number;
  passType: string;
  analysisRunId: string;
  sourceTimestampMs: number;
  mediaPipeTimestampMs: number;
  previousMediaPipeTimestampMs: number;
  isMonotonic: boolean;
  poseLandmarkerInstanceId: string;
}

const timestampDebugRows: VisionTimestampDebugRow[] = [];

export class FrameTimestampOrderError extends Error {
  code = "FRAME_TIMESTAMP_ORDER_ERROR";
  technicalMessage: string;
  constructor(message: string, technicalMessage = message) {
    super(message);
    this.name = "FrameTimestampOrderError";
    this.technicalMessage = technicalMessage;
  }
}

export const FRAME_TIMESTAMP_ORDER_USER_MESSAGE =
  "Nie udało się przetworzyć nagrania z powodu błędu analizy. Spróbuj ponownie.";

function visionDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("visionDebug") === "true";
}

function isTimestampMismatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /INVALID_ARGUMENT|CalculatorGraph|timestamp mismatch|WaitUntilIdle|graph_utils\.cc/i.test(
    message,
  );
}

export function clearPoseDebugLog(): void {
  timestampDebugRows.length = 0;
}

export function flushPoseDebugLog(analysisRunId: string): void {
  if (!visionDebugEnabled()) return;
  const rows = timestampDebugRows.filter((row) => row.analysisRunId === analysisRunId);
  if (rows.length === 0) return;
  // eslint-disable-next-line no-console
  console.table(rows);
}

async function getLandmarker(analysisRunId: string): Promise<PoseLandmarkerSession> {
  if (landmarkerPromise && activeAnalysisRunId === analysisRunId) return landmarkerPromise;
  if (landmarkerPromise) await closePoseEngine();
  activeAnalysisRunId = analysisRunId;
  landmarkerPromise = (async () => {
    const instanceId = `pose-${++poseLandmarkerInstanceSeq}`;
    const landmarker = await createLandmarkerInstance();
    vlog("pose_engine:new_instance", { analysisRunId, poseLandmarkerInstanceId: instanceId });
    return { landmarker, analysisRunId, instanceId, lastTimestampMs: -1, closed: false };
  })();
  return landmarkerPromise;
}

const KEY_LANDMARKS = [
  POSE.LEFT_HIP,
  POSE.RIGHT_HIP,
  POSE.LEFT_KNEE,
  POSE.RIGHT_KNEE,
  POSE.LEFT_ANKLE,
  POSE.RIGHT_ANKLE,
  POSE.LEFT_HEEL,
  POSE.RIGHT_HEEL,
  POSE.LEFT_FOOT_INDEX,
  POSE.RIGHT_FOOT_INDEX,
];

function meanVisibility(landmarks: Landmark[]): number {
  const vals = KEY_LANDMARKS.map((i) => landmarks[i]?.visibility ?? 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Sprawdza wsparcie dla analizy w tej przeglądarce. */
export function isPoseSupported(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Wykrywa pozę w pojedynczej klatce wideo. */
export async function detectPose(
  video: HTMLVideoElement,
  frameIndex: number,
  mediaTime: number,
  options: DetectPoseOptions,
): Promise<FramePose> {
  const session = await getLandmarker(options.analysisRunId);
  if (session.closed) {
    throw new FrameTimestampOrderError(FRAME_TIMESTAMP_ORDER_USER_MESSAGE, "PoseLandmarker closed");
  }
  const sourceTimestampMs = Math.max(
    0,
    options.sourceTimestampMs ?? Math.round(mediaTime * 1000),
  );
  const sourceTimestampUs = Math.max(
    0,
    options.sourceTimestampUs ?? Math.round(mediaTime * 1_000_000),
  );
  const sourceFrameIndex = options.sourceFrameIndex ?? frameIndex;
  const previousMediaPipeTimestampMs = session.lastTimestampMs;
  const mediaPipeTimestampMs = Math.max(sourceTimestampMs, previousMediaPipeTimestampMs + 1);
  const isMonotonic = mediaPipeTimestampMs > previousMediaPipeTimestampMs;
  if (!isMonotonic) {
    throw new FrameTimestampOrderError(
      FRAME_TIMESTAMP_ORDER_USER_MESSAGE,
      `Non-monotonic timestamp: previous=${previousMediaPipeTimestampMs}, current=${mediaPipeTimestampMs}`,
    );
  }

  let result: { landmarks?: Landmark[][] };
  try {
    result = session.landmarker.detectForVideo(video, mediaPipeTimestampMs);
  } catch (error) {
    if (isTimestampMismatchError(error)) {
      throw new FrameTimestampOrderError(
        FRAME_TIMESTAMP_ORDER_USER_MESSAGE,
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
  }
  session.lastTimestampMs = mediaPipeTimestampMs;
  timestampDebugRows.push({
    frameIndex,
    passType: options.passType ?? "coarse",
    analysisRunId: options.analysisRunId,
    sourceTimestampMs,
    mediaPipeTimestampMs,
    previousMediaPipeTimestampMs,
    isMonotonic,
    poseLandmarkerInstanceId: session.instanceId,
  });
  const poses: Landmark[][] = result?.landmarks ?? [];
  const peopleCount = poses.length;

  if (peopleCount === 0) {
    return {
      frameIndex,
      sourceFrameIndex,
      mediaTime,
      presentationTimestamp: mediaTime,
      sourceTimestampMs,
      sourceTimestampUs,
      mediaPipeTimestampMs,
      landmarks: null,
      peopleCount: 0,
      trackingConfidence: 0,
    };
  }

  // Wybór głównego zawodnika = największa widoczność kluczowych landmarków.
  let best = poses[0];
  let bestVis = meanVisibility(best);
  for (let i = 1; i < poses.length; i++) {
    const v = meanVisibility(poses[i]);
    if (v > bestVis) {
      best = poses[i];
      bestVis = v;
    }
  }

  return {
    frameIndex,
    sourceFrameIndex,
    mediaTime,
    presentationTimestamp: mediaTime,
    sourceTimestampMs,
    sourceTimestampUs,
    mediaPipeTimestampMs,
    landmarks: best.map((l) => ({
      x: l.x,
      y: l.y,
      z: l.z ?? 0,
      visibility: l.visibility ?? 0,
    })),
    peopleCount,
    trackingConfidence: bestVis,
  };
}

/** Zwalnia zasoby (przy odmontowaniu). */
export async function closePoseEngine(analysisRunId?: string): Promise<void> {
  if (!landmarkerPromise) return;
  if (analysisRunId && activeAnalysisRunId !== analysisRunId) return;
  const promise = landmarkerPromise;
  landmarkerPromise = null;
  activeAnalysisRunId = null;
  try {
    const session = await promise;
    session.closed = true;
    session.landmarker.close?.();
  } catch {
    /* ignore */
  }
}
