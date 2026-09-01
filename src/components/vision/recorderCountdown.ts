import type { LivePoseStatus } from "./visionLivePose";
import type { TestType } from "@/features/vision-analysis/types";

/** Czysta logika odliczania kamery sprintu — testowalna bez DOM. */

export const STABLE_POSE_MS = 1500;
export const COUNTDOWN_DIGIT_MS = 1000;
export const START_HOLD_MS = 600;
export const AUTO_RECORDING_SECONDS = 12;

/**
 * Krótkie próby kończą się automatycznie, zanim zawodnik podejdzie do telefonu.
 * Dzięki temu ruch ręki przy obiektywie nie trafia do okna analizy CMJ.
 */
export function autoRecordingSeconds(testType: TestType): number {
  if (["cmj", "squat_jump", "broad_jump", "single_leg_hop"].includes(testType)) return 6;
  if (testType === "drop_jump") return 8;
  if (testType === "analyze_gym_exercise") return 15;
  return AUTO_RECORDING_SECONDS;
}

export type CountdownState =
  { phase: "idle" } | { phase: "digit"; value: 3 | 2 | 1 } | { phase: "start" };

export interface CountdownCue {
  /** Częstotliwość beepu z AudioContext (podstawa sygnału). */
  frequency: number;
  durationMs: number;
  /** Czas trwania kroku przed przejściem dalej. */
  holdMs: number;
  label: string;
}

export const IDLE_COUNTDOWN: CountdownState = { phase: "idle" };

/** Kolejny krok odliczania. Zwraca null, gdy sekwencja się zakończyła. */
export function nextCountdownState(state: CountdownState): CountdownState | null {
  if (state.phase === "idle") return { phase: "digit", value: 3 };
  if (state.phase === "start") return null;
  if (state.value > 1) return { phase: "digit", value: (state.value - 1) as 3 | 2 | 1 };
  return { phase: "start" };
}

/** Sygnał dla danego kroku: cyfry krótkie, START dłuższy i wyższy. */
export function cueForCountdown(state: CountdownState): CountdownCue | null {
  if (state.phase === "idle") return null;
  if (state.phase === "start") {
    return { frequency: 980, durationMs: 450, holdMs: START_HOLD_MS, label: "START" };
  }
  return {
    frequency: 640 + (3 - state.value) * 90,
    durationMs: 150,
    holdMs: COUNTDOWN_DIGIT_MS,
    label: String(state.value),
  };
}

/** Pełna sekwencja 3 → 2 → 1 → START (używana w testach i dokumentacji). */
export function countdownSequence(): CountdownState[] {
  const steps: CountdownState[] = [];
  let current: CountdownState | null = nextCountdownState(IDLE_COUNTDOWN);
  while (current) {
    steps.push(current);
    current = nextCountdownState(current);
  }
  return steps;
}

/** Łączny czas widocznego odliczania od pierwszej cyfry do końca „START”. */
export function countdownTotalMs(): number {
  return countdownSequence().reduce(
    (total, step) => total + (cueForCountdown(step)?.holdMs ?? 0),
    0,
  );
}

/** Czy pozycja zawodnika jest wystarczająco stabilna, by uzbroić odliczanie. */
export function isAthleteReady(status: LivePoseStatus): boolean {
  return (
    status.detected &&
    status.singleAthlete &&
    status.fullBody &&
    status.timingReady &&
    status.confidence >= 0.35
  );
}

export type CameraErrorCode =
  | "PERMISSION_DENIED"
  | "NO_CAMERA"
  | "RECORDER_UNSUPPORTED"
  | "STREAM_INTERRUPTED"
  | "PREVIEW_BLOCKED"
  | "UNKNOWN";

const CAMERA_ERROR_MESSAGES: Record<CameraErrorCode, string> = {
  PERMISSION_DENIED:
    "Brak zgody na kamerę. Włącz dostęp do kamery dla BallWise w ustawieniach przeglądarki i spróbuj ponownie.",
  NO_CAMERA: "Nie znaleziono kamery w tym urządzeniu. Użyj filmu z galerii.",
  RECORDER_UNSUPPORTED:
    "Ta przeglądarka nie obsługuje nagrywania w aplikacji. Nagraj film aparatem i wybierz go z galerii.",
  STREAM_INTERRUPTED: "Połączenie z kamerą zostało przerwane. Uruchom kamerę ponownie.",
  PREVIEW_BLOCKED: "Podgląd kamery nie wystartował. Dotknij ekranu i spróbuj ponownie.",
  UNKNOWN: "Nie udało się uruchomić kamery. Spróbuj ponownie.",
};

/** Rozróżnia typowe błędy getUserMedia na konkretne kody. */
export function classifyCameraError(error: unknown): CameraErrorCode {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "PERMISSION_DENIED";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "NO_CAMERA";
  if (name === "NotReadableError" || name === "AbortError") return "STREAM_INTERRUPTED";
  return "UNKNOWN";
}

export function cameraErrorMessage(code: CameraErrorCode): string {
  return CAMERA_ERROR_MESSAGES[code];
}

/** Format licznika nagrywania (mm:ss). */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}
