import type { VisionCameraView } from "./types";

/** Prosty stan przejścia przez flow (setup → upload → analysis). Trzymany w pamięci. */
export interface VisionFlowState {
  setup: Partial<{
    lightingOk: boolean;
    cameraStable: boolean;
    athleteInFrame: boolean;
    feetVisible: boolean;
    lineVisible: boolean;
    angleOk: boolean;
    groundContactClear: boolean;
  }>;
  file: File | null;
  fileName: string | null;
  videoUrl: string | null;
  uploaded: boolean;
  /** Faktyczny FPS zgłoszony przez kamerę; null oznacza brak zaufanego źródła. */
  fps: number | null;
  cameraView: VisionCameraView | null;
}

const store: Record<string, VisionFlowState> = {};

export function getFlow(testId: string): VisionFlowState {
  if (!store[testId]) {
    store[testId] = {
      setup: {},
      file: null,
      fileName: null,
      videoUrl: null,
      uploaded: false,
      fps: null,
      cameraView: null,
    };
  }
  return store[testId];
}

export function updateFlow(testId: string, patch: Partial<VisionFlowState>): void {
  store[testId] = { ...getFlow(testId), ...patch };
}

export function resetFlow(testId: string): void {
  delete store[testId];
}
