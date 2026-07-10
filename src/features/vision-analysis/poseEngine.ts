import type { FramePose, Landmark } from "./types";
import { POSE } from "./types";

/**
 * Silnik pozy oparty na MediaPipe Pose Landmarker. Ładowany dynamicznie
 * (tylko w przeglądarce) — model i WASM z CDN. Zwraca landmarki per klatka.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let landmarkerPromise: Promise<any> | null = null;

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLandmarker(): Promise<any> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const { FilesetResolver, PoseLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
    });
  })();
  return landmarkerPromise;
}

const KEY_LANDMARKS = [
  POSE.LEFT_HIP, POSE.RIGHT_HIP, POSE.LEFT_KNEE, POSE.RIGHT_KNEE,
  POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE, POSE.LEFT_HEEL, POSE.RIGHT_HEEL,
  POSE.LEFT_FOOT_INDEX, POSE.RIGHT_FOOT_INDEX,
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
): Promise<FramePose> {
  const landmarker = await getLandmarker();
  const tsMs = Math.max(0, Math.round(mediaTime * 1000)) + frameIndex; // rosnący ts
  const result = landmarker.detectForVideo(video, tsMs);
  const poses: Landmark[][] = result?.landmarks ?? [];
  const peopleCount = poses.length;

  if (peopleCount === 0) {
    return {
      frameIndex,
      mediaTime,
      presentationTimestamp: mediaTime,
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
    mediaTime,
    presentationTimestamp: mediaTime,
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
export async function closePoseEngine(): Promise<void> {
  if (!landmarkerPromise) return;
  try {
    const l = await landmarkerPromise;
    l.close?.();
  } catch {
    /* ignore */
  }
  landmarkerPromise = null;
}
