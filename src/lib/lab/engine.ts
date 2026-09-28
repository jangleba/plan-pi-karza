import {
  LAB_PROTOCOL_VERSION,
  MIN_ACCEPTED_CAPTURE_FPS,
  getLabTest,
  isActiveLabTestId,
} from "./definitions";
import { assertFrameIndex, finite, LabValidationError, validateCaptureTiming } from "./timing";
import { newLabId } from "./id";
export { LabValidationError } from "./timing";
import type {
  LabAttempt,
  LabMetrics,
  LabQuality,
  LabResult,
  LabSide,
  LabSummaryRow,
  LabTestId,
  NativeVideoCapture,
} from "./types";

const GRAVITY_M_S2 = 9.80665;

function assertRange(value: number, min: number, max: number, message: string) {
  finite(value, "Pomiar");
  if (value < min - 1e-9 || value > max + 1e-9) throw new LabValidationError(message);
}

export function jumpHeightCmFromFlightTime(flightTimeSeconds: number) {
  finite(flightTimeSeconds, "Czas lotu");
  if (flightTimeSeconds <= 0) throw new LabValidationError("Czas lotu musi być dodatni.");
  const height = (GRAVITY_M_S2 * flightTimeSeconds * flightTimeSeconds * 100) / 8;
  finite(height, "Wysokość skoku");
  return height;
}

export function asymmetryPercent(left: number, right: number) {
  finite(left, "Wynik lewej strony");
  finite(right, "Wynik prawej strony");
  if (left <= 0 || right <= 0) throw new LabValidationError("Wyniki stron muszą być dodatnie.");
  const denominator = Math.max(Math.abs(left), Math.abs(right));
  return (Math.abs(left - right) / denominator) * 100;
}

function validateElapsed(testId: LabTestId, elapsed: number) {
  switch (testId) {
    case "cmj":
      assertRange(
        elapsed,
        0.2,
        1,
        "Czas lotu jest poza zakresem CMJ. Sprawdź klatki odbicia i lądowania.",
      );
      break;
    case "single_leg_cmj":
      assertRange(
        elapsed,
        0.15,
        0.9,
        "Czas lotu jest poza zakresem skoku jednonóż. Sprawdź zaznaczenia.",
      );
      break;
    case "sprint_10m":
      assertRange(
        elapsed,
        1,
        5,
        "Czas sprintu 10 m jest poza wiarygodnym zakresem. Sprawdź start i metę.",
      );
      break;
    case "flying_10m":
      assertRange(
        elapsed,
        0.7,
        3,
        "Czas Flying 10 m jest poza wiarygodnym zakresem. Sprawdź obie linie.",
      );
      break;
    case "cod_505":
      assertRange(
        elapsed,
        1,
        6,
        "Czas 505 jest poza wiarygodnym zakresem. Sprawdź oba przecięcia linii.",
      );
      break;
  }
}

export function calculateLabMetrics(options: {
  testId: LabTestId;
  firstFrame: number;
  secondFrame: number;
  capture: NativeVideoCapture;
}): { metrics: LabMetrics; quality: LabQuality } {
  const { testId, firstFrame, secondFrame, capture } = options;
  const test = getLabTest(testId);
  const timing = validateCaptureTiming(capture);
  assertFrameIndex(firstFrame, capture.frameCount);
  assertFrameIndex(secondFrame, capture.frameCount);
  if (secondFrame <= firstFrame)
    throw new LabValidationError("Drugi znacznik musi być po pierwszym.");
  const firstTimestampSeconds = capture.frameTimestampsSeconds[firstFrame];
  const secondTimestampSeconds = capture.frameTimestampsSeconds[secondFrame];
  const elapsedSeconds = secondTimestampSeconds - firstTimestampSeconds;
  validateElapsed(testId, elapsedSeconds);

  let metrics: LabMetrics;
  if (test.category === "jump") {
    const jumpHeightCm = jumpHeightCmFromFlightTime(elapsedSeconds);
    metrics = {
      primaryValue: jumpHeightCm,
      primaryUnit: "cm",
      elapsedSeconds,
      flightTimeSeconds: elapsedSeconds,
      jumpHeightCm,
    };
  } else {
    metrics = {
      primaryValue: elapsedSeconds,
      primaryUnit: "s",
      elapsedSeconds,
    };

    if ((testId === "flying_10m" || testId === "sprint_10m") && test.distanceMeters) {
      metrics.distanceMeters = test.distanceMeters;
      const averageSpeedMps = test.distanceMeters / elapsedSeconds;
      metrics.averageSpeedMps = averageSpeedMps;
      metrics.speedKmh = averageSpeedMps * 3.6;
    }
  }

  return {
    metrics,
    quality: {
      valid: true,
      reasons: [],
      fpsVerified: true,
      frameResolutionMs: timing.medianFrameDurationSeconds * 1000,
      protocolVersion: LAB_PROTOCOL_VERSION,
      timing: {
        source: "sample_pts",
        firstTimestampSeconds,
        secondTimestampSeconds,
        nominalFps: capture.nominalFps,
        ...timing,
      },
    },
  };
}

export function createAttemptPlan(testIds: readonly LabTestId[]): LabAttempt[] {
  const rows: Omit<LabAttempt, "sequenceNumber" | "sequenceLength">[] = [];
  for (const testId of testIds) {
    const test = getLabTest(testId);
    for (const side of test.sides) {
      for (let trialNumber = 1; trialNumber <= test.trialsPerSide; trialNumber += 1) {
        rows.push({
          id: newLabId(),
          testId,
          side,
          trialNumber,
          trialsForSide: test.trialsPerSide,
        });
      }
    }
  }
  return rows.map((row, index) => ({
    ...row,
    sequenceNumber: index + 1,
    sequenceLength: rows.length,
  }));
}

export function createLabResult(options: {
  id?: string;
  userId: string;
  batchId: string;
  attempt: LabAttempt;
  capture: NativeVideoCapture;
  firstFrame: number;
  secondFrame: number;
  trimStartFrame: number;
  trimEndFrame: number;
  firstGuidePosition: number;
  secondGuidePosition: number;
}): LabResult {
  const {
    userId,
    batchId,
    attempt,
    capture,
    firstFrame,
    secondFrame,
    trimStartFrame,
    trimEndFrame,
    firstGuidePosition,
    secondGuidePosition,
  } = options;
  if (!userId) throw new LabValidationError("Brak zalogowanego zawodnika.");
  if (!batchId) throw new LabValidationError("Brak identyfikatora profilu.");
  const test = getLabTest(attempt.testId);
  if (
    !test.sides.includes(attempt.side) ||
    !Number.isSafeInteger(attempt.trialNumber) ||
    attempt.trialNumber < 1 ||
    attempt.trialNumber > 10
  ) {
    throw new LabValidationError("Nieprawidłowa strona lub numer próby.");
  }
  [firstFrame, secondFrame, trimStartFrame, trimEndFrame].forEach((frame) =>
    assertFrameIndex(frame, capture.frameCount),
  );
  finite(firstGuidePosition, "Pozycja pierwszej linii");
  finite(secondGuidePosition, "Pozycja drugiej linii");
  if (firstFrame < trimStartFrame || secondFrame > trimEndFrame) {
    throw new LabValidationError("Znaczniki muszą znajdować się w wybranym fragmencie filmu.");
  }
  if (trimStartFrame < 0 || trimEndFrame >= capture.frameCount || trimStartFrame >= trimEndFrame) {
    throw new LabValidationError("Nieprawidłowy zakres przycięcia filmu.");
  }
  const { metrics, quality } = calculateLabMetrics({
    testId: attempt.testId,
    firstFrame,
    secondFrame,
    capture,
  });
  return {
    id: options.id ?? newLabId(),
    userId,
    batchId,
    testId: attempt.testId,
    side: attempt.side,
    trialNumber: attempt.trialNumber,
    recordedAt: new Date().toISOString(),
    fps: Math.max(MIN_ACCEPTED_CAPTURE_FPS, quality.timing!.observedFps),
    frameCount: capture.frameCount,
    firstFrame,
    secondFrame,
    trimStartFrame,
    trimEndFrame,
    firstGuidePosition: Math.min(1, Math.max(0, firstGuidePosition)),
    secondGuidePosition: Math.min(1, Math.max(0, secondGuidePosition)),
    guideAxis: test.guideAxis,
    metrics,
    quality,
    synced: false,
  };
}

export function isVisibleLabResult(result: LabResult): result is LabResult & { testId: LabTestId } {
  return (
    isActiveLabTestId(result.testId) &&
    result.quality.valid &&
    Number.isFinite(result.metrics.primaryValue) &&
    result.metrics.primaryValue > 0 &&
    Number.isFinite(result.metrics.elapsedSeconds) &&
    result.metrics.elapsedSeconds > 0
  );
}

export function summarizeResults(results: readonly LabResult[], batchId: string): LabSummaryRow[] {
  const groups = new Map<string, (LabResult & { testId: LabTestId })[]>();
  for (const result of results
    .filter(isVisibleLabResult)
    .filter((item) => item.batchId === batchId)) {
    const key = `${result.testId}:${result.side ?? "both"}`;
    const current = groups.get(key) ?? [];
    current.push(result);
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const isTime = first.metrics.primaryUnit === "s";
    const best = group.reduce((winner, item) =>
      (
        isTime
          ? item.metrics.primaryValue < winner.metrics.primaryValue
          : item.metrics.primaryValue > winner.metrics.primaryValue
      )
        ? item
        : winner,
    );
    return {
      testId: first.testId,
      title: getLabTest(first.testId).title,
      side: first.side,
      bestValue: best.metrics.primaryValue,
      unit: first.metrics.primaryUnit,
      attempts: group.length,
      metrics: best.metrics,
    };
  });
}

export function bestSideAsymmetry(
  results: readonly LabResult[],
  testId: LabTestId,
  batchId: string,
) {
  const current = results.filter(isVisibleLabResult).filter((item) => item.batchId === batchId);
  const left = current
    .filter((item) => item.testId === testId && item.side === "left" && item.quality.valid)
    .map((item) => item.metrics.primaryValue);
  const right = current
    .filter((item) => item.testId === testId && item.side === "right" && item.quality.valid)
    .map((item) => item.metrics.primaryValue);
  if (!left.length || !right.length) return null;
  const timeTest = getLabTest(testId).category === "change";
  const bestLeft = timeTest ? Math.min(...left) : Math.max(...left);
  const bestRight = timeTest ? Math.min(...right) : Math.max(...right);
  return {
    left: bestLeft,
    right: bestRight,
    asymmetryPercent: asymmetryPercent(bestLeft, bestRight),
  };
}

export const FULL_PROFILE_TEST_IDS: readonly LabTestId[] = [
  "cmj",
  "single_leg_cmj",
  "sprint_10m",
  "flying_10m",
  "cod_505",
] as const;

export function sideLabel(side: LabSide) {
  return side === "left" ? "lewa strona" : side === "right" ? "prawa strona" : null;
}
