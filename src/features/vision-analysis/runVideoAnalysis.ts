import type {
  TestType,
  CameraSetup,
  Calibration,
  FramePose,
  AnalysisContext,
  VideoAnalysisResult,
  AnalysisStatus,
} from "./types";
import { QUALITY_ISSUE_LABELS } from "./types";
import { resolveAnalysisStatus } from "./statusPolicy";
import { getAnalyzer } from "./testAnalyzerRegistry";
import { readVideoMetadata, iterateFrames } from "./videoFrameReader";
import {
  clearPoseDebugLog,
  closePoseEngine,
  detectPose,
  flushPoseDebugLog,
  FRAME_TIMESTAMP_ORDER_USER_MESSAGE,
  isPoseSupported,
} from "./poseEngine";
import { round } from "./physics";
import { vlog } from "./devLog";
import type { LensType, CaptureOrientation } from "./calibrationProfiles";
import { matchCalibrationForRecording } from "@/lib/vision/calibrationStore";

export type AnalysisPhase =
  | "idle"
  | "loading_file"
  | "metadata_ready"
  | "extracting_frames"
  | "pose_analysis"
  | "calculating_result"
  | "completed"
  | "error";

export interface RunOptions {
  testType: TestType;
  videoUrl: string;
  declaredFps: number | null;
  cameraSetup: CameraSetup;
  calibration?: Calibration | null;
  /** Rzeczywisty wzrost zawodnika (cm) do auto-kalibracji skali. */
  athleteHeightCm?: number | null;
  /** Wskazówki do automatycznego dopasowania profilu kalibracji. */
  deviceId?: string | null;
  lens?: LensType | null;
  /** Zoom nagrania (1 = brak). */
  zoom?: number | null;
  abortSignal?: AbortSignal;
  onPhase?: (phase: AnalysisPhase) => void;
  onProgress?: (fraction: number) => void; // 0-1, oparte na przetworzonych klatkach
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failed(
  testType: TestType,
  analyzerVersion: string,
  reason: string,
  code = "ANALYSIS_FAILED",
  analysisId = uuid(),
): VideoAnalysisResult {
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
  };
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
    /INVALID_ARGUMENT|CalculatorGraph|timestamp mismatch|WaitUntilIdle|graph_utils\.cc/i.test(message)
  );
}

/**
 * Pełny pipeline: metadata → dekodowanie klatek → poza → detekcja zdarzeń →
 * obliczenia → walidacja. Nigdy nie zwraca statusu "completed" bez metryk.
 */
export async function runVideoAnalysis(opts: RunOptions): Promise<VideoAnalysisResult> {
  const analysisRunId = uuid();
  clearPoseDebugLog();
  await closePoseEngine();
  throwIfAborted(opts.abortSignal);
  const analyzer = getAnalyzer(opts.testType);
  if (!analyzer)
    return failed(
      opts.testType,
      "none",
      "Brak analizatora dla tego testu.",
      "ANALYZER_NOT_FOUND",
      analysisRunId,
    );
  if (!isPoseSupported())
    return failed(
      opts.testType,
      analyzer.analyzerVersion,
      "Analiza wideo nie jest wspierana w tej przeglądarce.",
      "BROWSER_NOT_SUPPORTED",
      analysisRunId,
    );

  try {
    throwIfAborted(opts.abortSignal);
    opts.onPhase?.("loading_file");
    const metadata = await readVideoMetadata(opts.videoUrl, opts.declaredFps);
    throwIfAborted(opts.abortSignal);
    if (metadata.frameCount <= 0) {
      return failed(
        opts.testType,
        analyzer.analyzerVersion,
        "Nie udało się odczytać klatek wideo.",
        "NO_FRAMES",
        analysisRunId,
      );
    }

    opts.onPhase?.("metadata_ready");
    await new Promise((resolve) => setTimeout(resolve, 0));

    opts.onPhase?.("extracting_frames");
    const poses: FramePose[] = [];
    let posePhaseSent = false;
    let lastAcceptedSourceTimestampUs = -1;
    await iterateFrames(
      opts.videoUrl,
      metadata,
      async ({ frameIndex, sourceFrameIndex, mediaTime, sourceTimestampMs, sourceTimestampUs, video }) => {
        throwIfAborted(opts.abortSignal);
        // Deduplikacja po źródłowym timestampie (mikrosekundy) — gwarantuje ten
        // sam zestaw klatek między uruchomieniami.
        if (sourceTimestampUs <= lastAcceptedSourceTimestampUs) {
          return;
        }
        lastAcceptedSourceTimestampUs = sourceTimestampUs;
        if (!posePhaseSent) {
          posePhaseSent = true;
          opts.onPhase?.("pose_analysis");
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const pose = await detectPose(video, frameIndex, mediaTime, {
          analysisRunId,
          passType: "coarse",
          sourceTimestampMs,
          sourceTimestampUs,
          sourceFrameIndex,
        });
        poses.push(pose);
      },
      (processed, total) => opts.onProgress?.(Math.min(1, processed / total)),
      opts.abortSignal,
    );
    throwIfAborted(opts.abortSignal);

    if (poses.length === 0) {
      return failed(
        opts.testType,
        analyzer.analyzerVersion,
        "Nie udało się zdekodować żadnej klatki.",
        "NO_DECODED_FRAMES",
        analysisRunId,
      );
    }

    const ctx: AnalysisContext = {
      testType: opts.testType,
      metadata,
      poses,
      cameraSetup: opts.cameraSetup,
      calibration: opts.calibration ?? null,
      athleteHeightCm: opts.athleteHeightCm ?? null,
    };

    opts.onPhase?.("calculating_result");
    const events = await analyzer.detectKeyEvents(ctx);
    let metrics = analyzer.calculateMetrics(events, ctx);
    const confidence = analyzer.calculateConfidence(events, ctx);
    const validation = analyzer.validateRecording(ctx);

    // Warstwa rzetelności pomiaru — niepewność, poziom jakości, powtarzalność.
    let measurement: VideoAnalysisResult["measurement"];
    if (analyzer.computeAccuracy && metrics.length > 0) {
      const acc = analyzer.computeAccuracy(events, metrics, ctx);
      measurement = acc.measurement;
      metrics = acc.metrics;
    }

    // Ustalenie statusu — jedna, wspólna, testowana polityka.
    const decision = resolveAnalysisStatus({
      validationStatus: validation.status,
      metricsCount: metrics.length,
      confidence: confidence.overall,
    });
    const status: AnalysisStatus = decision.status;
    const qualityIssues = [...validation.issues, ...decision.extraIssues];
    const retakeInstructions = [
      ...validation.retakeInstructions,
      ...decision.extraIssues.map((i) => QUALITY_ISSUE_LABELS[i]),
    ];

    opts.onPhase?.("completed");
    return {
      analysisId: analysisRunId,
      testType: opts.testType,
      status,
      videoMetadata: {
        fps: metadata.fps,
        durationSeconds: round(metadata.durationSeconds, 2),
        frameCount: metadata.frameCount,
        width: metadata.width,
        height: metadata.height,
      },
      keyEvents: events.map((e) => ({
        type: e.type,
        frameIndex: e.frameIndex,
        timestampSeconds: round(e.timestampSeconds, 3),
        confidence: round(e.confidence, 2),
      })),
      metrics,
      overallConfidence: confidence.overall,
      qualityIssues: [...new Set(qualityIssues.map((i) => QUALITY_ISSUE_LABELS[i] ?? i))],
      retakeInstructions: [...new Set(retakeInstructions)],
      analyzerVersion: analyzer.analyzerVersion,
      measurement,
    };
  } catch (e) {
    opts.onPhase?.("error");
    if (isFrameTimestampOrderError(e)) {
      return failed(
        opts.testType,
        analyzer.analyzerVersion,
        FRAME_TIMESTAMP_ORDER_USER_MESSAGE,
        "FRAME_TIMESTAMP_ORDER_ERROR",
        analysisRunId,
      );
    }
    // VideoLoadError niesie konkretny errorCode — pokazujemy go użytkownikowi.
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : null;
    const base = e instanceof Error ? e.message : "Nieznany błąd analizy.";
    const msg = code ? `${base} (kod: ${code})` : base;
    return failed(opts.testType, analyzer.analyzerVersion, msg, code ?? "ANALYSIS_FAILED", analysisRunId);
  } finally {
    flushPoseDebugLog(analysisRunId);
    await closePoseEngine(analysisRunId);
  }
}
