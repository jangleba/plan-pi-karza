import { createAttemptPlan, createLabResult } from "./engine";
import type { LabResult, LabTestId, NativeVideoCapture } from "./types";

export function captureFixture(fps = 240, count = 1600, offset = 0): NativeVideoCapture {
  return {
    path: "/tmp/lab-fixture.mov",
    fps,
    nominalFps: fps,
    frameCount: count,
    durationSeconds: count / fps,
    width: 1920,
    height: 1080,
    frameTimestampsSeconds: Array.from({ length: count }, (_, index) => offset + index / fps),
  };
}

export function resultFixture(
  testId: LabTestId = "cmj",
  overrides: Partial<LabResult> = {},
): LabResult {
  return {
    ...createLabResult({
      userId: "00000000-0000-4000-8000-000000000001",
      batchId: "00000000-0000-4000-8000-000000000002",
      attempt: createAttemptPlan([testId])[0],
      capture: captureFixture(),
      firstFrame: 100,
      secondFrame: testId.includes("cmj") ? 220 : 580,
      trimStartFrame: 0,
      trimEndFrame: 1599,
      firstGuidePosition: 0.3,
      secondGuidePosition: 0.7,
    }),
    ...overrides,
  };
}
