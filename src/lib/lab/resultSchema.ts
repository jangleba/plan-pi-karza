import { z } from "zod";
import { LAB_PROTOCOL_VERSION } from "./definitions";

const positive = z.number().finite().positive();
const index = z.number().int().nonnegative();
const timing = z
  .object({
    source: z.literal("sample_pts"),
    firstTimestampSeconds: z.number().finite().nonnegative(),
    secondTimestampSeconds: z.number().finite().nonnegative(),
    nominalFps: positive.min(239).max(1000),
    observedFps: positive.min(239 - 1e-6).max(1000),
    medianFrameDurationSeconds: positive,
    maxFrameGapSeconds: positive,
  })
  .passthrough();

// Preserve legacy metadata without recomputing historical measurements.
export const labResultSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    batchId: z.string().min(1),
    testId: z.enum([
      "cmj",
      "single_leg_cmj",
      "sprint_10m",
      "flying_10m",
      "cod_505",
      "sprint_10m_ball",
    ]),
    side: z.enum(["left", "right"]).nullable(),
    trialNumber: z.number().int().min(1).max(10),
    recordedAt: z.iso.datetime({ offset: true }),
    fps: positive.min(239 - 1e-6).max(1000),
    frameCount: z.number().int().min(2),
    firstFrame: index,
    secondFrame: index,
    trimStartFrame: index,
    trimEndFrame: index,
    firstGuidePosition: z.number().finite().min(0).max(1),
    secondGuidePosition: z.number().finite().min(0).max(1),
    guideAxis: z.enum(["horizontal", "vertical"]),
    metrics: z
      .object({
        primaryValue: positive,
        primaryUnit: z.enum(["cm", "s"]),
        elapsedSeconds: positive,
        jumpHeightCm: positive.optional(),
        flightTimeSeconds: positive.optional(),
        averageSpeedMps: positive.optional(),
        speedKmh: positive.optional(),
        distanceMeters: positive.optional(),
        asymmetryPercent: z.number().finite().min(0).max(100).optional(),
      })
      .passthrough(),
    quality: z
      .object({
        valid: z.boolean(),
        reasons: z.array(z.string()),
        fpsVerified: z.boolean(),
        frameResolutionMs: positive,
        protocolVersion: z.string(),
        timing: timing.optional(),
      })
      .passthrough(),
    synced: z.boolean(),
  })
  .passthrough()
  .superRefine((row, ctx) => {
    const jump = row.testId === "cmj" || row.testId === "single_leg_cmj";
    const bilateral = row.testId === "single_leg_cmj" || row.testId === "cod_505";
    if (
      row.trimStartFrame >= row.trimEndFrame ||
      row.trimEndFrame >= row.frameCount ||
      row.firstFrame < row.trimStartFrame ||
      row.secondFrame > row.trimEndFrame ||
      row.secondFrame <= row.firstFrame ||
      bilateral !== (row.side !== null) ||
      row.metrics.primaryUnit !== (jump ? "cm" : "s") ||
      row.guideAxis !== (jump ? "horizontal" : "vertical")
    ) {
      ctx.addIssue({ code: "custom", message: "Nieprawidłowe dane wyniku LAB." });
    }
    if (row.quality.protocolVersion === LAB_PROTOCOL_VERSION) {
      const t = row.quality.timing;
      const elapsed = t ? t.secondTimestampSeconds - t.firstTimestampSeconds : NaN;
      const expected = jump ? (9.80665 * elapsed ** 2 * 100) / 8 : elapsed;
      if (
        !t ||
        elapsed <= 0 ||
        !Number.isFinite(expected) ||
        Math.abs(elapsed - row.metrics.elapsedSeconds) > 1e-9 ||
        Math.abs(expected - row.metrics.primaryValue) > 1e-8 ||
        t.maxFrameGapSeconds > t.medianFrameDurationSeconds * 1.5 + 1e-9
      ) {
        ctx.addIssue({ code: "custom", message: "Wynik nie odpowiada czasom klatek." });
      }
    }
  });
