/**
 * Diagnostyka przestoju / timeoutu Vision Lab (v2, dev-only).
 *
 * Ten moduł WYŁĄCZNIE zbiera dane — nie zmienia zachowania pipeline'u,
 * nie naprawia timeoutu i niczego nie optymalizuje. `TimeoutDiagnosticsRecorder`
 * jest mutowalnym, trzymanym w pamięci obiektem, aktualizowanym przez
 * `runVideoAnalysis` w trakcie przebiegu analizy. Dzięki temu, gdy UI (np.
 * `VisionAutoAnalysis`) przerwie oczekiwanie po 90s twardym limitem, wciąż
 * można odczytać AKTUALNY stan pipeline'u w momencie timeoutu — nawet jeśli
 * wewnętrzna obietnica analizy nigdy się nie rozstrzygnie.
 *
 * Brak persystencji: nic tu nie trafia do Supabase ani localStorage.
 */

/** Niskopoziomowy etap pipeline'u, w którym mógł wystąpić timeout. */
export type TimeoutStage =
  | "load_video"
  | "read_metadata"
  | "create_schedule"
  | "seek_frame"
  | "decode_frame"
  | "estimate_pose"
  | "recognize_protocol"
  | "calculate_result"
  | "validate_recording"
  | "unknown";

/** Klasyfikacja typu przestoju — wyłącznie opisowa, nie steruje logiką. */
export type TimeoutClassification =
  "seek_stall" | "decode_stall" | "pose_stall" | "slow_processing" | "no_progress" | "unknown";

export interface RepeatedCycleDiagnosticSummary {
  index: number;
  takeoffTime: number;
  landingTime: number;
  flightSeconds: number;
  contactSeconds: number | null;
  confidence: number;
}

export interface ProtocolRecognitionSummary {
  movementSignature: string | null;
  selectedTestType: string | null;
  recognizedTestType: string | null;
  detectedRepetitions: number | null;
  requiredRepetitions: number | null;
  protocolMatch: boolean | null;
  reason: string | null;
}

/** Pełny raport diagnostyczny timeoutu — snapshot stanu pipeline'u w danej chwili. */
export interface TimeoutDiagnosticsReport {
  analysisRunId: string;
  generatedAtMs: number;

  currentStage: TimeoutStage;
  currentOperation: string;
  elapsedAnalysisMs: number;
  elapsedStageMs: number;
  lastProgressAtMs: number | null;
  msSinceLastProgress: number | null;

  scheduledFrameCount: number;
  processedFrameCount: number;
  extractedFrameCount: number;
  poseFrameCount: number;
  lastSuccessfulFrameIndex: number | null;
  lastSuccessfulMediaTimeSeconds: number | null;
  lastSuccessfulScheduleIndex: number | null;

  currentScheduleIndex: number | null;
  currentFrameIndex: number | null;

  declaredFps: number | null;
  measuredFps: number | null;
  fpsSource: "measured" | "declared" | "unknown";

  poseDelegate: "GPU" | "CPU" | null;

  firstScheduledTimestampsMs: number[];
  lastScheduledTimestampsMs: number[];

  timestampCorrectionCount: number;
  timestampOrderErrorCount: number;

  poseErrorCount: number;

  airSegmentCount: number;
  contactCount: number;
  repeatedCycleCount: number;
  firstRepeatedCycles: RepeatedCycleDiagnosticSummary[];

  protocolRecognition: ProtocolRecognitionSummary | null;

  timeoutStageGuess: TimeoutStage;
  timeoutClassification: TimeoutClassification;
}

/** Próg (ms) braku postępu, powyżej którego uznajemy przebieg za "bez postępu". */
const NO_PROGRESS_THRESHOLD_MS = 5_000;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Klasyfikuje typ przestoju na podstawie ostatniego znanego etapu i tego,
 * jak dawno temu odnotowano postęp. Czysto opisowe — nie zmienia zachowania.
 */
export function classifyTimeout(
  stage: TimeoutStage,
  msSinceLastProgress: number | null,
): TimeoutClassification {
  if (msSinceLastProgress == null) return "unknown";
  if (msSinceLastProgress < NO_PROGRESS_THRESHOLD_MS) return "slow_processing";
  switch (stage) {
    case "seek_frame":
      return "seek_stall";
    case "decode_frame":
      return "decode_stall";
    case "estimate_pose":
      return "pose_stall";
    case "load_video":
    case "read_metadata":
    case "create_schedule":
    case "recognize_protocol":
    case "calculate_result":
    case "validate_recording":
      return "no_progress";
    default:
      return "unknown";
  }
}

/**
 * Rejestrator diagnostyki timeoutu Vision Lab. Instancja jest tworzona
 * przez wywołującego (UI) PRZED startem `runVideoAnalysis` i przekazywana
 * przez `RunOptions.timeoutRecorder`, dzięki czemu jej stan pozostaje
 * czytelny nawet po tym, jak zewnętrzny twardy limit czasu (90s) przerwie
 * oczekiwanie na wynik analizy.
 */
export class TimeoutDiagnosticsRecorder {
  readonly analysisRunId: string;
  private readonly startedAtMs = nowMs();
  private stageStartedAtMs = nowMs();
  private currentStage: TimeoutStage = "unknown";
  private currentOperation = "idle";
  private lastProgressAtMs: number | null = null;

  private scheduledFrameCount = 0;
  private processedFrameCount = 0;
  private extractedFrameCount = 0;
  private poseFrameCount = 0;
  private lastSuccessfulFrameIndex: number | null = null;
  private lastSuccessfulMediaTimeSeconds: number | null = null;
  private lastSuccessfulScheduleIndex: number | null = null;

  private currentScheduleIndex: number | null = null;
  private currentFrameIndex: number | null = null;

  private declaredFps: number | null = null;
  private measuredFps: number | null = null;
  private fpsSource: "measured" | "declared" | "unknown" = "unknown";

  private poseDelegate: "GPU" | "CPU" | null = null;

  private firstScheduledTimestampsMs: number[] = [];
  private lastScheduledTimestampsMs: number[] = [];

  private timestampCorrectionCount = 0;
  private timestampOrderErrorCount = 0;
  private poseErrorCount = 0;

  private airSegmentCount = 0;
  private contactCount = 0;
  private repeatedCycleCount = 0;
  private firstRepeatedCycles: RepeatedCycleDiagnosticSummary[] = [];

  private protocolRecognition: ProtocolRecognitionSummary | null = null;

  constructor(analysisRunId: string) {
    this.analysisRunId = analysisRunId;
  }

  /** Zmienia bieżący etap pipeline'u (poziom wysoki, do klasyfikacji timeoutu). */
  setStage(stage: TimeoutStage, operation: string = stage): void {
    this.currentStage = stage;
    this.currentOperation = operation;
    this.stageStartedAtMs = nowMs();
  }

  /** Zmienia bieżącą operację niskopoziomową (bez zmiany etapu). */
  setOperation(operation: string): void {
    this.currentOperation = operation;
  }

  /** Odnotowuje dowolny realny postęp (np. przetworzenie klatki). */
  markProgress(): void {
    this.lastProgressAtMs = nowMs();
  }

  setScheduleInfo(count: number, firstTimestampsMs: number[], lastTimestampsMs: number[]): void {
    this.scheduledFrameCount = count;
    this.firstScheduledTimestampsMs = firstTimestampsMs.slice(0, 10);
    this.lastScheduledTimestampsMs = lastTimestampsMs.slice(
      Math.max(0, lastTimestampsMs.length - 10),
    );
  }

  setCurrentIndices(scheduleIndex: number | null, frameIndex: number | null): void {
    this.currentScheduleIndex = scheduleIndex;
    this.currentFrameIndex = frameIndex;
  }

  setLastSuccessfulFrame(
    frameIndex: number,
    mediaTimeSeconds: number,
    scheduleIndex: number,
  ): void {
    this.lastSuccessfulFrameIndex = frameIndex;
    this.lastSuccessfulMediaTimeSeconds = mediaTimeSeconds;
    this.lastSuccessfulScheduleIndex = scheduleIndex;
  }

  incrementProcessedFrameCount(): void {
    this.processedFrameCount += 1;
  }

  incrementExtractedFrameCount(): void {
    this.extractedFrameCount += 1;
  }

  incrementPoseFrameCount(): void {
    this.poseFrameCount += 1;
  }

  incrementPoseErrorCount(): void {
    this.poseErrorCount += 1;
  }

  incrementTimestampOrderErrorCount(): void {
    this.timestampOrderErrorCount += 1;
  }

  setFpsInfo(
    declaredFps: number | null,
    measuredFps: number | null,
    source: "measured" | "declared",
  ): void {
    this.declaredFps = declaredFps;
    this.measuredFps = measuredFps;
    this.fpsSource = source;
  }

  setPoseDelegate(delegate: "GPU" | "CPU" | null): void {
    this.poseDelegate = delegate;
  }

  setTimestampCorrectionCount(count: number): void {
    this.timestampCorrectionCount = count;
  }

  setMovementCounts(
    airSegmentCount: number,
    contactCount: number,
    repeatedCycleCount: number,
  ): void {
    this.airSegmentCount = airSegmentCount;
    this.contactCount = contactCount;
    this.repeatedCycleCount = repeatedCycleCount;
  }

  setFirstRepeatedCycles(cycles: RepeatedCycleDiagnosticSummary[]): void {
    this.firstRepeatedCycles = cycles.slice(0, 5);
  }

  setProtocolRecognition(summary: ProtocolRecognitionSummary): void {
    this.protocolRecognition = summary;
  }

  /** Buduje pełny snapshot bieżącego stanu — bezpieczny do wywołania w dowolnej chwili. */
  snapshot(): TimeoutDiagnosticsReport {
    const now = nowMs();
    const msSinceLastProgress =
      this.lastProgressAtMs == null ? null : Math.round(now - this.lastProgressAtMs);
    const timeoutStageGuess = this.currentStage;
    return {
      analysisRunId: this.analysisRunId,
      generatedAtMs: Date.now(),
      currentStage: this.currentStage,
      currentOperation: this.currentOperation,
      elapsedAnalysisMs: Math.round(now - this.startedAtMs),
      elapsedStageMs: Math.round(now - this.stageStartedAtMs),
      lastProgressAtMs: this.lastProgressAtMs == null ? null : Math.round(this.lastProgressAtMs),
      msSinceLastProgress,
      scheduledFrameCount: this.scheduledFrameCount,
      processedFrameCount: this.processedFrameCount,
      extractedFrameCount: this.extractedFrameCount,
      poseFrameCount: this.poseFrameCount,
      lastSuccessfulFrameIndex: this.lastSuccessfulFrameIndex,
      lastSuccessfulMediaTimeSeconds: this.lastSuccessfulMediaTimeSeconds,
      lastSuccessfulScheduleIndex: this.lastSuccessfulScheduleIndex,
      currentScheduleIndex: this.currentScheduleIndex,
      currentFrameIndex: this.currentFrameIndex,
      declaredFps: this.declaredFps,
      measuredFps: this.measuredFps,
      fpsSource: this.fpsSource,
      poseDelegate: this.poseDelegate,
      firstScheduledTimestampsMs: [...this.firstScheduledTimestampsMs],
      lastScheduledTimestampsMs: [...this.lastScheduledTimestampsMs],
      timestampCorrectionCount: this.timestampCorrectionCount,
      timestampOrderErrorCount: this.timestampOrderErrorCount,
      poseErrorCount: this.poseErrorCount,
      airSegmentCount: this.airSegmentCount,
      contactCount: this.contactCount,
      repeatedCycleCount: this.repeatedCycleCount,
      firstRepeatedCycles: [...this.firstRepeatedCycles],
      protocolRecognition: this.protocolRecognition,
      timeoutStageGuess,
      timeoutClassification: classifyTimeout(timeoutStageGuess, msSinceLastProgress),
    };
  }
}
