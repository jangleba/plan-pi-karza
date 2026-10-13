import { z } from "zod";
import {
  GRAVITY,
  MIN_VIDEO_FPS,
  MAX_VIDEO_FPS,
  MAX_EVENT_FRAME_GAP,
  validateEventGaps,
  type JumpTimeline,
} from "./measurement";
import {
  BROWSER_LAB_PROTOCOL,
  TEST_IDS,
  protocolFor,
  type BrowserAttempt,
  type StoredTestId,
  CALIBRATED_LAB_PROTOCOL,
} from "./protocols";

import { longJumpSchema, longJumpMeasurement, type LongJumpCalibration } from "./longJump";

const time = z.number().finite().min(0).max(21);
const resultSchema = z.object({
  version: z.enum([BROWSER_LAB_PROTOCOL, CALIBRATED_LAB_PROTOCOL]),
  id: z.string().min(8).max(100),
  sessionId: z.string().min(8).max(100),
  testId: z.enum([...TEST_IDS, "flying_10m"]),
  side: z.enum(["left", "right"]).nullable(),
  trial: z.number().int().min(1).max(3),
  recordedAt: z.iso.datetime(),
  notes: z.string().max(280),
  sourceName: z.string().min(1).max(255),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceBytes: z
    .number()
    .int()
    .positive()
    .max(128 * 1024 * 1024),
  codec: z.string().min(4).max(80),
  fps: z.number().finite().min(MIN_VIDEO_FPS).max(MAX_VIDEO_FPS),
  frameCount: z.number().int().min(3).max(6500),
  startFrameIndex: z.number().int().min(1),
  endFrameIndex: z.number().int().min(2),
  startSeconds: time,
  startPreviousSeconds: time,
  endSeconds: time,
  endPreviousSeconds: time,
  elapsedSeconds: z.number().finite().positive().max(15),
  primaryValue: z.number().finite().positive(),
  primaryUnit: z.enum(["cm", "s"]),
  resolutionMin: z.number().finite().min(0).optional(),
  resolutionMax: z.number().finite().positive().optional(),
  averageSpeedMps: z.number().finite().positive().optional(),
  guidePositions: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  spatial: longJumpSchema.optional(),
  turnFrameIndex: z.number().int().min(2).optional(),
  turnSeconds: time.optional(),
  originalConfirmed: z.literal(true),
  protocolConfirmed: z.literal(true),
});
export type BrowserResult = z.infer<typeof resultSchema>;

function eventTimes(testId: StoredTestId, timeline: JumpTimeline, start: number, end: number) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end <= start ||
    end >= timeline.frames.length
  )
    throw new Error(
      "Zaznacz początek i późniejszy koniec. Przed każdym zdarzeniem musi być widoczna poprzednia klatka.",
    );
  const startSeconds = timeline.frames[start].seconds;
  const endSeconds = timeline.frames[end].seconds;
  const startPreviousSeconds = timeline.frames[start - 1].seconds;
  const endPreviousSeconds = timeline.frames[end - 1].seconds;
  const elapsedSeconds = endSeconds - startSeconds;
  validateEventGaps(timeline, start, end);
  const protocol = protocolFor(testId);
  if (elapsedSeconds < protocol.minimumSeconds || elapsedSeconds > protocol.maximumSeconds)
    throw new Error(
      "Czas jest nietypowy dla tego testu. Sprawdź oznaczone zdarzenia oraz oryginalność filmu.",
    );
  return { startSeconds, endSeconds, startPreviousSeconds, endPreviousSeconds, elapsedSeconds };
}

export function timedMeasurement(
  testId: StoredTestId,
  timeline: JumpTimeline,
  start: number,
  end: number,
) {
  if (testId === "standing_long_jump")
    throw new Error("Skok w dal wymaga kalibracji odległości, nie wzoru z czasu lotu.");
  const times = eventTimes(testId, timeline, start, end);
  const protocol = protocolFor(testId);
  const toValue = (t: number) => (protocol.category === "jump" ? (GRAVITY * t * t * 100) / 8 : t);
  return {
    ...times,
    primaryValue: toValue(times.elapsedSeconds),
    primaryUnit: protocol.category === "jump" ? ("cm" as const) : ("s" as const),
    resolutionMin: toValue(Math.max(0, times.endPreviousSeconds - times.startSeconds)),
    resolutionMax: toValue(times.endSeconds - times.startPreviousSeconds),
    ...(testId === "flying_10m" ? { averageSpeedMps: 10 / times.elapsedSeconds } : {}),
  };
}

const closeTo = (a: number, b: number) => Math.abs(a - b) < 1e-7;
export function validatedResult(input: unknown): BrowserResult {
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) throw new Error("Dane pomiaru są niekompletne albo uszkodzone.");
  const result = parsed.data;
  const protocol = protocolFor(result.testId);
  const elapsed = result.endSeconds - result.startSeconds;
  const value = (t: number) => (protocol.category === "jump" ? (GRAVITY * t * t * 100) / 8 : t);
  if (
    !protocol.sides.includes(result.side) ||
    result.trial > protocol.trials ||
    result.endFrameIndex <= result.startFrameIndex ||
    result.endFrameIndex >= result.frameCount ||
    result.startPreviousSeconds >= result.startSeconds ||
    result.endPreviousSeconds >= result.endSeconds ||
    elapsed < protocol.minimumSeconds ||
    elapsed > protocol.maximumSeconds ||
    !closeTo(elapsed, result.elapsedSeconds) ||
    (result.testId !== "standing_long_jump" && !closeTo(value(elapsed), result.primaryValue)) ||
    result.primaryUnit !== (protocol.category === "jump" ? "cm" : "s") ||
    (result.testId !== "standing_long_jump" &&
      (result.resolutionMin === undefined ||
        result.resolutionMax === undefined ||
        !closeTo(
          value(Math.max(0, result.endPreviousSeconds - result.startSeconds)),
          result.resolutionMin,
        ) ||
        !closeTo(value(result.endSeconds - result.startPreviousSeconds), result.resolutionMax))) ||
    (result.testId === "flying_10m"
      ? result.averageSpeedMps === undefined || !closeTo(result.averageSpeedMps, 10 / elapsed)
      : result.averageSpeedMps !== undefined)
  )
    throw new Error("Wartości pomiaru nie zgadzają się z czasem klatek lub protokołem.");
  if (result.testId === "standing_long_jump") {
    if (
      result.version !== CALIBRATED_LAB_PROTOCOL ||
      !result.spatial ||
      result.resolutionMin !== undefined ||
      result.resolutionMax !== undefined ||
      result.spatial.calibrationFrameIndex >= result.frameCount ||
      result.spatial.lineFrameIndex !== result.startFrameIndex ||
      result.spatial.heelFrameIndex !== result.endFrameIndex ||
      !closeTo(longJumpMeasurement(result.spatial).primaryValue, result.primaryValue)
    )
      throw new Error("Odległość nie zgadza się z kalibracją i punktami podłoża.");
  } else if (result.spatial !== undefined)
    throw new Error("Kalibracja podłoża należy wyłącznie do skoku w dal.");
  if (result.testId === "cod_505" && result.version === CALIBRATED_LAB_PROTOCOL) {
    if (
      result.turnFrameIndex === undefined ||
      result.turnSeconds === undefined ||
      result.turnFrameIndex <= result.startFrameIndex ||
      result.turnFrameIndex >= result.endFrameIndex ||
      result.turnSeconds <= result.startSeconds ||
      result.turnSeconds >= result.endSeconds ||
      (result.startFrameIndex + 1 === result.turnFrameIndex &&
        result.turnSeconds <= result.startSeconds)
    )
      throw new Error("Oznacz kontakt nogi stawnej na linii nawrotu pomiędzy wejściem a powrotem.");
  } else if (result.turnFrameIndex !== undefined || result.turnSeconds !== undefined)
    throw new Error("Nawrót należy do protokołu 505.");
  const startGap = result.startSeconds - result.startPreviousSeconds;
  const endGap = result.endSeconds - result.endPreviousSeconds;
  if (startGap > MAX_EVENT_FRAME_GAP || endGap > MAX_EVENT_FRAME_GAP)
    throw new Error("Odstęp klatek pomiaru jest nieprawidłowy.");
  return result;
}

export function createBrowserResult(data: {
  attempt: BrowserAttempt;
  sessionId: string;
  timeline: JumpTimeline;
  start: number;
  end: number;
  sourceName: string;
  sourceHash: string;
  sourceBytes: number;
  codec: string;
  guidePositions: [number, number];
  notes: string;
  spatial?: LongJumpCalibration;
  turnFrameIndex?: number;
}): BrowserResult {
  return validatedResult({
    version:
      data.attempt.testId === "standing_long_jump" || data.attempt.testId === "cod_505"
        ? CALIBRATED_LAB_PROTOCOL
        : BROWSER_LAB_PROTOCOL,
    id: crypto.randomUUID(),
    sessionId: data.sessionId,
    testId: data.attempt.testId,
    side: data.attempt.side,
    trial: data.attempt.trial,
    recordedAt: new Date().toISOString(),
    notes: data.notes.trim().slice(0, 280),
    sourceName: data.sourceName.slice(0, 255),
    sourceHash: data.sourceHash,
    sourceBytes: data.sourceBytes,
    codec: data.codec,
    fps: data.timeline.fps,
    frameCount: data.timeline.frames.length,
    startFrameIndex: data.start,
    endFrameIndex: data.end,
    guidePositions: data.guidePositions,
    originalConfirmed: true,
    protocolConfirmed: true,
    ...(data.attempt.testId === "standing_long_jump"
      ? {
          ...eventTimes(data.attempt.testId, data.timeline, data.start, data.end),
          ...longJumpMeasurement(data.spatial),
          spatial: data.spatial,
        }
      : timedMeasurement(data.attempt.testId, data.timeline, data.start, data.end)),
    ...(data.attempt.testId === "cod_505" && data.turnFrameIndex !== undefined
      ? {
          turnFrameIndex: data.turnFrameIndex,
          turnSeconds: data.timeline.frames[data.turnFrameIndex]?.seconds,
        }
      : {}),
  });
}

export function sameTrial(a: BrowserResult, b: BrowserResult) {
  return (
    a.sourceHash === b.sourceHash &&
    a.startFrameIndex === b.startFrameIndex &&
    a.endFrameIndex === b.endFrameIndex &&
    a.testId === b.testId &&
    a.side === b.side
  );
}
export function resultValue(value: number, unit: "cm" | "s") {
  return (
    value.toLocaleString("pl-PL", {
      minimumFractionDigits: unit === "cm" ? 1 : 3,
      maximumFractionDigits: unit === "cm" ? 1 : 3,
    }) +
    " " +
    unit
  );
}
export function resultGroups(results: readonly BrowserResult[]) {
  const grouped = new Map<string, BrowserResult[]>();
  for (const result of results) {
    const key = `${result.sessionId}:${result.testId}:${result.side ?? "both"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }
  return [...grouped.values()]
    .map((rows) => {
      const protocol = protocolFor(rows[0].testId);
      const sorted = [...rows].sort((a, b) =>
        protocol.category === "jump"
          ? b.primaryValue - a.primaryValue
          : a.primaryValue - b.primaryValue,
      );
      const expected = protocol.trials;
      return {
        key: `${rows[0].sessionId}:${rows[0].testId}:${rows[0].side}`,
        rows,
        best: sorted[0],
        average: rows.reduce((s, r) => s + r.primaryValue, 0) / rows.length,
        complete: rows.length === expected && new Set(rows.map((r) => r.trial)).size === expected,
        expected,
      };
    })
    .sort((a, b) => b.best.recordedAt.localeCompare(a.best.recordedAt));
}

export function comparison(a: BrowserResult, b: BrowserResult) {
  if (a.testId !== b.testId || a.side !== b.side || a.version !== b.version)
    throw new Error("Porównuj ten sam test, tę samą nogę i ten sam protokół.");
  const [older, newer] = a.recordedAt <= b.recordedAt ? [a, b] : [b, a];
  return {
    older,
    newer,
    difference: newer.primaryValue - older.primaryValue,
    percent: ((newer.primaryValue - older.primaryValue) / older.primaryValue) * 100,
    overlaps:
      newer.resolutionMin === undefined ||
      older.resolutionMin === undefined ||
      newer.resolutionMax === undefined ||
      older.resolutionMax === undefined
        ? null
        : newer.resolutionMin <= older.resolutionMax && older.resolutionMin <= newer.resolutionMax,
  };
}

export function sideDifference(
  results: readonly BrowserResult[],
  sessionId: string,
  testId: StoredTestId,
) {
  const groups = resultGroups(results).filter(
    (g) => g.best.sessionId === sessionId && g.best.testId === testId && g.complete,
  );
  const left = groups.find((g) => g.best.side === "left");
  const right = groups.find((g) => g.best.side === "right");
  if (!left || !right) return null;
  return {
    left: left.best.primaryValue,
    right: right.best.primaryValue,
    percent:
      (Math.abs(left.best.primaryValue - right.best.primaryValue) /
        Math.max(left.best.primaryValue, right.best.primaryValue)) *
      100,
  };
}
