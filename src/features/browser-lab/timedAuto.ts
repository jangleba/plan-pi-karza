import { createJumpFrameDecoder, type OpenedVideo } from "./video";
import { paintVideoFrame } from "./videoFrame";
import { createPoseDetector } from "./poseWorkerClient";
import {
  selectTimedEvents,
  type TimedPoseFrame,
  type TimedTestId,
  type TimedEventProposal,
} from "./timedEventDetection";
import type { TestSide } from "./protocols";

/** Coarse search, then original-rate frames around events; no inferred timestamps. */
export async function analyzeTimedVideo(
  video: OpenedVideo,
  test: TimedTestId,
  side: TestSide,
  line: number | undefined,
  signal: AbortSignal,
  onProgress: (n: number) => void,
): Promise<TimedEventProposal> {
  const count = Math.min(120, Math.max(20, Math.ceil(video.timeline.durationSeconds * 12)));
  const last = video.timeline.frames.length - 2;
  const indices = [
    ...new Set(
      Array.from({ length: count }, (_, i) =>
        Math.max(1, Math.round(1 + ((last - 1) * i) / (count - 1))),
      ),
    ),
  ];
  let decoder = createJumpFrameDecoder(video, indices);
  const detector = createPoseDetector(signal),
    canvas = document.createElement("canvas"),
    poses = new Map<number, TimedPoseFrame>();
  const started = performance.now();
  async function detect(index: number) {
    signal.throwIfAborted();
    if (performance.now() - started > 60000)
      throw new Error("Analiza trwa zbyt długo. Możesz oznaczyć zdarzenia ręcznie.");
    const frame = await decoder.decode(index, signal);
    try {
      paintVideoFrame(canvas, frame, video.rotation, 720);
    } finally {
      frame.close();
    }
    const p = await detector.detect(canvas);
    if (p) poses.set(index, { ...p, frameIndex: index });
  }
  try {
    for (let i = 0; i < indices.length; i++) {
      await detect(indices[i]);
      onProgress(Math.round(((i + 1) / indices.length) * 55));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const size = { width: canvas.width, height: canvas.height };
    const coarse = selectTimedEvents(test, video.timeline, [...poses.values()], side, line, size);
    const events = [coarse.start, coarse.end, ...(coarse.turn ? [coarse.turn] : [])];
    const fine = [
      ...new Set(
        events.flatMap((event) => {
          const seconds = video.timeline.frames[event].seconds;
          return video.timeline.frames.flatMap((frame, i) =>
            i >= 1 && i <= last && Math.abs(frame.seconds - seconds) <= 0.18 ? [i] : [],
          );
        }),
      ),
    ]
      .sort((a, b) => a - b)
      .filter((i) => !poses.has(i));
    if (fine.length > 330)
      throw new Error("Za dużo niejednoznacznych klatek. Oznacz zdarzenia ręcznie.");
    // Fine samples need their own plan so a GOP is reused at the original rate.
    // The coarse plan otherwise makes each neighbouring fine frame decode anew.
    decoder.dispose();
    decoder = createJumpFrameDecoder(video, fine);
    for (let i = 0; i < fine.length; i++) {
      await detect(fine[i]);
      onProgress(55 + Math.round(((i + 1) / fine.length) * 44));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const proposed = selectTimedEvents(test, video.timeline, [...poses.values()], side, line, size);
    for (const event of [proposed.start, proposed.end, ...(proposed.turn ? [proposed.turn] : [])]) {
      if (!poses.has(event - 1) || !poses.has(event))
        throw new Error("Nie widzę sąsiednich klatek zdarzenia. Sprawdź je ręcznie.");
    }
    onProgress(100);
    return proposed;
  } finally {
    detector.dispose();
    decoder.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}
