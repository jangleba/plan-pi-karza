import { describe, expect, it, vi } from "vitest";
import { TimeoutDiagnosticsRecorder, classifyTimeout } from "./timeoutDiagnostics";

describe("classifyTimeout", () => {
  it("returns unknown when no progress has ever been recorded", () => {
    expect(classifyTimeout("seek_frame", null)).toBe("unknown");
  });

  it("classifies as slow_processing when progress is recent, regardless of stage", () => {
    expect(classifyTimeout("estimate_pose", 500)).toBe("slow_processing");
  });

  it("classifies stall types for the low-level extraction stages once progress is stale", () => {
    expect(classifyTimeout("seek_frame", 10_000)).toBe("seek_stall");
    expect(classifyTimeout("decode_frame", 10_000)).toBe("decode_stall");
    expect(classifyTimeout("estimate_pose", 10_000)).toBe("pose_stall");
  });

  it("classifies as no_progress for higher-level stages once progress is stale", () => {
    expect(classifyTimeout("load_video", 10_000)).toBe("no_progress");
    expect(classifyTimeout("read_metadata", 10_000)).toBe("no_progress");
    expect(classifyTimeout("create_schedule", 10_000)).toBe("no_progress");
    expect(classifyTimeout("recognize_protocol", 10_000)).toBe("no_progress");
    expect(classifyTimeout("calculate_result", 10_000)).toBe("no_progress");
    expect(classifyTimeout("validate_recording", 10_000)).toBe("no_progress");
  });

  it("falls back to unknown for the unknown stage once progress is stale", () => {
    expect(classifyTimeout("unknown", 10_000)).toBe("unknown");
  });
});

describe("TimeoutDiagnosticsRecorder", () => {
  it("starts with a safe, empty snapshot", () => {
    const recorder = new TimeoutDiagnosticsRecorder("run-1");
    const report = recorder.snapshot();
    expect(report.analysisRunId).toBe("run-1");
    expect(report.currentStage).toBe("unknown");
    expect(report.lastProgressAtMs).toBeNull();
    expect(report.msSinceLastProgress).toBeNull();
    expect(report.scheduledFrameCount).toBe(0);
    expect(report.protocolRecognition).toBeNull();
    expect(report.timeoutClassification).toBe("unknown");
  });

  it("tracks stage/operation transitions and frame counters", () => {
    const recorder = new TimeoutDiagnosticsRecorder("run-2");
    recorder.setStage("create_schedule");
    recorder.setScheduleInfo(12, [0, 33, 66], [900, 933, 966]);
    recorder.setStage("seek_frame");
    recorder.setCurrentIndices(3, 3);
    recorder.markProgress();
    recorder.incrementExtractedFrameCount();
    recorder.setStage("estimate_pose");
    recorder.incrementPoseFrameCount();
    recorder.setLastSuccessfulFrame(3, 0.1, 3);
    recorder.incrementProcessedFrameCount();

    const report = recorder.snapshot();
    expect(report.currentStage).toBe("estimate_pose");
    expect(report.scheduledFrameCount).toBe(12);
    expect(report.firstScheduledTimestampsMs).toEqual([0, 33, 66]);
    expect(report.lastScheduledTimestampsMs).toEqual([900, 933, 966]);
    expect(report.currentScheduleIndex).toBe(3);
    expect(report.currentFrameIndex).toBe(3);
    expect(report.extractedFrameCount).toBe(1);
    expect(report.poseFrameCount).toBe(1);
    expect(report.processedFrameCount).toBe(1);
    expect(report.lastSuccessfulFrameIndex).toBe(3);
    expect(report.lastSuccessfulMediaTimeSeconds).toBe(0.1);
    expect(report.lastSuccessfulScheduleIndex).toBe(3);
    expect(report.lastProgressAtMs).not.toBeNull();
  });

  it("classifies a seek stall in its own snapshot when progress goes stale", () => {
    vi.useFakeTimers();
    try {
      const recorder = new TimeoutDiagnosticsRecorder("run-3");
      recorder.setStage("seek_frame");
      recorder.markProgress();
      vi.advanceTimersByTime(9_000);
      const report = recorder.snapshot();
      expect(report.msSinceLastProgress).toBeGreaterThanOrEqual(9_000);
      expect(report.timeoutStageGuess).toBe("seek_frame");
      expect(report.timeoutClassification).toBe("seek_stall");
      expect(report.elapsedStageMs).toBeGreaterThanOrEqual(9_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("records pose errors, timestamp order errors and movement/protocol summaries", () => {
    const recorder = new TimeoutDiagnosticsRecorder("run-4");
    recorder.incrementPoseErrorCount();
    recorder.incrementPoseErrorCount();
    recorder.incrementTimestampOrderErrorCount();
    recorder.setTimestampCorrectionCount(2);
    recorder.setPoseDelegate("GPU");
    recorder.setFpsInfo(30, 29.7, "measured");
    recorder.setMovementCounts(5, 4, 2);
    recorder.setFirstRepeatedCycles([
      {
        index: 0,
        takeoffTime: 0.1,
        landingTime: 0.3,
        flightSeconds: 0.2,
        contactSeconds: 0.15,
        confidence: 0.9,
      },
    ]);
    recorder.setProtocolRecognition({
      movementSignature: "POGO",
      selectedTestType: "pogo_jumps",
      recognizedTestType: "POGO_JUMPS",
      detectedRepetitions: 8,
      requiredRepetitions: 10,
      protocolMatch: false,
      reason: "test reason",
    });

    const report = recorder.snapshot();
    expect(report.poseErrorCount).toBe(2);
    expect(report.timestampOrderErrorCount).toBe(1);
    expect(report.timestampCorrectionCount).toBe(2);
    expect(report.poseDelegate).toBe("GPU");
    expect(report.declaredFps).toBe(30);
    expect(report.measuredFps).toBe(29.7);
    expect(report.fpsSource).toBe("measured");
    expect(report.airSegmentCount).toBe(5);
    expect(report.contactCount).toBe(4);
    expect(report.repeatedCycleCount).toBe(2);
    expect(report.firstRepeatedCycles).toHaveLength(1);
    expect(report.protocolRecognition).toEqual({
      movementSignature: "POGO",
      selectedTestType: "pogo_jumps",
      recognizedTestType: "POGO_JUMPS",
      detectedRepetitions: 8,
      requiredRepetitions: 10,
      protocolMatch: false,
      reason: "test reason",
    });
  });
});
