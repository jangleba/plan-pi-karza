import { LAB_PROTOCOL_VERSION, MIN_ACCEPTED_CAPTURE_FPS, getLabTest } from "./definitions";
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

export class LabValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabValidationError";
  }
}

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new LabValidationError(`${label}: nieprawidłowa wartość.`);
}

function assertRange(value: number, min: number, max: number, message: string) {
  if (value < min || value > max) throw new LabValidationError(message);
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function frameDurationSeconds(frameDelta: number, fps: number) {
  finite(frameDelta, "Liczba klatek");
  finite(fps, "FPS");
  if (frameDelta <= 0) throw new LabValidationError("Drugi znacznik musi być po pierwszym.");
  if (fps < MIN_ACCEPTED_CAPTURE_FPS) {
    throw new LabValidationError("Nagranie nie ma wymaganego 240 FPS.");
  }
  return frameDelta / fps;
}

export function jumpHeightCmFromFlightTime(flightTimeSeconds: number) {
  finite(flightTimeSeconds, "Czas lotu");
  if (flightTimeSeconds <= 0) throw new LabValidationError("Czas lotu musi być dodatni.");
  return (GRAVITY_M_S2 * flightTimeSeconds * flightTimeSeconds * 100) / 8;
}

export function asymmetryPercent(left: number, right: number) {
  finite(left, "Wynik lewej strony");
  finite(right, "Wynik prawej strony");
  const denominator = Math.max(Math.abs(left), Math.abs(right));
  return denominator === 0 ? 0 : (Math.abs(left - right) / denominator) * 100;
}

export function ballPenaltyPercent(withBallSeconds: number, withoutBallSeconds: number) {
  finite(withBallSeconds, "Czas z piłką");
  finite(withoutBallSeconds, "Czas bez piłki");
  if (withBallSeconds <= 0 || withoutBallSeconds <= 0) {
    throw new LabValidationError("Czasy sprintu muszą być dodatnie.");
  }
  return ((withBallSeconds - withoutBallSeconds) / withoutBallSeconds) * 100;
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
    case "sprint_10m_ball":
      assertRange(elapsed, 1, 6, "Czas sprintu z piłką jest poza wiarygodnym zakresem.");
      break;
  }
}

export function calculateLabMetrics(options: {
  testId: LabTestId;
  firstFrame: number;
  secondFrame: number;
  fps: number;
  sprint10BaselineSeconds?: number | null;
}): { metrics: LabMetrics; quality: LabQuality } {
  const { testId, firstFrame, secondFrame, fps, sprint10BaselineSeconds } = options;
  const test = getLabTest(testId);
  const elapsedSeconds = frameDurationSeconds(secondFrame - firstFrame, fps);
  validateElapsed(testId, elapsedSeconds);

  let metrics: LabMetrics;
  if (test.category === "jump") {
    const jumpHeightCm = jumpHeightCmFromFlightTime(elapsedSeconds);
    assertRange(jumpHeightCm, 4.9, 122.6, "Wysokość skoku jest poza wiarygodnym zakresem.");
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

    if (testId === "flying_10m" && test.distanceMeters) {
      const averageSpeedMps = test.distanceMeters / elapsedSeconds;
      metrics.averageSpeedMps = averageSpeedMps;
      metrics.speedKmh = averageSpeedMps * 3.6;
    }

    if (testId === "sprint_10m_ball" && sprint10BaselineSeconds) {
      metrics.ballPenaltyPercent = ballPenaltyPercent(elapsedSeconds, sprint10BaselineSeconds);
    }
  }

  return {
    metrics,
    quality: {
      valid: true,
      reasons: [],
      fpsVerified: fps >= MIN_ACCEPTED_CAPTURE_FPS,
      frameResolutionMs: 1000 / fps,
      protocolVersion: LAB_PROTOCOL_VERSION,
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
          id: newId(),
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
  sprint10BaselineSeconds?: number | null;
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
    sprint10BaselineSeconds,
  } = options;
  if (!userId) throw new LabValidationError("Brak zalogowanego zawodnika.");
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
    fps: capture.fps,
    sprint10BaselineSeconds,
  });
  const test = getLabTest(attempt.testId);
  return {
    id: newId(),
    userId,
    batchId,
    testId: attempt.testId,
    side: attempt.side,
    trialNumber: attempt.trialNumber,
    recordedAt: new Date().toISOString(),
    fps: capture.fps,
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

export function summarizeResults(results: readonly LabResult[]): LabSummaryRow[] {
  const groups = new Map<string, LabResult[]>();
  for (const result of results.filter((item) => item.quality.valid)) {
    const key = `${result.testId}:${result.side ?? "both"}`;
    const current = groups.get(key) ?? [];
    current.push(result);
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const isTime = first.metrics.primaryUnit === "s";
    const values = group.map((item) => item.metrics.primaryValue);
    return {
      testId: first.testId,
      title: getLabTest(first.testId).title,
      side: first.side,
      bestValue: isTime ? Math.min(...values) : Math.max(...values),
      unit: first.metrics.primaryUnit,
      attempts: group.length,
    };
  });
}

export function bestSideAsymmetry(results: readonly LabResult[], testId: LabTestId) {
  const left = results
    .filter((item) => item.testId === testId && item.side === "left" && item.quality.valid)
    .map((item) => item.metrics.primaryValue);
  const right = results
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

export function latestSprint10Baseline(results: readonly LabResult[]) {
  const values = results
    .filter((item) => item.testId === "sprint_10m" && item.quality.valid)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 2)
    .map((item) => item.metrics.elapsedSeconds);
  return values.length ? Math.min(...values) : null;
}

export const FULL_PROFILE_TEST_IDS: readonly LabTestId[] = [
  "cmj",
  "single_leg_cmj",
  "sprint_10m",
  "flying_10m",
  "cod_505",
  "sprint_10m_ball",
] as const;

export function sideLabel(side: LabSide) {
  return side === "left" ? "lewa strona" : side === "right" ? "prawa strona" : null;
}
