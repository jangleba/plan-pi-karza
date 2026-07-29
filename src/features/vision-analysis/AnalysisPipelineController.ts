import type {
  AnalysisPhase,
  AnalysisPipelineSnapshot,
  PipelineStageName,
  PipelineStageState,
} from "./types";

export const ANALYSIS_PIPELINE_STAGES: PipelineStageName[] = [
  "loadVideo",
  "readMetadata",
  "extractFrames",
  "estimatePose",
  "buildMovementSignals",
  "detectMovementEvents",
  "segmentAttempts",
  "validateProtocol",
  "calculateResult",
  "validateRecording",
];

function initialStage(name: PipelineStageName): PipelineStageState {
  return {
    name,
    status: "pending",
    completedUnits: 0,
    totalUnits: 1,
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class AnalysisPipelineController {
  readonly analysisRunId: string;
  private readonly t0 = nowMs();
  private currentStage: AnalysisPhase = "idle";
  private readonly stages: Record<PipelineStageName, PipelineStageState>;
  private readonly onUpdate?: (snapshot: AnalysisPipelineSnapshot) => void;

  constructor(
    analysisRunId: string,
    onUpdate?: (snapshot: AnalysisPipelineSnapshot) => void,
  ) {
    this.analysisRunId = analysisRunId;
    this.onUpdate = onUpdate;
    this.stages = ANALYSIS_PIPELINE_STAGES.reduce(
      (acc, stage) => {
        acc[stage] = initialStage(stage);
        return acc;
      },
      {} as Record<PipelineStageName, PipelineStageState>,
    );
    this.emit();
  }

  start(stage: PipelineStageName, totalUnits = 1): void {
    this.currentStage = stage;
    this.stages[stage] = {
      ...this.stages[stage],
      status: "running",
      completedUnits: 0,
      totalUnits: Math.max(1, totalUnits),
      output: undefined,
      error: undefined,
      startedAtMs: this.elapsed(),
      finishedAtMs: undefined,
    };
    this.emit();
  }

  progress(stage: PipelineStageName, completedUnits: number, totalUnits?: number): void {
    const current = this.stages[stage];
    if (current.status !== "running") return;
    this.stages[stage] = {
      ...current,
      completedUnits: Math.max(0, completedUnits),
      totalUnits: Math.max(1, totalUnits ?? current.totalUnits),
    };
    this.emit();
  }

  complete(stage: PipelineStageName, output: Record<string, unknown>, completedUnits?: number): void {
    const current = this.stages[stage];
    this.stages[stage] = {
      ...current,
      status: "completed",
      completedUnits: completedUnits ?? current.totalUnits,
      totalUnits: Math.max(1, current.totalUnits),
      output,
      error: undefined,
      finishedAtMs: this.elapsed(),
    };
    this.emit();
  }

  skip(stage: PipelineStageName, reason: string, output?: Record<string, unknown>): void {
    const current = this.stages[stage];
    this.stages[stage] = {
      ...current,
      status: "skipped",
      completedUnits: 0,
      totalUnits: Math.max(1, current.totalUnits),
      output,
      error: reason,
      startedAtMs: current.startedAtMs ?? this.elapsed(),
      finishedAtMs: this.elapsed(),
    };
    this.emit();
  }

  fail(stage: PipelineStageName, error: string, output?: Record<string, unknown>): void {
    const current = this.stages[stage];
    this.currentStage = stage;
    this.stages[stage] = {
      ...current,
      status: "failed",
      output,
      error,
      startedAtMs: current.startedAtMs ?? this.elapsed(),
      finishedAtMs: this.elapsed(),
    };
    this.emit();
  }

  finish(): void {
    this.currentStage = "completed";
    this.emit();
  }

  error(): void {
    this.currentStage = "error";
    this.emit();
  }

  snapshot(): AnalysisPipelineSnapshot {
    return {
      analysisRunId: this.analysisRunId,
      currentStage: this.currentStage,
      stages: { ...this.stages },
    };
  }

  trace(): import("./types").PipelineStageTrace[] {
    return ANALYSIS_PIPELINE_STAGES
      .map((stage) => this.stages[stage])
      .filter((stage) => stage.status !== "pending")
      .map((stage) => ({
        stage: stage.name,
        status: stage.status,
        startedAtMs: stage.startedAtMs ?? 0,
        finishedAtMs: stage.finishedAtMs ?? stage.startedAtMs ?? 0,
        output: stage.output,
        reason: stage.error,
      }));
  }

  private elapsed(): number {
    return Math.round(nowMs() - this.t0);
  }

  private emit(): void {
    this.onUpdate?.(this.snapshot());
  }
}