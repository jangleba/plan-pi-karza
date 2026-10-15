import { decodeJumpFrame, type OpenedVideo } from "./video";
import { paintVideoFrame } from "./videoFrame";
import { detectPose, type DetectedPose } from "./pose";
import {
  automaticLongJumpSchema,
  findBallWiseCalibrationMarkers,
  longJumpMeasurement,
  type AutomaticLongJumpCalibration,
  type FloorPoint,
} from "./longJump";

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
  const before = frames.filter(
    (frame, index) => index < frames.length * 0.6 && progress(frame) <= 0.12,
  );
  if (!before.length) throw new Error("Nie widzę spokojnej pozycji przed odbiciem.");
  const start = before[before.length - 1];
  const ground = median(frames.slice(0, edge).flatMap(f=>f.toes.map(p=>p[1])));
  const airborne = frames.filter(f=>f.frameIndex > start.frameIndex && progress(f)>0.12 && progress(f)<0.95 &&
    Math.max(...f.toes.map(p=>p[1])) < ground-bodyHeight*0.06 && f.hip[1] < start.hip[1]-bodyHeight*0.03);
  if (!airborne.length) throw new Error("Nie widzę fazy lotu. Zaznacz zdarzenia ręcznie.");
  const lastAirborne = airborne[airborne.length-1].frameIndex;
  let end: PoseFrame | undefined;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (frame.frameIndex <= lastAirborne || progress(frame) < 0.82) continue;
    const following = frames.slice(index, index + 3);
    if (following.length < 2) continue;
    const spread =
      Math.max(...following.map((item) => item.hip[0])) -
      Math.min(...following.map((item) => item.hip[0]));
    if (spread <= bodyHeight * 0.09 && Math.abs(Math.max(...frame.heels.map(p=>p[1]))-ground) <= bodyHeight*0.12) {
      end = frame;
      break;
    }
  }
  if (!end) throw new Error("Nie widzę stabilnego lądowania. Zatrzymaj pozycję po skoku.");
  return {
    start,
    end,
    confidence: Math.min(start.confidence, end.confidence),
  };
}

function pointLineDistance(point: FloorPoint, a: FloorPoint, b: FloorPoint) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return Math.abs((b[0] - a[0]) * (a[1] - point[1]) - (a[0] - point[0]) * (b[1] - a[1])) / length;
}

function takeoffEdge(
  corners: AutomaticLongJumpCalibration["referenceCorners"],
  toes: [FloorPoint, FloorPoint],
): [FloorPoint, FloorPoint] {
  const edges: [FloorPoint, FloorPoint][] = [
    [corners[0], corners[1]],
    [corners[2], corners[3]],
  ];
  return edges.sort(
    ([a1, b1], [a2, b2]) =>
      Math.min(...toes.map((point) => pointLineDistance(point, a1, b1))) -
      Math.min(...toes.map((point) => pointLineDistance(point, a2, b2))),
  )[0];
}

const nextPaint = async (
  video: OpenedVideo,
  frameIndex: number,
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  maxDimension: number,
) => {
  const frame = await decodeJumpFrame(video, frameIndex, signal);
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
  for (let index = 0; index < indices.length; index++) {
    signal.throwIfAborted();
    const frameIndex = indices[index];
    await nextPaint(video, frameIndex, canvas, signal, 640);
    const pose = await detectPose(canvas);
    if (pose) poses.push({ ...pose, frameIndex });
    onProgress(Math.round(((index + 1) / indices.length) * 72));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const selected = selectLongJumpWindow(poses);
  await nextPaint(video, selected.start.frameIndex, canvas, signal, 1280);
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
  await nextPaint(video, selected.end.frameIndex, canvas, signal, 1280);
  const landingMarkers = findBallWiseCalibrationMarkers(
    canvas
      .getContext("2d", { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height),
  );
  if (!landingMarkers)
    throw new Error(
      "Jeden ze wzorców zniknął podczas lądowania. Ustaw szerszy kadr i nagraj ponownie.",
    );
  const line = takeoffEdge(startMarkers.start.corners, selected.start.toes);
  const common = {
    method: "ballwise-marker-pose-v2" as const,
    referenceCorners: startMarkers.start.corners,
    rangeCorners: startMarkers.range.corners,
    landingReferenceCorners: landingMarkers.start.corners,
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
  const candidates = selected.end.heels
    .map((heel) => automaticLongJumpSchema.parse({ ...common, heel }))
    .map((calibration) => {
      try {
        return { calibration, measurement: longJumpMeasurement(calibration) };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => left.measurement.primaryValue - right.measurement.primaryValue);
  const result = candidates[0]?.calibration;
  if (!result)
    throw new Error(
      "Automatyczny punkt pięty nie daje wiarygodnego wyniku. Popraw kadr i nagraj próbę ponownie.",
    );
  onProgress(100);
  return result;
}
