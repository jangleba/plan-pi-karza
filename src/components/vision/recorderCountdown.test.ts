import { describe, expect, it } from "vitest";
import {
  AUTO_RECORDING_SECONDS,
  COUNTDOWN_DIGIT_MS,
  START_HOLD_MS,
  STABLE_POSE_MS,
  classifyCameraError,
  countdownSequence,
  countdownTotalMs,
  formatElapsed,
  isAthleteReady,
} from "./recorderCountdown";
import type { LivePoseStatus } from "./visionLivePose";
import { requiredRecordingOrientation } from "./VisionRecorder";

const READY_POSE: LivePoseStatus = {
  detected: true,
  singleAthlete: true,
  fullBody: true,
  timingReady: true,
  mechanicsReady: true,
  confidence: 0.8,
  silhouetteFraction: 0.45,
};

describe("recorderCountdown", () => {
  it("prowadzi dokładnie przez 3, 2, 1 i START", () => {
    expect(countdownSequence()).toEqual([
      { phase: "digit", value: 3 },
      { phase: "digit", value: 2 },
      { phase: "digit", value: 1 },
      { phase: "start" },
    ]);
    expect(countdownTotalMs()).toBe(3 * COUNTDOWN_DIGIT_MS + START_HOLD_MS);
  });

  it("utrzymuje uzgodnione czasy stabilizacji i automatycznego nagrania", () => {
    expect(STABLE_POSE_MS).toBe(1500);
    expect(AUTO_RECORDING_SECONDS).toBe(12);
  });

  it("uzbraja start tylko dla jednego, kompletnego i pewnego zawodnika", () => {
    expect(isAthleteReady(READY_POSE)).toBe(true);
    expect(isAthleteReady({ ...READY_POSE, singleAthlete: false })).toBe(false);
    expect(isAthleteReady({ ...READY_POSE, fullBody: false })).toBe(false);
    expect(isAthleteReady({ ...READY_POSE, confidence: 0.34 })).toBe(false);
  });

  it("rozróżnia typowe błędy uprawnień i sprzętu", () => {
    expect(classifyCameraError({ name: "NotAllowedError" })).toBe("PERMISSION_DENIED");
    expect(classifyCameraError({ name: "NotFoundError" })).toBe("NO_CAMERA");
    expect(classifyCameraError({ name: "NotReadableError" })).toBe("STREAM_INTERRUPTED");
    expect(classifyCameraError(new Error("x"))).toBe("UNKNOWN");
  });

  it("formatuje licznik nagrania bez wartości ujemnych", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65.9)).toBe("1:05");
    expect(formatElapsed(-2)).toBe("0:00");
  });

  it("ustawia pion dla skoków i poziom dla testów biegowych", () => {
    expect(requiredRecordingOrientation("cmj")).toBe("portrait");
    expect(requiredRecordingOrientation("drop_jump")).toBe("portrait");
    expect(requiredRecordingOrientation("pogo_jumps")).toBe("portrait");
    expect(requiredRecordingOrientation("sprint_20m")).toBe("landscape");
    expect(requiredRecordingOrientation("five_ten_five")).toBe("landscape");
    expect(requiredRecordingOrientation("sprint_to_stop")).toBe("landscape");
  });
});
