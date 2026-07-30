import type {
  AnalysisContext,
  AnalysisPhase,
  AnalysisPipelineSnapshot,
  AnalysisStatus,
  CalculatedMetric,
  Calibration,
  CameraSetup,
  DetectedEvent,
  FrameLogEntry,
  FramePose,
  PipelineStageName,
  TestType,
  VideoAnalysisResult,
  VideoMetadata,
  VisionDiagnostics,
} from "./types";
import { QUALITY_ISSUE_LABELS } from "./types";
import { AnalysisPipelineController } from "./AnalysisPipelineController";
import { resolveAnalysisStatus } from "./statusPolicy";
import { getAnalyzer } from "./testAnalyzerRegistry";
import {
  createFrameSchedule,
  readVideoMetadata,
  seekToFrame,
  withLoadedVideoElement,
  type ScheduledVideoFrame,
} from "./videoFrameReader";
import {
  clearPoseDebugLog,
  closePoseEngine,
  detectPose,
  flushPoseDebugLog,
  FRAME_TIMESTAMP_ORDER_USER_MESSAGE,
  getPoseEngineDiagnostics,
  isPoseSupported,
} from "./poseEngine";
import { round } from "./physics";
import { vlog } from "./devLog";
import type { LensType, CaptureOrientation } from "./calibrationProfiles";
import { matchCalibrationStrictForRecording } from "@/lib/vision/calibrationStore";
import { recognizeMovement, recognizeTestProtocol } from "./testProtocolRecognizer";
import { detectMotionWindow, type MotionWindow } from "./motionWindow";
import { getTestProtocol } from "./testProtocols";
import {
  analyzeJumpField,
  detectGroundContacts,
  detectRepeatedCycles,
} from "./analyzers/jumpDetection";
import { TimeoutDiagnosticsRecorder } from "./timeoutDiagnostics";

export type { AnalysisPhase } from "./types";

export const SPATIAL_TESTS: ReadonlySet<TestType> = new Set<TestType>([
  "broad_jump",
  "single_leg_hop",
  "sprint_20m",
  "sprint_30m",
]);

export interface RunOptions {
  testType: TestType;
  videoUrl: string;
  declaredFps: number | null;
  cameraSetup: CameraSetup;
  calibration?: Calibration | null;
  athleteHeightCm?: number | null;
  deviceId?: string | null;
  lens?: LensType | null;
  zoom?: number | null;
  facing?: "front" | "back" | null;
  cameraStable?: boolean | null;
  videoHash?: string | null;
  calibrationRecord?: import("./videoCalibration").CalibrationRecord | null;
  techniqueOnly?: boolean;
  abortSignal?: AbortSignal;
  onPhase?: (phase: AnalysisPhase) => void;
  onProgress?: (fraction: number) => void;
  onPipelineUpdate?: (snapshot: AnalysisPipelineSnapshot) => void;
  /**
   * Włącza budowanie diagnostycznego snapshotu Vision Lab (Phase 1).
   * Gdy false/undefined: pole `diagnostics` NIE istnieje w wyniku i nie
   * są wykonywane żadne dodatkowe obliczenia diagnostyczne. Diagnostyka
   * istnieje wyłącznie w pamięci — nigdy nie jest zapisywana do Supabase
   * ani localStorage.
   */
  debugDiagnostics?: boolean;
  /**
   * Opcjonalny, utworzony przez wywołującego rejestrator diagnostyki
   * timeoutu (Phase 2, dev-only). Gdy podany, jest aktualizowany na bieżąco
   * w trakcie przebiegu pipeline'u — dzięki temu jego stan pozostaje
   * czytelny nawet po tym, jak zewnętrzny twardy limit czasu UI przerwie
   * oczekiwanie na wynik `runVideoAnalysis`. Brak wpływu na logikę analizy.
   */
  timeoutRecorder?: TimeoutDiagnosticsRecorder;
}

interface PoseStageOutput {
  poses: FramePose[];
  frameLog: FrameLogEntry[];
  scheduledFrames: number;
  processedScheduleFrames: number;
  extractedFrames: number;
  attemptedPoseFrames: number;
  validPoseFrames: number;
  analyzedFrames: number;
  poseErrors: number;
  timestampOrderErrors: number;
  /** Timestampy (ms) zaplanowanych klatek — obecne tylko gdy debugDiagnostics. */
  scheduledTimestampsMs?: number[];
}

interface MovementSignalsOutput {
  signature: ReturnType<typeof recognizeMovement>;
  field: ReturnType<typeof analyzeJumpField>;
  contacts: DetectedEvent[];
  repeatedCycles: ReturnType<typeof detectRepeatedCycles>;
}

interface AdapterOutput {
  events: DetectedEvent[];
  metrics: CalculatedMetric[];
  confidence: ReturnType<NonNullable<ReturnType<typeof getAnalyzer>>["calculateConfidence"]>;
  measurement?: VideoAnalysisResult["measurement"];
  calibration: Calibration | null;
  statusOverride: AnalysisStatus | null;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `analysis-${Date.now()}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Analiza została przerwana.");
  (error as Error & { code: string }).code = "ANALYSIS_ABORTED";
  throw error;
}

function isFrameTimestampOrderError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "FRAME_TIMESTAMP_ORDER_ERROR" ||
    /INVALID_ARGUMENT|CalculatorGraph|timestamp mismatch|WaitUntilIdle|graph_utils\.cc/i.test(
      message,
    )
  );
}

function failResult(
  testType: TestType,
  analyzerVersion: string,
  reason: string,
  code: string,
  analysisId: string,
  controller: AnalysisPipelineController,
  extras?: Partial<VideoAnalysisResult>,
): VideoAnalysisResult {
  controller.error();
  return {
    analysisId,
    testType,
    status: "failed",
    videoMetadata: { fps: 0, durationSeconds: 0, frameCount: 0, width: 0, height: 0 },
    keyEvents: [],
    metrics: [],
    overallConfidence: 0,
    qualityIssues: [code],
    retakeInstructions: [reason],
    analyzerVersion,
    pipelineTrace: controller.trace(),
    ...extras,
  };
}

function completePhase(
  controller: AnalysisPipelineController,
  opts: RunOptions,
  stage: PipelineStageName,
) {
  void controller;
  opts.onPhase?.(stage);
}

function resolveCalibration(
  opts: RunOptions,
  orientation: "portrait" | "landscape" | "square",
  measuredFps: number,
  resolution: string,
): Calibration | null {
  const base: Calibration = { ...(opts.calibration ?? {}) };
  const isSpatial = SPATIAL_TESTS.has(opts.testType);
  const record = opts.calibrationRecord ?? null;
  if (record?.homographyMatrix && record.spatialResultStatus === "OFFICIAL") {
    base.homography = record.homographyMatrix;
    base.profileId = record.calibrationId;
    base.calibrationHash = record.calibrationHash;
    base.profileMatch = {
      exact: true,
      score: 1,
      reprojectionErrorPx: record.reprojectionErrorPx,
      reasons: [],
    };
    if (opts.cameraStable === false) {
      base.cameraMoved = true;
      base.mismatchCode = "CALIBRATION_CAMERA_MOVED";
    }
    return base;
  }

  const hasManual = !!base.referencePoints || (base.startLineX != null && base.finishLineX != null);
  const deviceId = opts.deviceId ?? null;
  const fps = Math.round(measuredFps > 0 ? measuredFps : (opts.declaredFps ?? 0));
  const parts = deviceId
    ? {
        deviceId,
        lens: opts.lens ?? "wide",
        orientation: (orientation === "landscape" ? "landscape" : "portrait") as CaptureOrientation,
        fps,
        zoom: opts.zoom ?? 1,
        facing: (opts.facing ?? "back") as "front" | "back",
        resolution,
      }
    : null;

  const profile = parts ? matchCalibrationStrictForRecording(parts) : null;
  if (profile) {
    base.profileKey = profile.key;
    base.profileId = profile.id;
    base.calibrationHash = profile.key;
    base.homography = profile.homography;
    base.profileMatch = {
      exact: true,
      score: 1,
      reprojectionErrorPx: profile.reprojectionErrorPx,
      reasons: [],
    };
    if (base.metersPerPixel == null && !base.referencePoints) {
      base.metersPerPixel = profile.mmPerPixel / 1000;
    }
    if (opts.cameraStable === false) {
      base.cameraMoved = true;
      base.mismatchCode = "CALIBRATION_CAMERA_MOVED";
    }
    return base;
  }

  if (isSpatial && !hasManual) return base;
  return Object.keys(base).length > 0 ? base : (opts.calibration ?? null);
}

function metadataResult(metadata: VideoMetadata): VideoAnalysisResult["videoMetadata"] {
  return {
    fps: metadata.fps,
    durationSeconds: round(metadata.durationSeconds, 2),
    frameCount: metadata.frameCount,
    width: metadata.width,
    height: metadata.height,
  };
}

function visibleEvents(events: DetectedEvent[]): VideoAnalysisResult["keyEvents"] {
  return events.map((event) => ({
    type: event.type,
    frameIndex: event.frameIndex,
    timestampSeconds: round(event.timestampSeconds, 3),
    confidence: round(event.confidence, 2),
  }));
}

export async function extractFramesAndEstimatePose(
  opts: RunOptions,
  controller: AnalysisPipelineController,
  analysisRunId: string,
  metadata: VideoMetadata,
  recorderParam?: TimeoutDiagnosticsRecorder | null,
): Promise<PoseStageOutput> {
  const recorder = opts.debugDiagnostics ? (recorderParam ?? opts.timeoutRecorder ?? null) : null;
  recorder?.setStage("create_schedule");
  const schedule = createFrameSchedule(metadata);
  controller.start("extractFrames", schedule.length);
  completePhase(controller, opts, "extractFrames");
  recorder?.setScheduleInfo(
    schedule.length,
    schedule.map((frame) => frame.sourceTimestampMs),
    schedule.map((frame) => frame.sourceTimestampMs),
  );
  recorder?.markProgress();
  const frameLog: FrameLogEntry[] = [];
  const poses: FramePose[] = [];
  let processedScheduleFrames = 0;
  let extractedFrames = 0;
  let attemptedPoseFrames = 0;
  let validPoseFrames = 0;
  let poseErrors = 0;
  let timestampOrderErrors = 0;

  await withLoadedVideoElement(opts.videoUrl, opts.abortSignal, async (video) => {
    let scheduleIndex = 0;
    for (const frame of schedule) {
      throwIfAborted(opts.abortSignal);
      recorder?.setCurrentIndices(scheduleIndex, frame.frameIndex);
      try {
        recorder?.setStage("seek_frame");
        await seekToFrame(video, frame.mediaTime, opts.abortSignal);
        recorder?.setStage("decode_frame");
        extractedFrames += 1;
        recorder?.incrementExtractedFrameCount();
        recorder?.markProgress();
        try {
          recorder?.setStage("estimate_pose");
          const pose = await detectPose(video, frame.frameIndex, frame.mediaTime, {
            analysisRunId,
            passType: "coarse",
            sourceTimestampMs: frame.sourceTimestampMs,
            sourceTimestampUs: frame.sourceTimestampUs,
            sourceFrameIndex: frame.sourceFrameIndex,
          });
          poses.push(pose);
          recorder?.incrementPoseFrameCount();
          recorder?.markProgress();
          if (pose.landmarks != null) {
            validPoseFrames += 1;
            recorder?.setLastSuccessfulFrame(frame.frameIndex, frame.mediaTime, scheduleIndex);
          }
          frameLog.push({
            sourceFrameIndex: frame.sourceFrameIndex,
            sourceTimestampUs: frame.sourceTimestampUs,
            hasPose: pose.landmarks != null,
            peopleCount: pose.peopleCount,
            trackingConfidence: round(pose.trackingConfidence, 3),
            ...(pose.landmarks == null ? { skippedReason: "POSE_NOT_DETECTED" } : {}),
          });
        } catch (error) {
          poseErrors += 1;
          recorder?.incrementPoseErrorCount();
          const orderError = isFrameTimestampOrderError(error);
          if (orderError) {
            timestampOrderErrors += 1;
            recorder?.incrementTimestampOrderErrorCount();
          }
          frameLog.push({
            sourceFrameIndex: frame.sourceFrameIndex,
            sourceTimestampUs: frame.sourceTimestampUs,
            hasPose: false,
            peopleCount: 0,
            trackingConfidence: 0,
            skippedReason: orderError ? "FRAME_TIMESTAMP_ORDER_ERROR" : "POSE_FRAME_ERROR",
          });
        } finally {
          attemptedPoseFrames += 1;
          if (recorder) {
            const engineDiagnostics = getPoseEngineDiagnostics(analysisRunId);
            recorder.setPoseDelegate(engineDiagnostics.poseDelegate);
            recorder.setTimestampCorrectionCount(engineDiagnostics.timestampCorrectionsCount);
          }
        }
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : "";
        const message = error instanceof Error ? error.message : String(error);
        frameLog.push({
          sourceFrameIndex: frame.sourceFrameIndex,
          sourceTimestampUs: frame.sourceTimestampUs,
          hasPose: false,
          peopleCount: 0,
          trackingConfidence: 0,
          skippedReason:
            code === "FRAME_SEEK_TIMEOUT" || message.includes("FRAME_SEEK_TIMEOUT")
              ? "FRAME_SEEK_TIMEOUT"
              : "FRAME_SEEK_ERROR",
        });
      } finally {
        processedScheduleFrames += 1;
        scheduleIndex += 1;
        recorder?.incrementProcessedFrameCount();
        recorder?.markProgress();
        controller.progress("extractFrames", processedScheduleFrames, schedule.length);
        opts.onProgress?.(Math.min(1, processedScheduleFrames / Math.max(1, schedule.length)));
      }
    }
  });

  if (processedScheduleFrames !== schedule.length) {
    controller.fail("extractFrames", "PIPELINE_FRAME_ACCOUNTING_ERROR", {
      scheduledFrames: schedule.length,
      processedScheduleFrames,
      extractedFrames,
    });
    throw new Error("PIPELINE_FRAME_ACCOUNTING_ERROR");
  }
  controller.complete("extractFrames", {
    scheduledFrames: schedule.length,
    processedScheduleFrames,
    extractedFrames,
  });

  recorder?.setStage("estimate_pose");
  controller.start("estimatePose", Math.max(1, extractedFrames));
  completePhase(controller, opts, "estimatePose");
  controller.progress("estimatePose", attemptedPoseFrames, Math.max(1, extractedFrames));
  if (extractedFrames === 0) {
    controller.fail("estimatePose", "NO_DECODED_FRAMES", {
      extractedFrames,
      attemptedPoseFrames,
      validPoseFrames,
      poseErrors,
    });
    const error = new Error("NO_DECODED_FRAMES");
    (error as Error & { code: string }).code = "NO_DECODED_FRAMES";
    throw error;
  }
  const analyzedFrames = validPoseFrames;
  controller.complete("estimatePose", {
    extractedFrames,
    attemptedPoseFrames,
    validPoseFrames,
    analyzedFrames,
    poseErrors,
    timestampOrderErrors,
  });

  return {
    poses,
    frameLog,
    scheduledFrames: schedule.length,
    processedScheduleFrames,
    extractedFrames,
    attemptedPoseFrames,
    validPoseFrames,
    analyzedFrames,
    poseErrors,
    timestampOrderErrors,
    ...(opts.debugDiagnostics
      ? { scheduledTimestampsMs: schedule.map((frame) => frame.sourceTimestampMs) }
      : {}),
  };
}

function buildMovementSignals(poses: FramePose[]): MovementSignalsOutput {
  return {
    signature: recognizeMovement(poses),
    field: analyzeJumpField(poses),
    contacts: detectGroundContacts(poses),
    repeatedCycles: detectRepeatedCycles(poses),
  };
}

function summarizeMotionWindow(
  motionWindow: MotionWindow,
  metadata: VideoMetadata,
  testType: TestType,
): NonNullable<VideoAnalysisResult["motionWindow"]> {
  const protocolSpec = getTestProtocol(testType);
  const minDur = protocolSpec.minMovementDurationSeconds ?? 0;
  const maxDur = protocolSpec.maxMovementDurationSeconds ?? Number.POSITIVE_INFINITY;
  const [minReps, maxReps] = protocolSpec.expectedRepCountRange ?? [1, 1];
  return {
    startTimestampSeconds: motionWindow.startTimestampSeconds,
    endTimestampSeconds: motionWindow.endTimestampSeconds,
    durationSeconds: motionWindow.durationSeconds,
    leadingMarginSeconds: motionWindow.leadingMarginSeconds,
    trailingMarginSeconds: motionWindow.trailingMarginSeconds,
    approximateVerticalRepetitions: motionWindow.approximateVerticalRepetitions,
    activeSegments: motionWindow.activeSegments,
    framesConsidered: motionWindow.framesConsidered,
    withinExpectedDuration:
      motionWindow.durationSeconds >= minDur && motionWindow.durationSeconds <= maxDur,
    withinExpectedRepCount:
      motionWindow.approximateVerticalRepetitions >= minReps &&
      motionWindow.approximateVerticalRepetitions <= maxReps,
    hasSufficientMargins:
      motionWindow.leadingMarginSeconds >= (protocolSpec.leadingMarginSeconds ?? 0) &&
      motionWindow.trailingMarginSeconds >= (protocolSpec.trailingMarginSeconds ?? 0),
  };
  void metadata;
}

function hasCalibrationData(calibration: Calibration | null): boolean {
  if (!calibration) return false;
  return !!(
    calibration.homography ||
    calibration.referencePoints ||
    (calibration.startLineX != null && calibration.finishLineX != null) ||
    calibration.profileKey ||
    calibration.profileId
  );
}

interface BuildDiagnosticsInput {
  analysisRunId: string;
  opts: RunOptions;
  metadata: VideoMetadata;
  poseOut: PoseStageOutput;
  movementSignals: MovementSignalsOutput;
  recognition: ReturnType<typeof recognizeTestProtocol>;
  calibration: Calibration | null;
  controller: AnalysisPipelineController;
}

/**
 * Buduje diagnostyczny snapshot Vision Lab (Phase 1). Wołane WYŁĄCZNIE gdy
 * `opts.debugDiagnostics === true`. Wynik istnieje tylko w pamięci.
 */
function buildVisionDiagnostics(input: BuildDiagnosticsInput): VisionDiagnostics {
  const { analysisRunId, opts, metadata, poseOut, movementSignals, recognition, calibration, controller } =
    input;
  const engineDiagnostics = getPoseEngineDiagnostics(analysisRunId);
  const timestamps = poseOut.scheduledTimestampsMs ?? [];
  return {
    analysisRunId,
    declaredFps: opts.declaredFps ?? null,
    measuredFps: metadata.fpsMeasured ? metadata.fps : null,
    fpsSourceUsed: metadata.fpsMeasured ? "measured" : "declared",
    scheduledFrameCount: poseOut.scheduledFrames,
    firstTimestampsMs: timestamps.slice(0, 10),
    lastTimestampsMs: timestamps.slice(Math.max(0, timestamps.length - 10)),
    decodedFrames: poseOut.poses.length,
    attemptedPoseFrames: poseOut.attemptedPoseFrames,
    validPoseFrames: poseOut.validPoseFrames,
    poseErrors: poseOut.poseErrors,
    timestampOrderErrors: poseOut.timestampOrderErrors,
    poseDelegate: engineDiagnostics.poseDelegate,
    timestampCorrectionsCount: engineDiagnostics.timestampCorrectionsCount,
    maximumTimestampCorrectionMs: engineDiagnostics.maximumTimestampCorrectionMs,
    airSegmentsCount: movementSignals.field?.segments.length ?? 0,
    contactsCount: movementSignals.contacts.length,
    repeatedCyclesCount: movementSignals.repeatedCycles.cycles.length,
    firstRepeatedCycles: movementSignals.repeatedCycles.cycles.slice(0, 5),
    movementSignature: movementSignals.signature.signature,
    selectedTestType: opts.testType,
    recognizedTestType: recognition.detectedTestType,
    detectedRepetitions: recognition.detectedRepetitions,
    requiredRepetitions: recognition.requiredRepetitions,
    protocolMatch: recognition.protocolMatch,
    protocolDecisionReason: recognition.reason,
    calibrationPresent: hasCalibrationData(calibration),
    pipelineSnapshot: controller.snapshot(),
  };
}

export async function runVideoAnalysis(opts: RunOptions): Promise<VideoAnalysisResult> {
  const analysisRunId = uuid();
  const controller = new AnalysisPipelineController(analysisRunId, opts.onPipelineUpdate);
  const recorder = opts.debugDiagnostics
    ? (opts.timeoutRecorder ?? new TimeoutDiagnosticsRecorder(analysisRunId))
    : null;
  clearPoseDebugLog();
  await closePoseEngine();
  const analyzer = getAnalyzer(opts.testType);

  const fail = (
    stage: PipelineStageName,
    code: string,
    reason: string,
    extras?: Partial<VideoAnalysisResult>,
  ) => {
    controller.fail(stage, code);
    return failResult(
      opts.testType,
      analyzer?.analyzerVersion ?? "none",
      reason,
      code,
      analysisRunId,
      controller,
      {
        ...(recorder ? { timeoutDiagnostics: recorder.snapshot() } : {}),
        ...extras,
      },
    );
  };

  try {
    throwIfAborted(opts.abortSignal);
    recorder?.setStage("load_video");
    controller.start("loadVideo");
    completePhase(controller, opts, "loadVideo");
    if (!analyzer) {
      return fail("loadVideo", "ANALYZER_NOT_FOUND", "Brak analizatora dla tego testu.");
    }
    if (!isPoseSupported()) {
      return fail(
        "loadVideo",
        "BROWSER_NOT_SUPPORTED",
        "Analiza wideo nie jest wspierana w tej przeglądarce.",
      );
    }
    if (!opts.videoUrl) return fail("loadVideo", "NO_VIDEO_SOURCE", "Brak źródła filmu.");
    recorder?.markProgress();
    controller.complete("loadVideo", {
      analysisRunId,
      videoHash: opts.videoHash ?? null,
      selectedTestType: opts.testType,
    });

    recorder?.setStage("read_metadata");
    controller.start("readMetadata");
    completePhase(controller, opts, "readMetadata");
    const metadata = await readVideoMetadata(opts.videoUrl, opts.declaredFps);
    if (metadata.frameCount <= 0) {
      return fail("readMetadata", "NO_FRAMES", "Nie udało się odczytać klatek wideo.");
    }
    recorder?.setFpsInfo(
      opts.declaredFps ?? null,
      metadata.fpsMeasured ? metadata.fps : null,
      metadata.fpsMeasured ? "measured" : "declared",
    );
    recorder?.markProgress();
    controller.complete("readMetadata", {
      fps: metadata.fps,
      frameCount: metadata.frameCount,
      durationSeconds: round(metadata.durationSeconds, 3),
      width: metadata.width,
      height: metadata.height,
      orientation: metadata.orientation,
    });

    const poseOut = await extractFramesAndEstimatePose(
      opts,
      controller,
      analysisRunId,
      metadata,
      recorder,
    );
    const decodedFrames = poseOut.poses.length;
    if (poseOut.extractedFrames === 0 && poseOut.attemptedPoseFrames === 0) {
      return fail("extractFrames", "NO_DECODED_FRAMES", "Nie udało się zdekodować żadnej klatki.", {
        frameLog: poseOut.frameLog,
      });
    }
    if (
      poseOut.attemptedPoseFrames > 0 &&
      poseOut.timestampOrderErrors === poseOut.attemptedPoseFrames
    ) {
      return fail(
        "estimatePose",
        "FRAME_TIMESTAMP_ORDER_ERROR",
        FRAME_TIMESTAMP_ORDER_USER_MESSAGE,
        {
          frameLog: poseOut.frameLog,
          decodedFrames,
          analyzedFrames: poseOut.analyzedFrames,
        },
      );
    }
    if (poseOut.analyzedFrames === 0) {
      return fail(
        "estimatePose",
        "BODY_NOT_DETECTED",
        "Nie wykryto sylwetki zawodnika w nagraniu.",
        {
          frameLog: poseOut.frameLog,
          decodedFrames,
          analyzedFrames: 0,
        },
      );
    }

    recorder?.setStage("recognize_protocol", "buildMovementSignals");
    controller.start("buildMovementSignals");
    completePhase(controller, opts, "buildMovementSignals");
    const movementSignals = buildMovementSignals(poseOut.poses);
    recorder?.setMovementCounts(
      movementSignals.field?.segments.length ?? 0,
      movementSignals.contacts.length,
      movementSignals.repeatedCycles.cycles.length,
    );
    recorder?.setFirstRepeatedCycles(movementSignals.repeatedCycles.cycles);
    recorder?.markProgress();
    controller.complete("buildMovementSignals", {
      signature: movementSignals.signature.signature,
      confidence: round(movementSignals.signature.confidence, 2),
      contactCount: movementSignals.contacts.length,
      airSegments: movementSignals.field?.segments.length ?? 0,
      repeatedCycles: movementSignals.repeatedCycles.cycles.length,
    });

    recorder?.setOperation("detectMovementEvents");
    controller.start("detectMovementEvents");
    completePhase(controller, opts, "detectMovementEvents");
    const motionWindow = detectMotionWindow(poseOut.poses, metadata.durationSeconds);
    const motionWindowSummary = summarizeMotionWindow(motionWindow, metadata, opts.testType);
    recorder?.markProgress();
    if (motionWindow.activeSegments === 0) {
      controller.fail("detectMovementEvents", "NO_MOVEMENT_DETECTED", motionWindowSummary);
    } else {
      controller.complete("detectMovementEvents", motionWindowSummary);
    }

    recorder?.setOperation("segmentAttempts");
    controller.start("segmentAttempts");
    completePhase(controller, opts, "segmentAttempts");
    const protocolSpec = getTestProtocol(opts.testType);
    const [minReps] = protocolSpec.expectedRepCountRange ?? [1, 1];
    recorder?.markProgress();
    controller.complete("segmentAttempts", {
      attemptedSegments: Math.max(1, motionWindow.activeSegments),
      approximateVerticalRepetitions: motionWindow.approximateVerticalRepetitions,
      requiredRepetitions: minReps,
    });

    recorder?.setOperation("validateProtocol");
    controller.start("validateProtocol");
    completePhase(controller, opts, "validateProtocol");
    const recognition = recognizeTestProtocol(opts.testType, poseOut.poses);
    recorder?.setProtocolRecognition({
      movementSignature: movementSignals.signature.signature,
      selectedTestType: recognition.selectedTestType,
      recognizedTestType: recognition.detectedTestType,
      detectedRepetitions: recognition.detectedRepetitions,
      requiredRepetitions: recognition.requiredRepetitions,
      protocolMatch: recognition.protocolMatch,
      reason: recognition.reason,
    });
    recorder?.markProgress();
    const recognitionSummary = {
      selectedTestType: recognition.selectedTestType,
      detectedSignature: recognition.detectedSignature,
      detectedTestType: recognition.detectedTestType,
      detectedTestConfidence: round(recognition.detectedTestConfidence, 2),
      detectedRepetitions: recognition.detectedRepetitions,
      requiredRepetitions: recognition.requiredRepetitions,
      contactCount: recognition.contactCount,
      flightCount: recognition.flightCount,
      protocolMatch: recognition.protocolMatch,
      errorCode: recognition.errorCode,
      reason: recognition.reason,
    };
    vlog("protocol_recognizer", recognition.reason, recognitionSummary);
    if (!recognition.protocolMatch) {
      controller.fail(
        "validateProtocol",
        recognition.errorCode ?? "PROTOCOL_MISMATCH",
        recognitionSummary,
      );
      const code = recognition.errorCode ?? "TEST_PROTOCOL_MISMATCH";
      const retake =
        code === "WRONG_REPETITION_COUNT"
          ? `Wykryto ${recognition.detectedRepetitions} z wymaganych ${recognition.requiredRepetitions} powtórzeń. ${recognition.reason}`
          : recognition.reason ||
            (QUALITY_ISSUE_LABELS[code as keyof typeof QUALITY_ISSUE_LABELS] ?? code);
      controller.skip("calculateResult", "protocolMatch=false", { metricsCount: 0 });
      controller.skip("validateRecording", "protocolMatch=false", { status: "invalid_recording" });
      controller.finish();
      return {
        analysisId: analysisRunId,
        testType: opts.testType,
        status: "invalid_recording",
        videoMetadata: metadataResult(metadata),
        keyEvents: [],
        metrics: [],
        overallConfidence: 0,
        qualityIssues: [QUALITY_ISSUE_LABELS[code as keyof typeof QUALITY_ISSUE_LABELS] ?? code],
        retakeInstructions: [retake],
        analyzerVersion: analyzer.analyzerVersion,
        decodedFrames,
        analyzedFrames: poseOut.analyzedFrames,
        recognition: recognitionSummary,
        motionWindow: motionWindowSummary,
        frameLog: poseOut.frameLog,
        pipelineTrace: controller.trace(),
        ...(opts.debugDiagnostics
          ? {
              diagnostics: buildVisionDiagnostics({
                analysisRunId,
                opts,
                metadata,
                poseOut,
                movementSignals,
                recognition,
                calibration: resolveCalibration(
                  opts,
                  metadata.orientation,
                  metadata.fps,
                  `${metadata.width}x${metadata.height}`,
                ),
                controller,
              }),
            }
          : {}),
        ...(recorder ? { timeoutDiagnostics: recorder.snapshot() } : {}),
      };
    }
    controller.complete("validateProtocol", recognitionSummary);

    recorder?.setStage("calculate_result");
    controller.start("calculateResult");
    completePhase(controller, opts, "calculateResult");
    const calibration = resolveCalibration(
      opts,
      metadata.orientation,
      metadata.fps,
      `${metadata.width}x${metadata.height}`,
    );
    const ctx: AnalysisContext = {
      testType: opts.testType,
      metadata,
      poses: poseOut.poses,
      cameraSetup: opts.cameraSetup,
      calibration,
      athleteHeightCm: opts.athleteHeightCm ?? null,
      calibrationRecord: opts.calibrationRecord ?? null,
    };
    const events = await analyzer.detectKeyEvents(ctx);
    let metrics = analyzer.calculateMetrics(events, ctx);
    const confidence = analyzer.calculateConfidence(events, ctx);
    let measurement: VideoAnalysisResult["measurement"];
    const isSpatial = SPATIAL_TESTS.has(opts.testType);
    const hasSpatialCalibration = !!calibration?.homography && !calibration?.mismatchCode;
    const movementRecognized = events.length > 0;
    let statusOverride: AnalysisStatus | null = null;

    if (isSpatial) {
      if (calibration?.mismatchCode === "CALIBRATION_CAMERA_MOVED") {
        metrics = [];
        statusOverride = "invalid_recording";
      } else if (opts.techniqueOnly) {
        metrics = [];
        statusOverride = "technique_only";
      } else if (!hasSpatialCalibration && movementRecognized) {
        metrics = [];
        statusOverride = "calibration_required";
      }
    }
    if (analyzer.computeAccuracy && metrics.length > 0) {
      const acc = analyzer.computeAccuracy(events, metrics, ctx);
      measurement = acc.measurement;
      metrics = acc.metrics;
    }
    const adapterOut: AdapterOutput = {
      events,
      metrics,
      confidence,
      measurement,
      calibration,
      statusOverride,
    };
    if (events.length === 0 && !statusOverride) {
      controller.fail("calculateResult", "EVENTS_NOT_DETECTED", {
        eventsCount: 0,
        metricsCount: metrics.length,
      });
    } else {
      controller.complete("calculateResult", {
        eventsCount: events.length,
        eventTypes: [...new Set(events.map((event) => event.type))],
        metricsCount: metrics.length,
        metricKeys: metrics.map((metric) => metric.key),
        overallConfidence: round(confidence.overall, 2),
        statusOverride,
      });
    }

    recorder?.markProgress();
    controller.start("validateRecording");
    completePhase(controller, opts, "validateRecording");
    recorder?.setStage("validate_recording");
    const validation = analyzer.validateRecording(ctx);
    if (calibration?.mismatchCode === "CALIBRATION_CAMERA_MOVED") {
      if (!validation.issues.includes("CALIBRATION_CAMERA_MOVED")) {
        validation.issues.push("CALIBRATION_CAMERA_MOVED");
      }
      validation.retakeInstructions.push(QUALITY_ISSUE_LABELS.CALIBRATION_CAMERA_MOVED);
    }
    const decision = resolveAnalysisStatus({
      validationStatus: validation.status,
      metricsCount: adapterOut.metrics.length,
      confidence: confidence.overall,
    });
    const status: AnalysisStatus = statusOverride ?? decision.status;
    const extraIssues = statusOverride ? [] : decision.extraIssues;
    const windowWarning =
      status === "completed" && !motionWindowSummary.hasSufficientMargins
        ? (["TEST_WINDOW_INCOMPLETE"] as const)
        : [];
    const qualityIssues = [...validation.issues, ...extraIssues, ...windowWarning];
    const retakeInstructions = [
      ...validation.retakeInstructions,
      ...extraIssues.map((issue) => QUALITY_ISSUE_LABELS[issue]),
      ...windowWarning.map((issue) => QUALITY_ISSUE_LABELS[issue]),
    ];
    const finalErrorCode = qualityIssues[0] ?? null;
    if (status === "completed") {
      controller.complete("validateRecording", { status, finalErrorCode: null });
    } else {
      controller.fail("validateRecording", finalErrorCode ?? status, { status, finalErrorCode });
    }
    controller.finish();

    return {
      analysisId: analysisRunId,
      testType: opts.testType,
      status,
      videoMetadata: metadataResult(metadata),
      keyEvents: visibleEvents(events),
      metrics: adapterOut.metrics,
      overallConfidence: confidence.overall,
      qualityIssues: [
        ...new Set(qualityIssues.map((issue) => QUALITY_ISSUE_LABELS[issue] ?? issue)),
      ],
      retakeInstructions: [...new Set(retakeInstructions)],
      analyzerVersion: analyzer.analyzerVersion,
      decodedFrames,
      analyzedFrames: poseOut.analyzedFrames,
      recognition: recognitionSummary,
      measurement,
      calibration: {
        usedHomography: isSpatial && !!calibration?.homography && adapterOut.metrics.length > 0,
        profileId: calibration?.profileId ?? null,
        calibrationHash: calibration?.calibrationHash ?? null,
        reprojectionErrorPx: calibration?.profileMatch?.reprojectionErrorPx ?? null,
        mismatchCode: calibration?.mismatchCode ?? null,
        cameraMoved: !!calibration?.cameraMoved,
        homography: calibration?.homography ? [...calibration.homography] : null,
      },
      motionWindow: motionWindowSummary,
      pipelineTrace: controller.trace(),
      frameLog: poseOut.frameLog,
      ...(opts.debugDiagnostics
        ? {
            diagnostics: buildVisionDiagnostics({
              analysisRunId,
              opts,
              metadata,
              poseOut,
              movementSignals,
              recognition,
              calibration,
              controller,
            }),
          }
        : {}),
      ...(recorder ? { timeoutDiagnostics: recorder.snapshot() } : {}),
    };
  } catch (error) {
    opts.onPhase?.("error");
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : null;
    const frameCode = isFrameTimestampOrderError(error) ? "FRAME_TIMESTAMP_ORDER_ERROR" : null;
    const finalCode = frameCode ?? code ?? "ANALYSIS_FAILED";
    const message =
      frameCode === "FRAME_TIMESTAMP_ORDER_ERROR"
        ? FRAME_TIMESTAMP_ORDER_USER_MESSAGE
        : error instanceof Error
          ? error.message
          : "Nieznany błąd analizy.";
    controller.fail(controller.snapshot().currentStage as PipelineStageName, finalCode, {
      message,
    });
    return failResult(
      opts.testType,
      analyzer?.analyzerVersion ?? "none",
      finalCode === "FRAME_TIMESTAMP_ORDER_ERROR" ? FRAME_TIMESTAMP_ORDER_USER_MESSAGE : message,
      finalCode,
      analysisRunId,
      controller,
      recorder ? { timeoutDiagnostics: recorder.snapshot() } : undefined,
    );
  } finally {
    flushPoseDebugLog(analysisRunId);
    await closePoseEngine(analysisRunId);
  }
}
