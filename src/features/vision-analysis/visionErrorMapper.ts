/**
 * VisionErrorMapper — jedno miejsce zamiany kodów błędów na komunikaty i akcje.
 * Bazuje na QUALITY_ISSUE_LABELS (types.ts) i dokłada sugerowaną akcję UI.
 */

import type { QualityIssueCode } from "./types";
import { QUALITY_ISSUE_LABELS } from "./types";

export type VisionErrorAction =
  | "recalibrate_video"
  | "retake"
  | "increase_fps"
  | "fix_camera"
  | "technique_only"
  | "none";

export interface MappedVisionError {
  code: QualityIssueCode;
  message: string;
  action: VisionErrorAction;
}

const ACTION_BY_CODE: Partial<Record<QualityIssueCode, VisionErrorAction>> = {
  NO_CALIBRATION: "recalibrate_video",
  CALIBRATION_PROFILE_MISMATCH: "recalibrate_video",
  TIMING_LINE_NOT_CALIBRATED: "recalibrate_video",
  TIMING_PLANE_CALIBRATION_FAILED: "recalibrate_video",
  CALIBRATION_CAMERA_MOVED: "fix_camera",
  INVALID_CAMERA_POSITION: "fix_camera",
  INSUFFICIENT_FPS: "increase_fps",
  CROSSING_UNCERTAINTY_TOO_HIGH: "increase_fps",
  TEST_PROTOCOL_MISMATCH: "retake",
  WRONG_REPETITION_COUNT: "retake",
  LINE_CROSSING_NOT_DETECTED: "retake",
  WRONG_CROSSING_DIRECTION: "retake",
  ATHLETE_OUT_OF_FRAME: "retake",
  MULTIPLE_PEOPLE: "retake",
  POSE_NOT_DETECTED: "retake",
  EVENTS_NOT_DETECTED: "retake",
  LOW_RESOLUTION: "retake",
};

export function mapVisionError(code: QualityIssueCode): MappedVisionError {
  return {
    code,
    message: QUALITY_ISSUE_LABELS[code] ?? code,
    action: ACTION_BY_CODE[code] ?? "none",
  };
}

export function mapVisionErrors(codes: QualityIssueCode[]): MappedVisionError[] {
  return [...new Set(codes)].map(mapVisionError);
}
