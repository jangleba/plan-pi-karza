import { MIN_ACCEPTED_CAPTURE_FPS } from "./definitions";
import type { NativeVideoCapture } from "./types";

export class LabValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabValidationError";
  }
}

export function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new LabValidationError(`${label}: nieprawidłowa wartość.`);
}

export function assertFrameIndex(index: number, frameCount: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= frameCount) {
    throw new LabValidationError("Nieprawidłowy numer klatki filmu.");
  }
}

export function validateCaptureTiming(capture: NativeVideoCapture) {
  const times = capture.frameTimestampsSeconds;
  if (
    !Array.isArray(times) ||
    !Number.isSafeInteger(capture.frameCount) ||
    capture.frameCount < 2 ||
    times.length !== capture.frameCount
  ) {
    throw new LabValidationError("Brak kompletnej osi czasu klatek. Nagraj próbę ponownie.");
  }
  for (const [label, value] of Object.entries({
    FPS: capture.fps,
    nominalFps: capture.nominalFps,
    duration: capture.durationSeconds,
    width: capture.width,
    height: capture.height,
  })) {
    finite(value, label);
    if (value <= 0) throw new LabValidationError("Nieprawidłowe dane nagrania.");
  }
  const gaps: number[] = [];
  times.forEach((time, index) => {
    finite(time, "Czas klatki");
    if (time < 0 || (index > 0 && time <= times[index - 1])) {
      throw new LabValidationError("Oś czasu zawiera odwrócone lub powtórzone klatki.");
    }
    if (index > 0) gaps.push(time - times[index - 1]);
  });
  const sorted = [...gaps].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianFrameDurationSeconds =
    sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const maxFrameGapSeconds = Math.max(...gaps);
  const span = times[times.length - 1] - times[0];
  const observedFps = (times.length - 1) / span;
  // Tolerance covers floating-point conversion of CMTime, not a missing frame.
  if (maxFrameGapSeconds > medianFrameDurationSeconds * 1.5 + 1e-9) {
    throw new LabValidationError("Nagranie zawiera brakujące klatki. Nagraj próbę ponownie.");
  }
  if (
    observedFps < MIN_ACCEPTED_CAPTURE_FPS - 1e-6 ||
    observedFps > 1000 ||
    capture.nominalFps < MIN_ACCEPTED_CAPTURE_FPS ||
    capture.nominalFps > 1000 ||
    Math.abs(capture.fps - observedFps) > 0.01 ||
    span > capture.durationSeconds + 1e-9
  ) {
    throw new LabValidationError("Nagranie nie ma zweryfikowanego 240 FPS lub poprawnego czasu.");
  }
  return { observedFps, medianFrameDurationSeconds, maxFrameGapSeconds };
}
