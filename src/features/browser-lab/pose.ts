import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import type { FloorPoint } from "./longJump";

export interface DetectedPose {
  hip: FloorPoint;
  shoulders: FloorPoint;
  heels: [FloorPoint, FloorPoint];
  toes: [FloorPoint, FloorPoint];
  confidence: number;
  bodyHeight: number;
}

let poseTask: Promise<PoseLandmarker> | null = null;

function confidence(points: NormalizedLandmark[]) {
  return (
    points.reduce((sum, point) => sum + Math.min(point.visibility ?? 0, point.presence ?? 1), 0) /
    points.length
  );
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark): FloorPoint {
  return [(a.x + b.x) / 2, (a.y + b.y) / 2];
}

async function landmarker() {
  if (!poseTask) {
    poseTask = PoseLandmarker.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      {
        baseOptions: {
          modelAssetPath: "/models/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputSegmentationMasks: false,
      },
    ).catch(() => {
      poseTask = null;
      throw new Error(
        "Nie udało się uruchomić automatycznej analizy sylwetki. Odśwież stronę przy dobrym połączeniu i spróbuj ponownie.",
      );
    });
  }
  return poseTask;
}

export async function detectPose(
  canvas: HTMLCanvasElement | ImageBitmap,
): Promise<DetectedPose | null> {
  const task = await landmarker();
  const landmarks = task.detect(canvas).landmarks[0];
  if (!landmarks?.[32]) return null;
  const selected = [
    landmarks[11],
    landmarks[12],
    landmarks[23],
    landmarks[24],
    landmarks[27],
    landmarks[28],
    landmarks[29],
    landmarks[30],
    landmarks[31],
    landmarks[32],
  ];
  const score = confidence(selected);
  if (score < 0.45) return null;
  const hip = midpoint(landmarks[23], landmarks[24]);
  const shoulders = midpoint(landmarks[11], landmarks[12]);
  const feetY = Math.max(landmarks[27].y, landmarks[28].y, landmarks[31].y, landmarks[32].y);
  return {
    hip,
    shoulders,
    heels: [
      [landmarks[29].x, landmarks[29].y],
      [landmarks[30].x, landmarks[30].y],
    ],
    toes: [
      [landmarks[31].x, landmarks[31].y],
      [landmarks[32].x, landmarks[32].y],
    ],
    confidence: score,
    bodyHeight: Math.max(0.08, Math.abs(feetY - shoulders[1])),
  };
}
