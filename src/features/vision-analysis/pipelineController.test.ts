import { describe, expect, it } from "vitest";
import { AnalysisPipelineController } from "./AnalysisPipelineController";

describe("AnalysisPipelineController", () => {
  it("clamps progress to 0..totalUnits", () => {
    const controller = new AnalysisPipelineController("run-controller-clamp");
    controller.start("extractFrames", 10);

    controller.progress("extractFrames", 14, 10);
    expect(controller.snapshot().stages.extractFrames.completedUnits).toBe(10);

    controller.progress("extractFrames", -4, 10);
    expect(controller.snapshot().stages.extractFrames.completedUnits).toBe(0);
  });

  it("requires a running stage and real output before complete", () => {
    const controller = new AnalysisPipelineController("run-controller-complete");

    expect(() => controller.complete("extractFrames", { processedScheduleFrames: 1 })).toThrow(
      "PIPELINE_STAGE_NOT_RUNNING:extractFrames",
    );

    controller.start("extractFrames", 2);
    expect(() => controller.complete("extractFrames", {})).toThrow(
      "PIPELINE_STAGE_OUTPUT_REQUIRED:extractFrames",
    );

    controller.complete("extractFrames", { scheduledFrames: 2, processedScheduleFrames: 2 });
    const stage = controller.snapshot().stages.extractFrames;
    expect(stage.status).toBe("completed");
    expect(stage.completedUnits).toBe(stage.totalUnits);
  });

  it("does not mark the run completed while required stages are pending, running or failed", () => {
    const controller = new AnalysisPipelineController("run-controller-finish");
    controller.start("loadVideo");
    controller.complete("loadVideo", { filePresent: true });

    controller.finish();

    expect(controller.snapshot().currentStage).toBe("loadVideo");
  });
});