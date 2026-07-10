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
import { detectPose, isPoseSupported } from "./poseEngine";
import { round } from "./physics";

export type AnalysisPhase =
  | "reading_metadata"
  | "decoding_frames"
  | "detecting_events"
  | "calculating"
  | "validating"
  | "done";

export interface RunOptions {
  testType: TestType;
  videoUrl: string;
  declaredFps: number | null;
  cameraSetup: CameraSetup;
  calibration?: Calibration | null;
  /** Rzeczywisty wzrost zawodnika (cm) do auto-kalibracji skali. */
  athleteHeightCm?: number | null;
  onPhase?: (phase: AnalysisPhase) => void;
  onProgress?: (fraction: number) => void; // 0-1, oparte na przetworzonych klatkach
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function failed(testType: TestType, analyzerVersion: string, reason: string): VideoAnalysisResult {
  return {
    analysisId: uuid(),
    testType,
    status: "failed",
    videoMetadata: { fps: 0, durationSeconds: 0, frameCount: 0, width: 0, height: 0 },
    keyEvents: [],
    metrics: [],
    overallConfidence: 0,
    qualityIssues: [reason],
    retakeInstructions: [reason],
    analyzerVersion,
  };
}

/**
 * Pełny pipeline: metadata → dekodowanie klatek → poza → detekcja zdarzeń →
 * obliczenia → walidacja. Nigdy nie zwraca statusu "completed" bez metryk.
 */
export async function runVideoAnalysis(opts: RunOptions): Promise<VideoAnalysisResult> {
  const analyzer = getAnalyzer(opts.testType);
  if (!analyzer) return failed(opts.testType, "none", "Brak analizatora dla tego testu.");
  if (!isPoseSupported())
    return failed(
      opts.testType,
      analyzer.analyzerVersion,
      "Analiza wideo nie jest wspierana w tej przeglądarce.",
    );

  try {
    opts.onPhase?.("reading_metadata");
    const metadata = await readVideoMetadata(opts.videoUrl, opts.declaredFps);
    if (metadata.frameCount <= 0) {
      return failed(
        opts.testType,
        analyzer.analyzerVersion,
        "Nie udało się odczytać klatek wideo.",
      );
    }

    opts.onPhase?.("decoding_frames");
    const poses: FramePose[] = [];
    await iterateFrames(
      opts.videoUrl,
      metadata,
      async ({ frameIndex, mediaTime, video }) => {
        const pose = await detectPose(video, frameIndex, mediaTime);
        poses.push(pose);
      },
      (processed, total) => opts.onProgress?.(Math.min(1, processed / total)),
    );

    if (poses.length === 0) {
      return failed(
        opts.testType,
        analyzer.analyzerVersion,
        "Nie udało się zdekodować żadnej klatki.",
      );
    }

    const ctx: AnalysisContext = {
      testType: opts.testType,
      metadata,
      poses,
      cameraSetup: opts.cameraSetup,
      calibration: opts.calibration ?? null,
    };

    opts.onPhase?.("detecting_events");
    const events = await analyzer.detectKeyEvents(ctx);

    opts.onPhase?.("calculating");
    const metrics = analyzer.calculateMetrics(events, ctx);
    const confidence = analyzer.calculateConfidence(events, ctx);

    opts.onPhase?.("validating");
    const validation = analyzer.validateRecording(ctx);

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

    opts.onPhase?.("done");
    return {
      analysisId: uuid(),
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
    };
  } catch (e) {
    // VideoLoadError niesie konkretny errorCode — pokazujemy go użytkownikowi.
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : null;
    const base = e instanceof Error ? e.message : "Nieznany błąd analizy.";
    const msg = code ? `${base} (kod: ${code})` : base;
    return failed(opts.testType, analyzer.analyzerVersion, msg);
  }
}
