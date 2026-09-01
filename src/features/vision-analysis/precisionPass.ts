import type {
  Calibration,
  FramePose,
  TestType,
  TimingLineRole,
  TimingLineSpec,
  VideoMetadata,
} from "./types";
import type { VideoTimeWindow } from "./videoFrameReader";
import { analyzeJumpField, detectFlightPhase } from "./analyzers/jumpDetection";
import { detectMotionWindow } from "./motionWindow";
import {
  frameSourceTimestampUs,
  projectGroundLineU,
  torsoReferencePixel,
} from "./calibratedLineCrossing";
import { hipYSeries, timeSeries } from "./poseSeries";

export const SPRINT_PRECISION_TESTS: ReadonlySet<TestType> = new Set([
  "sprint_20m",
  "sprint_30m",
  "flying_sprint",
]);

export const JUMP_PRECISION_TESTS: ReadonlySet<TestType> = new Set([
  "cmj",
  "squat_jump",
  "drop_jump",
  "repeated_jumps",
  "pogo_jumps",
  "broad_jump",
  "single_leg_hop",
]);

interface PrecisionWindowInput {
  testType: TestType;
  coarsePoses: FramePose[];
  metadata: VideoMetadata;
  calibration: Calibration | null;
}

/**
 * Wyznacza miejsca, które trzeba ponownie odczytać z dokładnością źródłowych
 * klatek. Przebieg coarse wskazuje wyłącznie okno; nie dostarcza czasu wyniku.
 */
export function buildPrecisionWindows(input: PrecisionWindowInput): VideoTimeWindow[] {
  if (SPRINT_PRECISION_TESTS.has(input.testType)) return sprintWindows(input);
  if (JUMP_PRECISION_TESTS.has(input.testType)) return jumpWindow(input);
  return [];
}

function sprintWindows(input: PrecisionWindowInput): VideoTimeWindow[] {
  const homography = input.calibration?.homography;
  const lines = input.calibration?.timingLines ?? [];
  if (!homography || lines.length === 0) return [];
  const roles: TimingLineRole[] =
    input.testType === "flying_sprint" ? ["TIMING_A", "TIMING_B"] : ["START", "FINISH"];
  const windows: VideoTimeWindow[] = [];
  for (const role of roles) {
    const line = lines.find((candidate) => candidate.role === role);
    if (!line) return [];
    const window = crossingWindow(input, line);
    if (!window) return [];
    windows.push(window);
  }
  return windows;
}

function crossingWindow(input: PrecisionWindowInput, line: TimingLineSpec): VideoTimeWindow | null {
  const homography = input.calibration?.homography;
  if (!homography) return null;
  const lineU = projectGroundLineU(homography, line, { min: 0, max: 3000 });
  if (!lineU) return null;
  let previous: { signed: number; timestampUs: number } | null = null;
  const ordered = [...input.coarsePoses].sort(
    (a, b) => (frameSourceTimestampUs(a) ?? 0) - (frameSourceTimestampUs(b) ?? 0),
  );
  for (const pose of ordered) {
    const timestampUs = frameSourceTimestampUs(pose);
    const torso = torsoReferencePixel(pose, input.metadata.width, input.metadata.height);
    if (timestampUs == null || !torso) continue;
    const projectedU = lineU(torso.v);
    if (!Number.isFinite(projectedU)) continue;
    const signed = torso.u - projectedU;
    if (previous && previous.signed < 0 !== signed < 0 && previous.signed !== signed) {
      const direction = signed > previous.signed ? "forward" : "backward";
      const wanted = line.direction ?? "forward";
      if (wanted === "any" || wanted === direction) {
        return {
          startSeconds: previous.timestampUs / 1_000_000 - 0.2,
          endSeconds: timestampUs / 1_000_000 + 0.2,
        };
      }
    }
    previous = { signed, timestampUs };
  }
  return null;
}

function jumpWindow(input: PrecisionWindowInput): VideoTimeWindow[] {
  if (["cmj", "squat_jump", "broad_jump", "single_leg_hop"].includes(input.testType)) {
    const singleFlight = detectFlightPhase(input.coarsePoses);
    if (singleFlight) {
      return [
        {
          startSeconds: singleFlight.takeoffTime - 1.5,
          endSeconds: singleFlight.landingTime + 1,
        },
      ];
    }
  }
  const field = analyzeJumpField(input.coarsePoses);
  if (field && field.segments.length > 0) {
    const first = Math.min(...field.segments.map((segment) => segment.takeoffTime));
    const last = Math.max(...field.segments.map((segment) => segment.landingTime));
    return [{ startSeconds: first - 0.6, endSeconds: last + 0.6 }];
  }

  // Gdy rzadki przebieg nie uchwycił progu stóp, nie zgadujemy zdarzeń.
  // Dogrywamy jednak całe realnie wykryte okno ruchu, aby drugi przebieg mógł
  // rozstrzygnąć krótki kontakt lub lot niewidoczny przy 20 FPS.
  const motion = detectMotionWindow(input.coarsePoses, input.metadata.durationSeconds);
  if (
    motion.activeSegments > 0 &&
    motion.startTimestampSeconds != null &&
    motion.endTimestampSeconds != null
  ) {
    return [
      {
        startSeconds: motion.startTimestampSeconds - 0.6,
        endSeconds: motion.endTimestampSeconds + 0.6,
      },
    ];
  }

  // Brak lotu w skanie 12 FPS NIE może wyłączyć dokładnej analizy. Krótki
  // CMJ potrafi znaleźć się pomiędzy próbkami coarse. Najpierw lokalizujemy
  // największą rzeczywistą zmianę bioder i analizujemy jej otoczenie. Jeżeli
  // nawet tego nie widać, dla krótkiego klipu analizujemy cały materiał.
  if (["cmj", "squat_jump", "broad_jump", "single_leg_hop"].includes(input.testType)) {
    const center = strongestVerticalMotionTime(input.coarsePoses);
    if (center != null) {
      return [{ startSeconds: center - 2, endSeconds: center + 2 }];
    }
    if (input.metadata.durationSeconds <= 8) {
      return [{ startSeconds: 0, endSeconds: input.metadata.durationSeconds }];
    }
    return [
      {
        startSeconds: input.metadata.durationSeconds - 8,
        endSeconds: input.metadata.durationSeconds,
      },
    ];
  }
  return [];
}

function strongestVerticalMotionTime(poses: FramePose[]): number | null {
  const hip = hipYSeries(poses);
  const time = timeSeries(poses);
  let bestIndex = -1;
  let bestSpeed = 0;
  for (let index = 1; index < poses.length; index++) {
    if (!Number.isFinite(hip[index - 1]) || !Number.isFinite(hip[index])) continue;
    const dt = time[index] - time[index - 1];
    if (!(dt > 0)) continue;
    const speed = Math.abs(hip[index] - hip[index - 1]) / dt;
    if (speed > bestSpeed) {
      bestSpeed = speed;
      bestIndex = index;
    }
  }
  return bestIndex >= 0 && bestSpeed >= 0.015 ? time[bestIndex] : null;
}

/** Łączy przebiegi po rzeczywistym timestampie; dokładna poza ma pierwszeństwo. */
export function mergePosePasses(coarse: FramePose[], precision: FramePose[]): FramePose[] {
  const byTimestamp = new Map<number, FramePose>();
  for (const pose of coarse) byTimestamp.set(timestampKey(pose), pose);
  for (const pose of precision) byTimestamp.set(timestampKey(pose), pose);
  return [...byTimestamp.values()]
    .sort((a, b) => timestampKey(a) - timestampKey(b))
    .map((pose, frameIndex) => ({ ...pose, frameIndex }));
}

/**
 * Skoki wymagają równomiernego, dokładnego przebiegu całego okna ruchu.
 * Sprint zachowuje również rzadki kontekst całego nagrania, bo pomiar czasu
 * i tak przechodzi przez lokalne bramki niepewności przy liniach.
 */
export function selectAnalysisPoses(
  testType: TestType,
  coarse: FramePose[],
  precision: FramePose[],
): FramePose[] {
  if (JUMP_PRECISION_TESTS.has(testType) && precision.length >= 6) {
    return mergePosePasses([], precision);
  }
  return mergePosePasses(coarse, precision);
}

export function selectRecognitionPoses(
  testType: TestType,
  coarse: FramePose[],
  precision: FramePose[],
): FramePose[] {
  if (JUMP_PRECISION_TESTS.has(testType) && precision.length >= 6) {
    return mergePosePasses([], precision);
  }
  return mergePosePasses(coarse, []);
}

function timestampKey(pose: FramePose): number {
  if (typeof pose.sourceTimestampUs === "number") return pose.sourceTimestampUs;
  if (typeof pose.sourceTimestampMs === "number") return Math.round(pose.sourceTimestampMs * 1000);
  return Math.round(pose.mediaTime * 1_000_000);
}
