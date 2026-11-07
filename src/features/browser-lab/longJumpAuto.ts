import { createJumpFrameDecoder, type OpenedVideo } from "./video";
import { paintVideoFrame } from "./videoFrame";
import { createPoseDetector, type DetectedPose } from "./poseWorkerClient";
import {
  automaticLongJumpSchema,
  findBallWiseCalibrationMarkers,
  closestLongJumpCandidate,
  type AutomaticLongJumpCalibration,
} from "./longJump";
import { orientStartMarker, takeoffEdgeFromMarkers } from "./markerGeometry";
export { takeoffEdgeFromMarkers } from "./markerGeometry";

export interface PoseFrame extends DetectedPose {
  frameIndex: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Selects two stable poses around the largest horizontal displacement. It is
 * deliberately conservative: ambiguous clips do not receive a guessed result. */
export function selectLongJumpWindow(input: readonly PoseFrame[]) {
  const frames = [...input].sort((a, b) => a.frameIndex - b.frameIndex);
  if (frames.length < 8)
    throw new Error("Nie widzę całej sylwetki przez wystarczająco długi czas.");
  const edge = Math.max(2, Math.floor(frames.length * 0.22));
  const startX = median(frames.slice(0, edge).map((frame) => frame.hip[0]));
  const endX = median(frames.slice(-edge).map((frame) => frame.hip[0]));
  const bodyHeight = median(frames.map((frame) => frame.bodyHeight));
  const displacement = endX - startX;
  if (Math.abs(displacement) < bodyHeight * 0.45)
    throw new Error("Nie wykryłem wyraźnego skoku w dal. Pokaż całą próbę z boku.");
  const direction = Math.sign(displacement);
  const distance = Math.abs(displacement);
  const progress = (frame: PoseFrame) => ((frame.hip[0] - startX) * direction) / distance;
  const footY = (frame: PoseFrame) =>
    Math.max(...frame.heels.map((p) => p[1]), ...frame.toes.map((p) => p[1]));
  const startFloor = median(frames.slice(0, edge).map(footY));
  const endFloor = median(frames.slice(-edge).map(footY));
  const before = frames.filter(
    (frame, index) =>
      index < frames.length * 0.6 &&
      progress(frame) <= 0.12 &&
      Math.abs(footY(frame) - startFloor) <= bodyHeight * 0.04,
  );
  if (!before.length) throw new Error("Nie widzę spokojnej pozycji przed odbiciem.");
  const start = before[before.length - 1];
  let end: PoseFrame | undefined;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (frame.frameIndex <= start.frameIndex || progress(frame) < 0.82) continue;
    const following = frames.slice(index, index + 3);
    if (following.length < 2) continue;
    const spread =
      Math.max(...following.map((item) => item.hip[0])) -
      Math.min(...following.map((item) => item.hip[0]));
    if (
      spread <= bodyHeight * 0.09 &&
      following.every((p) => Math.abs(footY(p) - endFloor) <= bodyHeight * 0.04)
    ) {
      end = frame;
      break;
    }
  }
  if (!end) throw new Error("Nie widzę stabilnego lądowania. Zatrzymaj pozycję po skoku.");
  const middle = frames.filter(
    (frame) => frame.frameIndex > start.frameIndex && frame.frameIndex < end!.frameIndex,
  );
  const airborne = (frame: PoseFrame) => {
    const fraction = Math.max(0, Math.min(1, progress(frame)));
    const ground = startFloor + (endFloor - startFloor) * fraction;
    return footY(frame) < ground - Math.max(0.006, bodyHeight * 0.025);
  };
  let flights = 0,
    wasAirborne = false;
  for (const frame of middle) {
    const flying = airborne(frame);
    if (flying && !wasAirborne) flights++;
    wasAirborne = flying;
  }
  if (flights !== 1)
    throw new Error(
      "Nie widzę jednej wyraźnej fazy lotu obu stóp. Sprawdź próbę ręcznie lub nagraj ponownie.",
    );
  return {
    start,
    end,
    confidence: Math.min(start.confidence, end.confidence),
  };
}

const nextPaint = async (
  video: OpenedVideo,
  frameIndex: number,
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  maxDimension: number,
  decoder: ReturnType<typeof createJumpFrameDecoder>,
) => {
  const frame = await decoder.decode(frameIndex, signal);
  try {
    return paintVideoFrame(canvas, frame, video.rotation, maxDimension);
  } finally {
    frame.close();
  }
};

export async function analyzeLongJump(
  video: OpenedVideo,
  signal: AbortSignal,
  onProgress: (value: number) => void,
): Promise<AutomaticLongJumpCalibration> {
  const last = video.timeline.frames.length - 2;
  const sampleCount = Math.min(28, Math.max(14, Math.round(video.timeline.durationSeconds * 3.5)));
  const indices = [
    ...new Set(
      Array.from({ length: sampleCount }, (_, index) =>
        Math.max(1, Math.min(last, Math.round(1 + ((last - 1) * index) / (sampleCount - 1)))),
      ),
    ),
  ];
  const canvas = document.createElement("canvas");
  const poses: PoseFrame[] = [];
  const detector = createPoseDetector(signal);
  const decoder = createJumpFrameDecoder(video, indices);
  try {
    for (let index = 0; index < indices.length; index++) {
      signal.throwIfAborted();
      const frameIndex = indices[index];
      await nextPaint(video, frameIndex, canvas, signal, 640, decoder);
      const pose = await detector.detect(canvas);
      if (pose) poses.push({ ...pose, frameIndex });
      onProgress(Math.round(((index + 1) / indices.length) * 72));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const selected = selectLongJumpWindow(poses);
    await nextPaint(video, selected.start.frameIndex, canvas, signal, 4096, decoder);
    const startMarkers = findBallWiseCalibrationMarkers(
      canvas
        .getContext("2d", { willReadFrequently: true })!
        .getImageData(0, 0, canvas.width, canvas.height),
    );
    if (!startMarkers)
      throw new Error(
        "Nie widzę obu wzorców: niebieskiego START i pomarańczowego 3 METRY. Pokaż je w całości.",
      );
    onProgress(84);
    await nextPaint(video, selected.end.frameIndex, canvas, signal, 4096, decoder);
    const landingMarkers = findBallWiseCalibrationMarkers(
      canvas
        .getContext("2d", { willReadFrequently: true })!
        .getImageData(0, 0, canvas.width, canvas.height),
    );
    if (!landingMarkers)
      throw new Error(
        "Jeden ze wzorców zniknął podczas lądowania. Ustaw szerszy kadr i nagraj ponownie.",
      );
    const reference = orientStartMarker(startMarkers.start.corners, startMarkers.range.corners);
    const landingReference = orientStartMarker(
      landingMarkers.start.corners,
      landingMarkers.range.corners,
    );
    const line = takeoffEdgeFromMarkers(reference, startMarkers.range.corners);
    const common = {
      method: "ballwise-marker-pose-v4" as const,
      referenceCorners: reference,
      rangeCorners: startMarkers.range.corners,
      landingReferenceCorners: landingReference,
      landingRangeCorners: landingMarkers.range.corners,
      referenceWidthCm: 20,
      referenceDepthCm: 24,
      baselineCm: 300,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      calibrationFrameIndex: selected.start.frameIndex,
      lineFrameIndex: selected.start.frameIndex,
      heelFrameIndex: selected.end.frameIndex,
      takeoffLine: line,
      poseConfidence: selected.confidence,
      markerQuality: Math.min(
        startMarkers.start.quality,
        startMarkers.range.quality,
        landingMarkers.start.quality,
        landingMarkers.range.quality,
      ),
      heelSource: "pose",
    };
    const result = closestLongJumpCandidate(
      selected.end.heels.map((heel) => automaticLongJumpSchema.parse({ ...common, heel })),
    );
    onProgress(100);
    return result;
  } finally {
    detector.dispose();
    decoder.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}
