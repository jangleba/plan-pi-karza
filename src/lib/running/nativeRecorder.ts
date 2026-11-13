import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { buildKilometerSplits, sanitizeRoute } from "./metrics";
import type { RoutePoint, RunningActivityDraft, RunningIntervalResult } from "./types";

export interface NativeRunState {
  present: boolean;
  ownerId?: string;
  sessionId?: string;
  date?: string;
  startedAt?: string;
  endedAt?: string;
  phase?: "recording" | "paused" | "review";
  durationSec?: number;
  distanceM?: number;
  pointCount?: number;
  recovered?: boolean;
  storageError?: string;
  intervalResults?: RunningIntervalResult[];
  /**
   * Trasa z telefonu: [lat, lng, czas uniksowy s, sekunda biegu, dokładność m, segment].
   * Natywny rejestrator oddaje ją tylko w podsumowaniu (phase "review").
   */
  route?: number[][];
  corruptCheckpoints?: Array<{ fileName: string; raw: string }>;
  guideState?: {
    started: boolean;
    complete: boolean;
    stepIndex: number;
    stepStartedElapsedSec: number;
    stepStartedDistanceM: number;
  };
}
export interface RunIdentity {
  ownerId: string;
  sessionId: string;
}
interface NativeRecorderPlugin {
  getState(options: RunIdentity): Promise<NativeRunState>;
  getOwnerState(options: { ownerId: string }): Promise<NativeRunState>;
  pauseOwner(options: { ownerId: string }): Promise<NativeRunState>;
  clearOwner(options: { ownerId: string }): Promise<{ present: false }>;
  quarantineCorruptCheckpoint(options: { confirm: true }): Promise<{ present: false }>;
  start(options: RunIdentity & { date: string }): Promise<NativeRunState>;
  pause(options: RunIdentity): Promise<NativeRunState>;
  resume(options: RunIdentity): Promise<NativeRunState>;
  finish(options: RunIdentity): Promise<NativeRunState>;
  clear(options: RunIdentity): Promise<{ present: false }>;
  updateIntervals(
    options: RunIdentity & Pick<NativeRunState, "intervalResults" | "guideState">,
  ): Promise<NativeRunState>;
  diagnostics(): Promise<Record<string, unknown>>;
  addListener(
    event: "runState",
    listener: (state: NativeRunState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "runError",
    listener: (event: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
}
export const nativeRecorder = registerPlugin<NativeRecorderPlugin>("BallwiseRuntime");
export function nativeRunningAvailable() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("BallwiseRuntime")
  );
}

/** Trasa zapisana przez natywny rejestrator (pozostaje w telefonie). */
export function nativeRoute(state: NativeRunState): RoutePoint[] {
  if (!Array.isArray(state.route)) return [];
  const points = state.route.flatMap((row): RoutePoint[] => {
    if (!Array.isArray(row) || row.length < 6) return [];
    const [lat, lng, at, elapsedSec, accuracyM, segment] = row.map(Number);
    if (![lat, lng, at, elapsedSec, accuracyM, segment].every(Number.isFinite)) return [];
    return [
      {
        lat,
        lng,
        recordedAt: new Date(at * 1000).toISOString(),
        elapsedSec,
        accuracyM,
        segment: Math.max(0, Math.round(segment)),
      },
    ];
  });
  return sanitizeRoute(points);
}

/** Wynik do zapisu: na konto trafiają agregaty; trasa i międzyczasy zostają w telefonie. */
export function nativeRunDraft(state: NativeRunState): RunningActivityDraft {
  if (
    !state.present ||
    !state.sessionId ||
    !state.date ||
    !state.startedAt ||
    !Number.isFinite(state.durationSec) ||
    !Number.isFinite(state.distanceM)
  )
    throw new Error("Nieprawidłowy szkic biegu.");
  const durationSec = Math.max(1, Math.round(state.durationSec!));
  const distanceM = Math.max(0, state.distanceM!);
  const route = nativeRoute(state);
  return {
    sessionId: state.sessionId,
    date: state.date,
    startedAt: state.startedAt,
    endedAt: state.endedAt ?? new Date().toISOString(),
    durationSec,
    distanceM,
    avgPaceSecPerKm: distanceM >= 50 ? (durationSec / distanceM) * 1000 : null,
    route,
    splits: buildKilometerSplits(route),
    intervalResults: state.intervalResults ?? [],
    source: "gps",
  };
}
