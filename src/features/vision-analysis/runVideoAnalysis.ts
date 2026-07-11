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
import { matchCalibrationStrictForRecording } from "@/lib/vision/calibrationStore";
import { recognizeTestProtocol } from "./testProtocolRecognizer";

/** Testy, których wynik przestrzenny (mm/cm/m, m/s, km/h) wymaga homografii. */
export const SPATIAL_TESTS: ReadonlySet<TestType> = new Set<TestType>([
  "broad_jump",
  "sprint_20m",
  "sprint_30m",
]);

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
  /** Aparat przedni / tylny (do ścisłego dopasowania profilu). */
  facing?: "front" | "back" | null;
  /** Czy kamera pozostała nieruchoma po kalibracji (walidacja kadru). */
  cameraStable?: boolean | null;
  /** Hash filmu (kalibracja sceny jest powiązana z konkretnym nagraniem). */
  videoHash?: string | null;
  /** Kalibracja sceny przypisana do tego filmu (per-video, ma pierwszeństwo). */
  calibrationRecord?: import("./videoCalibration").CalibrationRecord | null;
  /** Analiza wyłącznie techniki (bez wyniku przestrzennego cm/m/prędkości). */
  techniqueOnly?: boolean;
  abortSignal?: AbortSignal;
  onPhase?: (phase: AnalysisPhase) => void;
  onProgress?: (fraction: number) => void; // 0-1, oparte na przetworzonych klatkach
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Ścisłe rozwiązanie kalibracji dla bieżącego nagrania.
 *
 * Dla testów PRZESTRZENNYCH profil może zostać użyty WYŁĄCZNIE przy pełnej
 * zgodności (urządzenie, aparat, obiektyw, orientacja, rozdzielczość, FPS,
 * zoom, wersja). Przy jakiejkolwiek niezgodności ustawiamy mismatchCode i
 * NIE dostarczamy skali/homografii — wynik przestrzenny zostanie zablokowany.
 */
function resolveCalibration(
  opts: RunOptions,
  orientation: "portrait" | "landscape" | "square",
  measuredFps: number,
  resolution: string,
): Calibration | null {
  const base: Calibration = { ...(opts.calibration ?? {}) };
  const isSpatial = SPATIAL_TESTS.has(opts.testType);

  // 1) Kalibracja sceny przypisana do TEGO filmu ma bezwzględne pierwszeństwo.
  const record = opts.calibrationRecord ?? null;
  if (record?.homographyMatrix && record.spatialResultStatus === "OFFICIAL") {
    vlog("calibration_video", "użyto kalibracji sceny filmu", {
      calibrationId: record.calibrationId,
      reprojectionErrorPx: record.reprojectionErrorPx,
    });
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

  // Ręczna kalibracja linii/punktów ma pierwszeństwo (świadomy wybór trenera).
  const hasManual = !!base.referencePoints || (base.startLineX != null && base.finishLineX != null);

  const deviceId = opts.deviceId ?? null;
  const fps = Math.round(measuredFps > 0 ? measuredFps : opts.declaredFps ?? 0);
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
    vlog("calibration_profile", "profil ściśle dopasowany", {
      key: profile.key,
      reprojectionErrorPx: profile.reprojectionErrorPx,
    });
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
      base.metersPerPixel = profile.mmPerPixel / 1000; // mm/px → m/px
    }
    // Blokada po poruszeniu telefonu: caller potwierdza stabilność kadru.
    if (opts.cameraStable === false) {
      base.cameraMoved = true;
      base.mismatchCode = "CALIBRATION_CAMERA_MOVED";
    }
    return base;
  }

  // Brak kalibracji sceny i brak zgodnego profilu. NIE odrzucamy nagrania —
  // pipeline zdecyduje o statusie CALIBRATION_REQUIRED (ruch rozpoznany, ale
  // nie da się przeliczyć na cm/m bez skalibrowania podłoża tego filmu).
  if (isSpatial && !hasManual) {
    vlog("calibration_video", "brak kalibracji sceny — wymagana kalibracja filmu", {
      deviceId,
      fps,
    });
    return base;
  }

  return Object.keys(base).length > 0 ? base : opts.calibration ?? null;
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

    // Automatyczne dopasowanie profilu kalibracji do bieżącego nagrania na
    // podstawie urządzenia, obiektywu, orientacji, FPS i zoomu.
    const calibration = resolveCalibration(
      opts,
      metadata.orientation,
      metadata.fps,
      `${metadata.width}x${metadata.height}`,
    );

    const ctx: AnalysisContext = {
      testType: opts.testType,
      metadata,
      poses,
      cameraSetup: opts.cameraSetup,
      calibration,
      athleteHeightCm: opts.athleteHeightCm ?? null,
    };

    opts.onPhase?.("calculating_result");
    const events = await analyzer.detectKeyEvents(ctx);
    let metrics = analyzer.calculateMetrics(events, ctx);
    const confidence = analyzer.calculateConfidence(events, ctx);
    const validation = analyzer.validateRecording(ctx);

    // Polityka wyniku przestrzennego dla testów mierzących odległość/prędkość.
    const isSpatial = SPATIAL_TESTS.has(opts.testType);
    const hasSpatialCalibration = !!calibration?.homography && !calibration?.mismatchCode;
    const movementRecognized = events.length > 0;
    let statusOverride: AnalysisStatus | null = null;

    if (isSpatial) {
      // Ruch kamery po kalibracji unieważnia pomiar.
      if (calibration?.mismatchCode === "CALIBRATION_CAMERA_MOVED") {
        metrics = [];
        if (!validation.issues.includes("CALIBRATION_CAMERA_MOVED"))
          validation.issues.push("CALIBRATION_CAMERA_MOVED");
        validation.retakeInstructions.push(QUALITY_ISSUE_LABELS.CALIBRATION_CAMERA_MOVED);
        statusOverride = "invalid_recording";
      } else if (opts.techniqueOnly) {
        // Świadomy wybór: analiza tylko techniki, bez cm/m/prędkości.
        metrics = [];
        statusOverride = "technique_only";
      } else if (!hasSpatialCalibration && movementRecognized) {
        // Ruch rozpoznany, ale podłoże tego filmu nie jest skalibrowane.
        metrics = [];
        statusOverride = "calibration_required";
      }
    }

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
    const status: AnalysisStatus = statusOverride ?? decision.status;
    // Przy override statusu (calibration_required / technique_only) nie dodajemy
    // szumu EVENTS_NOT_DETECTED — ruch został rozpoznany.
    const extraIssues = statusOverride ? [] : decision.extraIssues;
    const qualityIssues = [...validation.issues, ...extraIssues];
    const retakeInstructions = [
      ...validation.retakeInstructions,
      ...extraIssues.map((i) => QUALITY_ISSUE_LABELS[i]),
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
      calibration: {
        usedHomography:
          SPATIAL_TESTS.has(opts.testType) && !!calibration?.homography && metrics.length > 0,
        profileId: calibration?.profileId ?? null,
        calibrationHash: calibration?.calibrationHash ?? null,
        reprojectionErrorPx: calibration?.profileMatch?.reprojectionErrorPx ?? null,
        mismatchCode: calibration?.mismatchCode ?? null,
        cameraMoved: !!calibration?.cameraMoved,
        homography: calibration?.homography ? [...calibration.homography] : null,
      },
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
