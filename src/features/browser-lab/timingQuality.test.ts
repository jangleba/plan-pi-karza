import { describe, expect, it } from "vitest";
import { buildJumpTimeline } from "./measurement";
import { attemptPlan } from "./protocols";
import { comparison, createBrowserResult, timedMeasurement, validatedResult } from "./results";
import { backupResults, createHistoryBackup } from "./storage";
import {
  REVIEWED_TIMING_PROTOCOL,
  resultRecordingQuality,
  timingRecordingQuality,
} from "./timingQuality";
import { selectTimedEvents, type TimedPoseFrame } from "./timedEventDetection";

const timeline = (fps = 240, omit: number[] = []) =>
  buildJumpTimeline(
    Array.from({ length: fps * 4 }, (_, cts) => ({ cts, duration: 1, timescale: fps })).filter(
      (p) => !omit.includes(p.cts),
    ),
  );
const result = (fps = 240, testId: "sprint_10m" | "cod_505" = "sprint_10m") =>
  createBrowserResult({
    attempt: attemptPlan([testId])[0],
    sessionId: "timing-quality-64",
    timeline: timeline(fps),
    start: Math.round(fps / 2),
    end: fps * 3,
    sourceName: "original.mov",
    sourceHash: "f".repeat(64),
    sourceBytes: 10000,
    codec: "avc1.640029",
    guidePositions: [0.3, 0.7],
    notes: "",
    ...(testId === "cod_505" ? { turnFrameIndex: fps * 2 } : {}),
  });

describe("reviewed sprint timing and recording resolution", () => {
  it.each([15, 30, 60, 120, 240])("classifies %s FPS without claiming field accuracy", (fps) => {
    const value = result(fps);
    const quality = timingRecordingQuality({ ...value, fps });
    expect(quality.status).toBe(fps < 119 ? "indicative" : "reviewed");
    expect(value.version).toBe(REVIEWED_TIMING_PROTOCOL);
    expect(value.timingReview?.eventsConfirmed).toBe(true);
  });
  it("blocks even one missing image at an event in a high-rate sprint", () => {
    const t = timeline(240, [120]);
    expect(t.fps).toBeGreaterThan(239);
    const start = t.frames.findIndex((f) => f.sampleIndex === 120);
    expect(t.frames[start].seconds - t.frames[start - 1].seconds).toBeCloseTo(2 / 240, 8);
    expect(() => timedMeasurement("sprint_10m", t, start, 700)).toThrow("Brakuje klatek");
    expect(() => timedMeasurement("cod_505", t, start, 700)).toThrow("Brakuje klatek");
    // Missing images elsewhere do not change the time of well-bracketed events.
    expect(timedMeasurement("sprint_10m", t, 60, 700).elapsedSeconds).toBeCloseTo(
      t.frames[700].seconds - t.frames[60].seconds,
      8,
    );
  });
  it("does not accept reviewed results with missing evidence or a forged local gap", () => {
    const valid = result();
    expect(() => validatedResult({ ...valid, timingReview: undefined })).toThrow("sprawdzenia");
    const startPreviousSeconds = valid.startSeconds - 0.095;
    const changed = {
      ...valid,
      startPreviousSeconds,
      resolutionMax: valid.endSeconds - startPreviousSeconds,
    };
    expect(() => validatedResult(changed)).toThrow("Odstęp klatek");
    // Old records remain readable and get an honest low-quality label.
    const archived = validatedResult({
      ...changed,
      version: "ballwise-browser-lab-1.0",
      timingReview: undefined,
    });
    expect(timingRecordingQuality(archived).status).toBe("incomplete");
  });
  it("retains the checked 505 turn and timing method through a backup round trip", () => {
    const checked = result(240, "cod_505");
    expect(backupResults(JSON.parse(JSON.stringify(createHistoryBackup([checked]))))[0]).toEqual(
      checked,
    );
    expect(() => validatedResult({ ...checked, turnPreviousSeconds: undefined })).toThrow(
      "nawrocie",
    );
    expect(() =>
      validatedResult({ ...checked, turnPreviousSeconds: checked.turnSeconds! - 0.05 }),
    ).toThrow("nawrocie");
    expect(() => validatedResult({ ...checked, turnFrameIndex: undefined })).toThrow("nawrotu");
  });
  it("keeps old/new methods separate and withholds small-change interpretation for low FPS", () => {
    const modern = result(),
      low = result(30);
    expect(comparison(modern, modern).canAssessChange).toBe(true);
    expect(comparison(modern, low).canAssessChange).toBe(false);
    const old = validatedResult({
      ...modern,
      version: "ballwise-browser-lab-1.0",
      timingReview: undefined,
    });
    expect(() => comparison(modern, old)).toThrow("protokół");
  });
  it("provides a sprint review window before the threshold, including the true synthetic start", () => {
    const t = timeline(),
      firstMotion = 0.6;
    const poses: TimedPoseFrame[] = t.frames.map((f, frameIndex) => {
      const x = 0.15 + (2 * Math.max(0, f.seconds - firstMotion) ** 2) / 16;
      return {
        frameIndex,
        hip: [x, 0.45],
        shoulders: [x, 0.35],
        heels: [
          [x, 0.55],
          [x, 0.55],
        ],
        toes: [
          [x, 0.55],
          [x, 0.55],
        ],
        confidence: 1,
        bodyHeight: 0.2,
      };
    });
    const p = selectTimedEvents("sprint_10m", t, poses, null, 0.775, { width: 720, height: 405 });
    expect(t.frames[p.start].seconds).toBeGreaterThan(firstMotion);
    expect(t.frames[p.startReviewFrom!].seconds).toBeLessThan(firstMotion);
    // The onset is selected from images by the user, never silently "corrected" by a constant.
    expect(p.startReviewFrom).toBeLessThan(p.start);
  });
});

describe("jump recording quality", () => {
  const jump = (fps = 240) =>
    createBrowserResult({
      attempt: attemptPlan(["cmj"])[0],
      sessionId: "jump-quality-65",
      timeline: timeline(fps),
      start: fps / 2,
      end: fps * 0.9,
      sourceName: "jump.mov",
      sourceHash: "e".repeat(64),
      sourceBytes: 10000,
      codec: "avc1.640029",
      guidePositions: [0.5, 0.5],
      notes: "",
    });
  it.each(["cmj", "single_leg_cmj"] as const)(
    "blocks missing takeoff or landing images in %s",
    (testId) => {
      for (const omitted of [119, 215]) {
        const t = timeline(240, [omitted]);
        const at = (seconds: number) => t.frames.findIndex((f) => f.seconds >= seconds - 1e-7);
        expect(() => timedMeasurement(testId, t, at(0.5), at(0.9))).toThrow("Brakuje klatek");
      }
    },
  );
  it("retains old jump records but withholds change interpretation for gaps and low FPS", () => {
    const valid = jump();
    expect(valid.version).toBe("ballwise-browser-lab-2.1");
    expect(valid.jumpReview).toEqual({ eventsConfirmed: true, techniqueConfirmed: true });
    expect(() => validatedResult({ ...valid, jumpReview: undefined })).toThrow();
    const previous = valid.startSeconds - 0.095;
    const changed = {
      ...valid,
      startPreviousSeconds: previous,
      resolutionMax: ((9.80665 * (valid.endSeconds - previous) ** 2) / 8) * 100,
    };
    expect(() => validatedResult(changed)).toThrow("Odstęp klatek");
    const archived = validatedResult({
      ...changed,
      version: "ballwise-browser-lab-1.0",
      jumpReview: undefined,
    });
    expect(resultRecordingQuality(archived).status).toBe("incomplete");
    expect(comparison(archived, archived).canAssessChange).toBe(false);
    expect(comparison(jump(30), jump(30)).canAssessChange).toBe(false);
    expect(comparison(valid, valid).canAssessChange).toBe(true);
    expect(backupResults(JSON.parse(JSON.stringify(createHistoryBackup([valid]))))[0]).toEqual(
      valid,
    );
  });
});
