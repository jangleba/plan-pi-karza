import { useEffect, useRef, type RefObject } from "react";
import { closePoseEngine, detectPose } from "@/features/vision-analysis/poseEngine";
import { POSE, type FramePose, type Landmark } from "@/features/vision-analysis/types";
import { EMPTY_LIVE_POSE_STATUS, getLivePoseStatus, type LivePoseStatus } from "./visionLivePose";

interface VisionLivePoseOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  onStatus: (status: LivePoseStatus) => void;
}

const CONNECTIONS: [number, number][] = [
  [POSE.NOSE, POSE.LEFT_SHOULDER],
  [POSE.NOSE, POSE.RIGHT_SHOULDER],
  [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER],
  [POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW],
  [POSE.LEFT_ELBOW, POSE.LEFT_WRIST],
  [POSE.RIGHT_SHOULDER, POSE.RIGHT_ELBOW],
  [POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST],
  [POSE.LEFT_SHOULDER, POSE.LEFT_HIP],
  [POSE.RIGHT_SHOULDER, POSE.RIGHT_HIP],
  [POSE.LEFT_HIP, POSE.RIGHT_HIP],
  [POSE.LEFT_HIP, POSE.LEFT_KNEE],
  [POSE.LEFT_KNEE, POSE.LEFT_ANKLE],
  [POSE.LEFT_ANKLE, POSE.LEFT_HEEL],
  [POSE.LEFT_HEEL, POSE.LEFT_FOOT_INDEX],
  [POSE.RIGHT_HIP, POSE.RIGHT_KNEE],
  [POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE],
  [POSE.RIGHT_ANKLE, POSE.RIGHT_HEEL],
  [POSE.RIGHT_HEEL, POSE.RIGHT_FOOT_INDEX],
];

const MAX_LIVE_INPUT_WIDTH = 640;

function visible(point: Landmark | undefined, threshold = 0.35): point is Landmark {
  return !!point && point.visibility >= threshold;
}

function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const denominator = Math.hypot(bax, bay) * Math.hypot(bcx, bcy);
  if (!(denominator > 0)) return 0;
  const cosine = Math.min(1, Math.max(-1, (bax * bcx + bay * bcy) / denominator));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function trunkLean(landmarks: Landmark[]): number | null {
  const leftShoulder = landmarks[POSE.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE.LEFT_HIP];
  const rightHip = landmarks[POSE.RIGHT_HIP];
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((point) => visible(point))) {
    return null;
  }
  const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  return (Math.atan2(shoulderX - hipX, Math.abs(hipY - shoulderY)) * 180) / Math.PI;
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  pose: FramePose,
  status: LivePoseStatus,
) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const landmarks = pose.landmarks;
  if (!landmarks || !video.videoWidth || !video.videoHeight) return;

  const sourceAspect = video.videoWidth / video.videoHeight;
  const targetAspect = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;
  if (targetAspect > sourceAspect) {
    drawWidth = height * sourceAspect;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawHeight = width / sourceAspect;
    offsetY = (height - drawHeight) / 2;
  }
  const point = (landmark: Landmark) => ({
    x: offsetX + landmark.x * drawWidth,
    y: offsetY + landmark.y * drawHeight,
  });

  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 3 * ratio;
  context.strokeStyle = status.timingReady
    ? "rgba(52, 211, 153, 0.96)"
    : "rgba(96, 165, 250, 0.92)";
  for (const [aIndex, bIndex] of CONNECTIONS) {
    const a = landmarks[aIndex];
    const b = landmarks[bIndex];
    if (!visible(a) || !visible(b)) continue;
    const pointA = point(a);
    const pointB = point(b);
    context.beginPath();
    context.moveTo(pointA.x, pointA.y);
    context.lineTo(pointB.x, pointB.y);
    context.stroke();
  }

  for (const landmark of landmarks) {
    if (!visible(landmark, 0.45)) continue;
    const position = point(landmark);
    context.beginPath();
    context.arc(position.x, position.y, 3.8 * ratio, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 1.5 * ratio;
    context.strokeStyle = status.timingReady ? "#059669" : "#2563eb";
    context.stroke();
  }

  if (!status.mechanicsReady) return;

  const angleLabels: { value: number; at: Landmark; label: string }[] = [];
  const leftHip = landmarks[POSE.LEFT_HIP];
  const leftKnee = landmarks[POSE.LEFT_KNEE];
  const leftAnkle = landmarks[POSE.LEFT_ANKLE];
  const rightHip = landmarks[POSE.RIGHT_HIP];
  const rightKnee = landmarks[POSE.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE.RIGHT_ANKLE];
  if (visible(leftHip) && visible(leftKnee) && visible(leftAnkle)) {
    angleLabels.push({ value: jointAngle(leftHip, leftKnee, leftAnkle), at: leftKnee, label: "L" });
  }
  if (visible(rightHip) && visible(rightKnee) && visible(rightAnkle)) {
    angleLabels.push({
      value: jointAngle(rightHip, rightKnee, rightAnkle),
      at: rightKnee,
      label: "P",
    });
  }
  const lean = trunkLean(landmarks);
  if (lean != null && visible(leftHip)) {
    angleLabels.push({ value: lean, at: leftHip, label: "TUŁÓW" });
  }

  context.font = `600 ${10 * ratio}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const item of angleLabels) {
    const position = point(item.at);
    const text = `${item.label} ≈${Math.round(item.value)}°`;
    const metrics = context.measureText(text);
    const boxWidth = metrics.width + 12 * ratio;
    const boxHeight = 21 * ratio;
    context.fillStyle = "rgba(15, 23, 42, 0.82)";
    context.beginPath();
    context.roundRect(
      position.x - boxWidth / 2,
      position.y - boxHeight - 8 * ratio,
      boxWidth,
      boxHeight,
      8 * ratio,
    );
    context.fill();
    context.fillStyle = "#ffffff";
    context.fillText(text, position.x, position.y - boxHeight / 2 - 8 * ratio);
  }
}

function sameStatus(a: LivePoseStatus, b: LivePoseStatus): boolean {
  return (
    a.detected === b.detected &&
    a.singleAthlete === b.singleAthlete &&
    a.fullBody === b.fullBody &&
    a.timingReady === b.timingReady &&
    a.mechanicsReady === b.mechanicsReady &&
    Math.abs(a.confidence - b.confidence) < 0.02 &&
    Math.abs(a.silhouetteFraction - b.silhouetteFraction) < 0.01
  );
}

export function VisionLivePoseOverlay({ videoRef, active, onStatus }: VisionLivePoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (!active) return;
    const video: HTMLVideoElement | null = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Kamera nadal nagrywa w pełnej jakości, ale model dostaje mniejszą kopię klatki.
    // Współrzędne MediaPipe są znormalizowane, więc szkielet pozostaje zgodny z podglądem.
    const poseInput = document.createElement("canvas");
    const poseInputContext = poseInput.getContext("2d", { alpha: false });

    const runId = `live-pose-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let cancelled = false;
    let callbackId: number | null = null;
    let fallbackTimer: number | null = null;
    let frameIndex = 0;
    let inFlight = false;
    let lastAnalyzedTimestampMs = -Infinity;
    let lastStatus = EMPTY_LIVE_POSE_STATUS;

    const report = (status: LivePoseStatus) => {
      if (sameStatus(lastStatus, status)) return;
      lastStatus = status;
      onStatusRef.current(status);
    };

    const schedule = () => {
      if (cancelled) return;
      const media: HTMLVideoElement = video;
      if (typeof media.requestVideoFrameCallback === "function") {
        callbackId = media.requestVideoFrameCallback((now, metadata) => {
          callbackId = null;
          const timestampMs = Math.round(metadata.mediaTime * 1000);
          if (timestampMs - lastAnalyzedTimestampMs < 100) {
            schedule();
            return;
          }
          lastAnalyzedTimestampMs = timestampMs;
          void analyze(metadata.mediaTime, timestampMs || Math.round(now));
        });
        return;
      }
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        const timestampMs = Math.max(
          lastAnalyzedTimestampMs + 100,
          Math.round(media.currentTime * 1000),
          Math.round(performance.now()),
        );
        lastAnalyzedTimestampMs = timestampMs;
        void analyze(media.currentTime, timestampMs);
      }, 100);
    };

    const analyze = async (mediaTime: number, timestampMs: number) => {
      if (cancelled || inFlight || video.readyState < 2 || !video.videoWidth) {
        schedule();
        return;
      }
      inFlight = true;
      try {
        if (!poseInputContext) throw new Error("Brak kontekstu obrazu dla detektora pozy");
        const scale = Math.min(1, MAX_LIVE_INPUT_WIDTH / video.videoWidth);
        const inputWidth = Math.max(1, Math.round(video.videoWidth * scale));
        const inputHeight = Math.max(1, Math.round(video.videoHeight * scale));
        if (poseInput.width !== inputWidth) poseInput.width = inputWidth;
        if (poseInput.height !== inputHeight) poseInput.height = inputHeight;
        poseInputContext.drawImage(video, 0, 0, inputWidth, inputHeight);

        const pose = await detectPose(poseInput, frameIndex, mediaTime, {
          analysisRunId: runId,
          passType: "coarse",
          sourceTimestampMs: timestampMs,
          sourceTimestampUs: timestampMs * 1000,
          sourceFrameIndex: frameIndex,
        });
        if (cancelled) return;
        const status = getLivePoseStatus(pose);
        drawPose(canvas, video, pose, status);
        report(status);
        frameIndex += 1;
      } catch {
        if (!cancelled) {
          clearCanvas(canvas);
          report(EMPTY_LIVE_POSE_STATUS);
        }
      } finally {
        inFlight = false;
        schedule();
      }
    };

    schedule();
    return () => {
      cancelled = true;
      if (callbackId !== null && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(callbackId);
      }
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      clearCanvas(canvas);
      onStatusRef.current(EMPTY_LIVE_POSE_STATUS);
      void closePoseEngine(runId);
    };
  }, [active, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-hidden="true"
    />
  );
}
