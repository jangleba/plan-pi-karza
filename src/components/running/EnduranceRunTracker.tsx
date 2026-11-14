import { RunRouteMap } from "./RunRouteMap";
import { isMasTestRecipe } from "@/lib/loadwise/engineV2/masTestRecipe";
import { measureMasEvidence, masEvidenceProblem } from "@/lib/running/masQuality";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, LocateFixed, Pause, Play, Save, SkipForward, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { activityDraftFromGpx } from "@/lib/running/gpx";
import {
  buildRunningActivityDraft,
  formatDistance,
  formatPace,
  formatRunDuration,
  haversineDistanceM,
  sanitizeRoute,
} from "@/lib/running/metrics";
import {
  buildIntervalResult,
  deriveRunningIntervalProtocol,
  intervalRemainingLabel,
  intervalStepProgress,
} from "@/lib/running/intervals";
import { classifyPace, vibrationForPace, type PaceGuidance } from "@/lib/running/paceGuidance";
import { vibrate } from "@/lib/haptics";
import { isTimedProtocol, stageLabel } from "@/lib/running/guideTimeline";
import {
  durationLabel,
  goalOf,
  guidePhases,
  nextName,
  padClock,
  stepTitle,
  untilLabel,
} from "./runGuideText";
import {
  currentKilometer,
  distanceAt,
  pushSample,
  samplesFromRoute,
  stablePace,
  type DistanceSample,
} from "@/lib/running/liveMetrics";
import { withMeasuredDistance } from "@/lib/running/intervals";
import { loadSignalOptions, signalStep, unlockSignals } from "@/lib/running/runSignals";
import {
  cancelLockScreenCues,
  ensureLockScreenPermission,
  planLockScreenCues,
  scheduleLockScreenCues,
} from "@/lib/running/lockScreenCues";
import {
  historyEntryFromDraft,
  removeRunFromHistory,
  saveRunToHistory,
} from "@/lib/running/routeHistory";
import { professionalSessionTitle } from "@/lib/loadwise/labels";
import type {
  RoutePoint,
  RunningActivity,
  RunningActivityDraft,
  RunningIntervalResult,
  RunningIntervalStep,
} from "@/lib/running/types";
import type { SessionDay } from "@/lib/loadwise/types";
import { RunActivitySummary } from "./RunActivitySummary";
import {
  nativeRecorder,
  nativeRunningAvailable,
  nativeRunDraft,
  nativeRoute,
  type NativeRunState,
} from "@/lib/running/nativeRecorder";
import {
  clearRunCheckpoint,
  loadRunCheckpoint,
  saveRunCheckpoint,
  quarantineRunCheckpoint,
} from "@/lib/running/runCheckpoint";

type TrackerPhase = "idle" | "recording" | "paused" | "review";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

function positionErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Dostęp do lokalizacji jest wyłączony. Zezwól BallWise na lokalizację i spróbuj ponownie.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Telefon nie może teraz ustalić pozycji. Wyjdź na otwartą przestrzeń i spróbuj ponownie.";
  }
  return "GPS nie odpowiedział na czas. Spróbuj ponownie na otwartej przestrzeni.";
}

/** Zmiana kroku w trybie GPS: te same sygnały co licznik, komenda głosowa zawsze. */
function announceStep(step: RunningIntervalStep | null) {
  if (typeof window === "undefined") return;
  signalStep(step, { ...loadSignalOptions(), voice: true });
}

/** Dystans kroków z dokładnej osi trasy (granice z czasu biegu). */
function remeasureIntervals(
  results: RunningIntervalResult[],
  samples: DistanceSample[],
): RunningIntervalResult[] {
  return results.map((result) =>
    result.startElapsedSec == null
      ? result
      : withMeasuredDistance(
          result,
          distanceAt(samples, result.startElapsedSec + result.durationSec) -
            distanceAt(samples, result.startElapsedSec),
        ),
  );
}

function RunTracker({
  ownerId,
  session,
  sessionId,
  date,
  canRecord,
  activity,
  onSave,
  onDelete,
  onFinish,
  onRecordingChange,
}: {
  ownerId?: string;
  session: SessionDay;
  sessionId: string;
  date: string;
  canRecord: boolean;
  activity: RunningActivity | null;
  onSave: (draft: RunningActivityDraft) => Promise<void>;
  onDelete: (activityId: string) => Promise<void>;
  onFinish?: (draft: RunningActivityDraft) => void;
  onRecordingChange?: (busy: boolean) => void;
}) {
  const intervalProtocol = useMemo(() => deriveRunningIntervalProtocol(session), [session]);
  /** Receptura czasowa: kroki wynikają z czasu biegu, więc prowadzenie działa też w tle. */
  const timedGuide = isTimedProtocol(intervalProtocol);
  const samplesRef = useRef<DistanceSample[]>([]);
  const isFieldMasTest =
    session.classification?.subcategory === "field_mas_test" ||
    isMasTestRecipe(session.runningRecipe);
  const masInterruptedRef = useRef(false);
  const [previewRoute, setPreviewRoute] = useState<RoutePoint[]>([]);
  const [gpsPreparing, setGpsPreparing] = useState(false);
  const [masCountdown, setMasCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const nativeMode = !!ownerId && nativeRunningAvailable();
  const nativeIdentity = { ownerId: ownerId ?? "", sessionId };
  const checkpointBlockedRef = useRef(false);
  const checkpointSourceRef = useRef<"native" | "web">("web");
  const [phase, setPhase] = useState<TrackerPhase>("idle");
  useEffect(() => {
    onRecordingChange?.(phase === "recording" || phase === "paused" || phase === "review");
  }, [phase, onRecordingChange]);
  const [routePointCount, setRoutePointCount] = useState(0);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  const finishingRef = useRef(false);
  const savingRef = useRef(false);
  const segmentRef = useRef(0);
  const [pending, setPending] = useState<RunningActivityDraft | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [intervalStepIndex, setIntervalStepIndex] = useState(0);
  const [guideStarted, setGuideStarted] = useState(false);
  const [guideComplete, setGuideComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRef = useRef<RoutePoint[]>([]);
  const distanceMRef = useRef(0);
  const phaseRef = useRef<TrackerPhase>("idle");
  const startedAtRef = useRef<string | null>(null);
  const segmentStartedMsRef = useRef(0);
  const accumulatedSecRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const intervalStepIndexRef = useRef(0);
  const intervalStepStartedElapsedRef = useRef(0);
  const intervalStepStartedDistanceRef = useRef(0);
  const intervalResultsRef = useRef<RunningIntervalResult[]>([]);
  const guideStartedRef = useRef(false);
  const guideCompleteRef = useRef(false);
  const paceStateRef = useRef<{ guidance: PaceGuidance; sinceSec: number; lastSignalSec: number }>({
    guidance: "unavailable",
    sinceSec: 0,
    lastSignalSec: -60,
  });

  const currentElapsed = useCallback(
    () =>
      accumulatedSecRef.current +
      (phaseRef.current === "recording" ? (Date.now() - segmentStartedMsRef.current) / 1_000 : 0),
    [],
  );

  const applyNativeState = useCallback(
    (value: NativeRunState) => {
      if (
        !mountedRef.current ||
        !value.present ||
        value.ownerId !== ownerId ||
        value.sessionId !== sessionId
      )
        return;
      accumulatedSecRef.current = value.durationSec ?? 0;
      segmentStartedMsRef.current = Date.now();
      distanceMRef.current = value.distanceM ?? 0;
      startedAtRef.current = value.startedAt ?? null;
      phaseRef.current = value.phase ?? "paused";
      intervalResultsRef.current = value.intervalResults ?? [];
      setPhase(value.phase ?? "paused");
      setElapsedSec(Math.round(value.durationSec ?? 0));
      setDistanceM(value.distanceM ?? 0);
      setRoutePointCount(value.pointCount ?? 0);
      if (value.livePoint) {
        const point = nativeRoute({ ...value, route: [value.livePoint] })[0];
        if (point && routeRef.current.at(-1)?.recordedAt !== point.recordedAt) {
          routeRef.current.push(point);
          setPreviewRoute([...routeRef.current]);
        }
      }
      if (value.recovered) masInterruptedRef.current = true;
      if (value.phase === "recording")
        samplesRef.current = pushSample(samplesRef.current, {
          elapsedSec: value.durationSec ?? 0,
          distanceM: value.distanceM ?? 0,
        });
      if (value.guideState) {
        const guide = value.guideState;
        guideStartedRef.current = guide.started;
        guideCompleteRef.current = guide.complete;
        intervalStepIndexRef.current = guide.stepIndex;
        intervalStepStartedElapsedRef.current = guide.stepStartedElapsedSec;
        intervalStepStartedDistanceRef.current = guide.stepStartedDistanceM;
        setGuideStarted(guide.started);
        setGuideComplete(guide.complete);
        setIntervalStepIndex(guide.stepIndex);
      }
      if (value.phase === "review") setPending(nativeRunDraft(value));
      if (value.storageError) setGpsError(value.storageError);
      else if (value.recovered)
        setGpsError("Odzyskano szkic biegu. Pomiar był przerwany; wznów go lub zapisz wynik.");
    },
    [ownerId, sessionId],
  );

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const identity = { ownerId, sessionId };
    const handles: Promise<{ remove(): Promise<void> }>[] = [];
    if (nativeMode) {
      void nativeRecorder
        .getState(identity)
        .then((value) => {
          if (active) applyNativeState(value);
        })
        .catch((error) => {
          if (active) {
            checkpointBlockedRef.current = true;
            checkpointSourceRef.current = "native";
            setGpsError(String(error instanceof Error ? error.message : error));
          }
        });
      handles.push(nativeRecorder.addListener("runState", applyNativeState));
      handles.push(
        nativeRecorder.addListener("runError", (event) => {
          if (active) setGpsError(event.message);
        }),
      );
    }
    // GPX imports have no native recording; keep their review in the local journal on iOS too.
    {
      try {
        const saved = loadRunCheckpoint(ownerId, sessionId);
        if (saved && (!nativeMode || saved.pending?.source === "gpx")) {
          startedAtRef.current = saved.startedAt;
          accumulatedSecRef.current = saved.durationSec;
          distanceMRef.current = saved.distanceM;
          phaseRef.current = saved.phase;
          setElapsedSec(Math.round(saved.durationSec));
          setDistanceM(saved.distanceM);
          setPhase(saved.phase);
          setPending(saved.pending ?? null);
          intervalResultsRef.current = saved.intervalResults ?? [];
          if (saved.guideState) {
            intervalStepIndexRef.current = saved.guideState.stepIndex;
            setIntervalStepIndex(saved.guideState.stepIndex);
            guideStartedRef.current = false;
            setGuideStarted(false);
            guideCompleteRef.current = saved.guideState.complete;
            setGuideComplete(saved.guideState.complete);
          }
          setGpsError(
            "Odzyskano szkic biegu. Czas przerwy i brakujące punkty GPS nie zostały doliczone.",
          );
        }
      } catch (error) {
        checkpointBlockedRef.current = true;
        checkpointSourceRef.current = "web";
        setGpsError(error instanceof Error ? error.message : "Nie odczytano szkicu.");
      }
    }
    const onActive = (event: Event) => {
      if (nativeMode && (event as CustomEvent<{ isActive: boolean }>).detail?.isActive)
        void nativeRecorder
          .getState(identity)
          .then((value) => {
            if (active) applyNativeState(value);
          })
          .catch(() => undefined);
    };
    window.addEventListener("ballwise:app-state", onActive);
    return () => {
      active = false;
      window.removeEventListener("ballwise:app-state", onActive);
      for (const handle of handles)
        void handle.then((value) => value.remove()).catch(() => undefined);
    };
  }, [ownerId, sessionId, nativeMode, applyNativeState]);

  useEffect(() => {
    if (
      !ownerId ||
      (nativeMode && pending?.source !== "gpx") ||
      phase === "idle" ||
      checkpointBlockedRef.current
    )
      return;
    const save = () => {
      if (!startedAtRef.current || phaseRef.current === "idle") return;
      try {
        saveRunCheckpoint({
          schema: 1,
          ownerId,
          sessionId,
          date,
          startedAt: startedAtRef.current,
          durationSec: currentElapsed(),
          distanceM: distanceMRef.current,
          phase: phaseRef.current === "review" ? "review" : "paused",
          pending: pending ?? undefined,
          intervalResults: intervalResultsRef.current,
          guideState: {
            started: false,
            complete: guideCompleteRef.current,
            stepIndex: intervalStepIndexRef.current,
            stepStartedElapsedSec: intervalStepStartedElapsedRef.current,
            stepStartedDistanceM: intervalStepStartedDistanceRef.current,
          },
        });
      } catch {
        setGpsError("Nie zapisano szkicu biegu. Zapisz wynik przed zamknięciem telefonu.");
      }
    };
    save();
    const timer = window.setInterval(save, 5000);
    const unload = (event: BeforeUnloadEvent) => {
      save();
      if (phaseRef.current !== "idle") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("pagehide", save);
    };
  }, [ownerId, sessionId, date, phase, pending, nativeMode, currentElapsed]);

  const persistNativeGuide = useCallback(() => {
    if (!nativeMode) return;
    void nativeRecorder
      .updateIntervals({
        ownerId: ownerId ?? "",
        sessionId,
        intervalResults: intervalResultsRef.current,
        guideState: {
          started: guideStartedRef.current,
          complete: guideCompleteRef.current,
          stepIndex: intervalStepIndexRef.current,
          stepStartedElapsedSec: intervalStepStartedElapsedRef.current,
          stepStartedDistanceM: intervalStepStartedDistanceRef.current,
        },
      })
      .catch(() =>
        setGpsError("Nie zapisano prowadzenia interwałów. Zachowaj ekran i spróbuj ponownie."),
      );
  }, [nativeMode, ownerId, sessionId]);

  const releaseWakeLock = async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock) await lock.release().catch(() => undefined);
  };

  const requestWakeLock = async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock) return;
    wakeLockRef.current = await nav.wakeLock.request("screen").catch(() => null);
  };

  const stopWatch = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  };

  const pushPosition = (position: GeolocationPosition) => {
    const point: RoutePoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
      elapsedSec: accumulatedSecRef.current + (Date.now() - segmentStartedMsRef.current) / 1_000,
      accuracyM: position.coords.accuracy,
      segment: segmentRef.current,
    };
    if (!mountedRef.current || phaseRef.current !== "recording") return;
    const previous = routeRef.current.at(-1);
    const accepted = sanitizeRoute(previous ? [previous, point] : [point]);
    if (accepted.at(-1)?.recordedAt !== point.recordedAt || accepted.length < (previous ? 2 : 1))
      return;
    const clean = accepted.at(-1)!;
    routeRef.current.push(clean);
    if (previous && previous.segment === clean.segment)
      distanceMRef.current += haversineDistanceM(previous, clean);
    samplesRef.current = pushSample(samplesRef.current, {
      elapsedSec: clean.elapsedSec,
      distanceM: distanceMRef.current,
    });
    setRoutePointCount(routeRef.current.length);
    if (isFieldMasTest) setPreviewRoute([...routeRef.current]);
    setDistanceM(distanceMRef.current);
  };

  const startWatch = () => {
    watchIdRef.current = navigator.geolocation.watchPosition(pushPosition, setPositionError, {
      enableHighAccuracy: true,
      maximumAge: 2_000,
      timeout: 15_000,
    });
  };

  const setPositionError = (error: GeolocationPositionError) => {
    setGpsError(positionErrorMessage(error));
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(
      () =>
        setElapsedSec(
          Math.round(
            accumulatedSecRef.current + (Date.now() - segmentStartedMsRef.current) / 1_000,
          ),
        ),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  /**
   * Zamyka bieżący krok. `at` to dokładna granica kroku czasowego (sekunda biegu);
   * bez niej krok kończy się teraz (pominięcie albo krok na dystans).
   */
  const completeCurrentInterval = useCallback(
    (completed = true, at?: number, signal = true) => {
      if (!intervalProtocol || !guideStartedRef.current || guideCompleteRef.current) return;
      const step = intervalProtocol.steps[intervalStepIndexRef.current];
      if (!step) return;
      const end = at ?? currentElapsed();
      const endDistance = at == null ? distanceMRef.current : distanceAt(samplesRef.current, at);
      const result = buildIntervalResult({
        step,
        durationSec: end - intervalStepStartedElapsedRef.current,
        distanceM: endDistance - intervalStepStartedDistanceRef.current,
        completed,
        recipeId: intervalProtocol.recipeId,
        startElapsedSec: intervalStepStartedElapsedRef.current,
      });
      intervalResultsRef.current = [...intervalResultsRef.current, result];
      const nextIndex = intervalStepIndexRef.current + 1;
      if (nextIndex >= intervalProtocol.steps.length) {
        guideCompleteRef.current = true;
        setGuideComplete(true);
        void cancelLockScreenCues();
        if (signal) announceStep(null);
        persistNativeGuide();
        return;
      }
      intervalStepIndexRef.current = nextIndex;
      intervalStepStartedElapsedRef.current = end;
      intervalStepStartedDistanceRef.current = Math.max(0, endDistance);
      setIntervalStepIndex(nextIndex);
      if (signal) announceStep(intervalProtocol.steps[nextIndex]);
      persistNativeGuide();
    },
    // The native writer reads refs for the current identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentElapsed, intervalProtocol, nativeMode, ownerId, sessionId],
  );

  /**
   * Receptura czasowa: przechodzi przez wszystkie granice, które minęły (także
   * przy zablokowanym ekranie). Sygnał tylko dla bieżącej zmiany, bez serii
   * zaległych komunikatów po powrocie do aplikacji.
   */
  const advanceTimedGuide = useCallback(() => {
    if (!intervalProtocol || !guideStartedRef.current) return;
    const now = currentElapsed();
    let lastEnd: number | null = null;
    while (!guideCompleteRef.current) {
      const step = intervalProtocol.steps[intervalStepIndexRef.current];
      if (!step) break;
      const end = intervalStepStartedElapsedRef.current + (step.target.value ?? 0);
      if (now < end) break;
      completeCurrentInterval(true, end, false);
      lastEnd = end;
      if (isFieldMasTest && step.phase === "warmup") {
        guideStartedRef.current = false;
        setGuideStarted(false);
        persistNativeGuide();
        void cancelLockScreenCues();
        lastEnd = null;
        break;
      }
    }
    if (lastEnd != null && now - lastEnd < 2.5)
      announceStep(
        guideCompleteRef.current ? null : intervalProtocol.steps[intervalStepIndexRef.current],
      );
  }, [
    completeCurrentInterval,
    currentElapsed,
    intervalProtocol,
    isFieldMasTest,
    persistNativeGuide,
  ]);

  /** Pozycja na osi receptury — do planu powiadomień przy zablokowanym ekranie. */
  const guideTimelineSec = useCallback(() => {
    if (!intervalProtocol) return 0;
    const before = intervalProtocol.steps
      .slice(0, intervalStepIndexRef.current)
      .reduce((sum, step) => sum + (step.target.value ?? 0), 0);
    return before + Math.max(0, currentElapsed() - intervalStepStartedElapsedRef.current);
  }, [currentElapsed, intervalProtocol]);

  useEffect(() => {
    if (phase !== "recording" || !intervalProtocol || !guideStarted || guideComplete) return;
    if (timedGuide) {
      advanceTimedGuide();
      return;
    }
    const step = intervalProtocol.steps[intervalStepIndex];
    if (!step?.target.autoAdvance) return;
    const progress = intervalStepProgress(
      step,
      elapsedSec - intervalStepStartedElapsedRef.current,
      distanceM - intervalStepStartedDistanceRef.current,
    );
    if (progress >= 1) completeCurrentInterval(true);
  }, [
    advanceTimedGuide,
    completeCurrentInterval,
    distanceM,
    elapsedSec,
    guideComplete,
    guideStarted,
    intervalProtocol,
    intervalStepIndex,
    phase,
    timedGuide,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopWatch();
      if (countdownRef.current) clearInterval(countdownRef.current);
      void releaseWakeLock();
    };
  }, []);

  async function prepareGps() {
    if (gpsPreparing || !navigator.geolocation) {
      if (!navigator.geolocation) setGpsError("Ta przeglądarka nie obsługuje lokalizacji GPS.");
      return;
    }
    setGpsPreparing(true);
    setGpsError(null);
    try {
      const p = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }),
      );
      if (!mountedRef.current) return;
      if (
        !Number.isFinite(p.coords.accuracy) ||
        p.coords.accuracy > 35 ||
        Math.abs(Date.now() - p.timestamp) > 5000
      ) {
        setGpsError(
          "GPS nie jest jeszcze dostatecznie dokładny lub świeży. Wyjdź na otwartą przestrzeń i ponów przygotowanie mapy.",
        );
        return;
      }
      setPreviewRoute([
        {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          recordedAt: new Date(p.timestamp).toISOString(),
          elapsedSec: 0,
          accuracyM: p.coords.accuracy,
          segment: 0,
        },
      ]);
    } catch (error) {
      setGpsError(positionErrorMessage(error as GeolocationPositionError));
    } finally {
      setGpsPreparing(false);
    }
  }

  async function startMasCountdown() {
    if (countdownRef.current || startingRef.current || phaseRef.current !== "recording") return;
    startingRef.current = true;
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }),
      );
      if (!mountedRef.current || phaseRef.current !== "recording") return;
      if (
        !Number.isFinite(fix.coords.accuracy) ||
        fix.coords.accuracy > 35 ||
        Math.abs(Date.now() - fix.timestamp) > 5000
      ) {
        setGpsError(
          "Przed próbą potrzebny jest dokładny, świeży GPS. Poczekaj na sygnał i kliknij Start ponownie.",
        );
        return;
      }
      setGpsError(null);
    } catch (error) {
      setGpsError(positionErrorMessage(error as GeolocationPositionError));
      return;
    } finally {
      startingRef.current = false;
    }
    let remaining = 3;
    setMasCountdown(remaining);
    countdownRef.current = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        setMasCountdown(remaining);
        return;
      }
      clearInterval(countdownRef.current!);
      countdownRef.current = null;
      setMasCountdown(null);
      if (phaseRef.current === "recording") startIntervalGuide();
    }, 1000);
  }

  async function startRecording() {
    if (startingRef.current || phaseRef.current !== "idle") return;
    if (checkpointBlockedRef.current) {
      setGpsError("Najpierw odzyskaj istniejący szkic biegu. Nie nadpisano go.");
      return;
    }
    setGpsError(null);
    if (isFieldMasTest && !safetyAcknowledged) {
      setGpsError("Przed startem potwierdź, że przeczytałeś zasady bezpieczeństwa testu.");
      return;
    }
    if (!nativeMode && !navigator.geolocation) {
      setGpsError("Ta przeglądarka nie obsługuje lokalizacji GPS.");
      return;
    }
    masInterruptedRef.current = false;
    startingRef.current = true;
    unlockSignals();
    if (timedGuide) void ensureLockScreenPermission();
    samplesRef.current = [];
    try {
      if (nativeMode) {
        applyNativeState(await nativeRecorder.start({ ...nativeIdentity, date }));
        samplesRef.current = [{ elapsedSec: 0, distanceM: 0 }];
        if (timedGuide) startIntervalGuide();
        return;
      }
      const first = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        }),
      );
      if (!mountedRef.current) return;
      if (
        isFieldMasTest &&
        (!Number.isFinite(first.coords.accuracy) ||
          first.coords.accuracy > 35 ||
          Math.abs(Date.now() - first.timestamp) > 5000)
      ) {
        setGpsError(
          "Poczekaj na dokładny, świeży sygnał GPS (do 35 m). Rozgrzewka jeszcze nie wystartowała.",
        );
        return;
      }
      segmentRef.current = 0;
      const now = Date.now();
      startedAtRef.current = new Date(now).toISOString();
      segmentStartedMsRef.current = now;
      accumulatedSecRef.current = 0;
      const firstPoint: RoutePoint = {
        lat: first.coords.latitude,
        lng: first.coords.longitude,
        recordedAt: new Date(first.timestamp || now).toISOString(),
        elapsedSec: 0,
        accuracyM: first.coords.accuracy,
        segment: 0,
      };
      routeRef.current = [firstPoint];
      setPreviewRoute([firstPoint]);
      distanceMRef.current = 0;
      setRoutePointCount(1);
      setDistanceM(0);
      setElapsedSec(0);
      setPending(null);
      intervalStepIndexRef.current = 0;
      intervalStepStartedElapsedRef.current = 0;
      intervalStepStartedDistanceRef.current = 0;
      intervalResultsRef.current = [];
      guideStartedRef.current = false;
      guideCompleteRef.current = false;
      setIntervalStepIndex(0);
      setGuideStarted(false);
      setGuideComplete(false);
      phaseRef.current = "recording";
      setPhase("recording");
      samplesRef.current = [{ elapsedSec: 0, distanceM: 0 }];
      startWatch();
      void requestWakeLock();
      if (timedGuide) startIntervalGuide();
    } catch (error) {
      if (nativeMode) {
        setGpsError(
          error instanceof Error
            ? error.message
            : error && typeof error === "object" && "message" in error
              ? String(error.message)
              : "Nie udało się uruchomić natywnego pomiaru GPS.",
        );
      } else if (error && typeof error === "object" && "code" in error) {
        setGpsError(positionErrorMessage(error as GeolocationPositionError));
      } else {
        setGpsError("Nie udało się uruchomić GPS.");
      }
    } finally {
      startingRef.current = false;
    }
  }

  function pauseRecording() {
    if (isFieldMasTest && intervalProtocol?.steps[intervalStepIndexRef.current]?.phase === "main")
      masInterruptedRef.current = true;
    void cancelLockScreenCues();
    if (nativeMode) {
      void nativeRecorder
        .pause(nativeIdentity)
        .then(applyNativeState)
        .catch((error) => setGpsError(String(error)));
      return;
    }
    accumulatedSecRef.current = currentElapsed();
    phaseRef.current = "paused";
    setElapsedSec(Math.round(accumulatedSecRef.current));
    stopWatch();
    void releaseWakeLock();
    setPhase("paused");
  }

  function resumeRecording() {
    if (nativeMode) {
      void nativeRecorder
        .resume(nativeIdentity)
        .then(applyNativeState)
        .catch((error) => setGpsError(String(error)));
      return;
    }
    segmentRef.current += 1;
    segmentStartedMsRef.current = Date.now();
    setGpsError(null);
    phaseRef.current = "recording";
    setPhase("recording");
    startWatch();
    void requestWakeLock();
  }

  useEffect(() => {
    const onHidden = () => {
      const guiding = guideStartedRef.current && !guideCompleteRef.current;
      if (document.hidden && countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setMasCountdown(null);
      }
      if (
        !nativeMode &&
        document.hidden &&
        isFieldMasTest &&
        guiding &&
        intervalProtocol?.steps[intervalStepIndexRef.current]?.phase === "main"
      )
        masInterruptedRef.current = true;
      if (nativeMode && timedGuide && guiding) {
        // Kroki wynikają z czasu: po powrocie licznik nadrobi granice z zapisu GPS.
        if (document.hidden && phaseRef.current === "recording") {
          const now = Date.now();
          void scheduleLockScreenCues(
            planLockScreenCues(intervalProtocol!, guideTimelineSec(), now),
          );
        } else if (!document.hidden) {
          void cancelLockScreenCues();
          advanceTimedGuide();
        }
        return;
      }
      if (nativeMode && document.hidden && guiding) {
        // GPS continues natively; the suspended web UI must not invent interval transitions.
        guideStartedRef.current = false;
        setGuideStarted(false);
        window.speechSynthesis?.cancel();
        persistNativeGuide();
        setGpsError(
          "GPS nadal mierzy bieg. Prowadzenie interwałów wstrzymano po ukryciu ekranu; uruchom je ponownie dla bieżącego odcinka.",
        );
      }
      if (!nativeMode && document.hidden && phaseRef.current === "recording") {
        accumulatedSecRef.current = currentElapsed();
        phaseRef.current = "paused";
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setElapsedSec(Math.round(accumulatedSecRef.current));
        setPhase("paused");
        setGpsError(
          isFieldMasTest && masInterruptedRef.current
            ? "Próba MAS przerwana po ukryciu ekranu. Możesz zapisać bieg, ale nie wyznaczy on MAS."
            : "Pomiar wstrzymany po ukryciu aplikacji. Wróć na ekran biegu i wznów GPS.",
        );
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
    // Native guide writer reads current identity and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentElapsed, nativeMode, ownerId, sessionId, timedGuide, guideTimelineSec]);

  function startIntervalGuide() {
    const step = intervalProtocol?.steps[intervalStepIndexRef.current];
    if (!step || phaseRef.current !== "recording") return;
    intervalStepStartedElapsedRef.current = currentElapsed();
    intervalStepStartedDistanceRef.current = distanceMRef.current;
    guideStartedRef.current = true;
    setGuideStarted(true);
    announceStep(step);
    persistNativeGuide();
  }

  async function finishRecording() {
    if (timedGuide && phaseRef.current === "recording") advanceTimedGuide();
    void cancelLockScreenCues();
    if (nativeMode) {
      if (finishingRef.current) return;
      finishingRef.current = true;
      try {
        const value = await nativeRecorder.finish(nativeIdentity);
        if ((value.distanceM ?? 0) < 50) {
          applyNativeState({ ...value, phase: "paused" });
          setGpsError("Za mało wiarygodnego dystansu GPS. Potrzeba co najmniej 50 m.");
          return;
        }
        let results = value.intervalResults ?? intervalResultsRef.current;
        if (intervalProtocol && guideStartedRef.current && !guideCompleteRef.current) {
          const step = intervalProtocol.steps[intervalStepIndexRef.current];
          if (step) {
            const partial = buildIntervalResult({
              step,
              durationSec: (value.durationSec ?? 0) - intervalStepStartedElapsedRef.current,
              distanceM: (value.distanceM ?? 0) - intervalStepStartedDistanceRef.current,
              completed: false,
              recipeId: intervalProtocol.recipeId,
              startElapsedSec: intervalStepStartedElapsedRef.current,
            });
            if (partial.durationSec >= 1 || partial.distanceM >= 2) results = [...results, partial];
          }
        }
        // Granice minięte przy zablokowanym ekranie: dystans kroku z pełnej trasy telefonu.
        const route = nativeRoute(value);
        if (route.length > 1) results = remeasureIntervals(results, samplesFromRoute(route));
        let intervalError = false;
        if (results.length !== (value.intervalResults ?? []).length) {
          try {
            await nativeRecorder.updateIntervals({ ...nativeIdentity, intervalResults: results });
          } catch {
            intervalError = true;
          }
        }
        intervalResultsRef.current = results;
        applyNativeState({ ...value, intervalResults: results });
        if (intervalError)
          setGpsError(
            "Wynik GPS jest w szkicu. Nie utrwalono ostatniego interwału — zapisz wynik przed zamknięciem aplikacji.",
          );
      } catch (error) {
        setGpsError(error instanceof Error ? error.message : "Nie zapisano szkicu biegu.");
      } finally {
        finishingRef.current = false;
      }
      return;
    }
    const durationSec = Math.max(1, Math.round(currentElapsed()));
    accumulatedSecRef.current = durationSec;
    phaseRef.current = "paused";
    stopWatch();
    void releaseWakeLock();
    let intervalResults = intervalResultsRef.current;
    if (intervalProtocol && guideStartedRef.current && !guideCompleteRef.current) {
      const step = intervalProtocol.steps[intervalStepIndexRef.current];
      if (step) {
        const partial = buildIntervalResult({
          step,
          durationSec: durationSec - intervalStepStartedElapsedRef.current,
          distanceM: distanceMRef.current - intervalStepStartedDistanceRef.current,
          completed: false,
          recipeId: intervalProtocol.recipeId,
          startElapsedSec: intervalStepStartedElapsedRef.current,
        });
        if (partial.durationSec >= 1 || partial.distanceM >= 2) {
          intervalResults = [...intervalResults, partial];
        }
      }
    }
    intervalResults = remeasureIntervals(intervalResults, samplesRef.current);
    const draft = buildRunningActivityDraft({
      sessionId,
      date,
      startedAt: startedAtRef.current ?? new Date(Date.now() - durationSec * 1_000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSec,
      route: routeRef.current,
      source: "gps",
      intervalResults,
    });
    draft.distanceM = Math.round(distanceMRef.current);
    draft.avgPaceSecPerKm = draft.distanceM > 0 ? (durationSec / draft.distanceM) * 1000 : null;
    if (draft.distanceM < 50) {
      setGpsError(
        "Za mało wiarygodnych punktów GPS. Poczekaj na sygnał i przebiegnij co najmniej 50 m.",
      );
      setPhase("paused");
      return;
    }
    intervalResultsRef.current = intervalResults;
    phaseRef.current = "review";
    setPending(draft);
    setPhase("review");
  }

  async function importGpx(file: File | undefined) {
    if (!file || startingRef.current || phaseRef.current !== "idle") return;
    if (checkpointBlockedRef.current) {
      setGpsError("Najpierw odzyskaj istniejący szkic biegu. Nie nadpisano go.");
      return;
    }
    startingRef.current = true;
    setGpsError(null);
    try {
      const draft = activityDraftFromGpx({ xml: await file.text(), date, sessionId });
      if (!mountedRef.current) return;
      startedAtRef.current = draft.startedAt;
      accumulatedSecRef.current = draft.durationSec;
      distanceMRef.current = draft.distanceM;
      intervalResultsRef.current = draft.intervalResults;
      phaseRef.current = "review";
      setElapsedSec(Math.round(draft.durationSec));
      setDistanceM(draft.distanceM);
      setPending(draft);
      setPhase("review");
    } catch (error) {
      if (mountedRef.current)
        setGpsError(error instanceof Error ? error.message : "Nie udało się odczytać GPX.");
    } finally {
      startingRef.current = false;
    }
  }

  async function savePending() {
    if (!pending || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const evidence = isFieldMasTest
        ? measureMasEvidence(pending, masInterruptedRef.current)
        : null;
      const result = isFieldMasTest
        ? {
            ...pending,
            masTestEvidence: evidence,
            intervalResults: pending.intervalResults.map((r) =>
              r.phase === "main" && r.completed && evidence
                ? withMeasuredDistance(r, evidence.distanceM)
                : r,
            ),
          }
        : pending;
      await onSave(result);
      if (ownerId && pending.route.length > 1)
        saveRunToHistory(
          ownerId,
          historyEntryFromDraft(pending, professionalSessionTitle(session.title)),
        );
      phaseRef.current = "idle";
      try {
        if (nativeMode && pending.source === "gps") await nativeRecorder.clear(nativeIdentity);
        if (ownerId) clearRunCheckpoint(ownerId, sessionId);
      } catch {
        setGpsError(
          "Wynik zapisano, ale nie usunięto szkicu z telefonu. Nie rozpoczynaj ponownie tej samej próby.",
        );
      }
      setPending(null);
      setPhase("idle");
      toast.success("Zapisano dystans, czas i średnie tempo biegu.");
      onFinish?.(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać biegu. Dane zostały na ekranie — spróbuj ponownie.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function removeActivity() {
    if (!activity || !window.confirm("Usunąć zapis wyniku biegu?")) return;
    try {
      await onDelete(activity.id);
      if (ownerId) removeRunFromHistory(ownerId, activity.sessionId);
      toast.success("Wynik biegu został usunięty.");
    } catch {
      toast.error("Nie udało się usunąć trasy.");
    }
  }

  const shownActivity = pending ?? activity;
  const masEvidence =
    isFieldMasTest && pending ? measureMasEvidence(pending, masInterruptedRef.current) : null;
  const masProblem = isFieldMasTest && pending ? masEvidenceProblem(masEvidence) : null;
  const isTracking = phase === "recording" || phase === "paused";
  const currentIntervalStep =
    intervalProtocol && guideStarted && !guideComplete
      ? intervalProtocol.steps[intervalStepIndex]
      : null;
  const nextIntervalStep = currentIntervalStep
    ? (intervalProtocol?.steps[intervalStepIndex + 1] ?? null)
    : null;
  const guideWorkCount =
    intervalProtocol?.steps.filter(
      (step) => step.kind === "work" && (step.phase ?? "main") === "main",
    ).length ?? 0;
  const currentStepElapsed = Math.max(0, elapsedSec - intervalStepStartedElapsedRef.current);
  const currentStepDistance = Math.max(0, distanceM - intervalStepStartedDistanceRef.current);
  const currentStepProgress = currentIntervalStep
    ? intervalStepProgress(currentIntervalStep, currentStepElapsed, currentStepDistance)
    : 0;
  const livePace = isTracking ? stablePace(samplesRef.current, elapsedSec) : null;
  const liveKilometer = isTracking ? currentKilometer(samplesRef.current, elapsedSec) : null;
  const currentStepPace =
    currentIntervalStep?.kind === "work" && currentStepElapsed >= 20 && currentStepDistance >= 80
      ? currentStepElapsed / (currentStepDistance / 1_000)
      : null;
  const paceGuidance = currentIntervalStep?.target.paceTarget
    ? classifyPace(
        currentStepPace,
        currentIntervalStep.target.paceTarget.fastestSecPerKm,
        currentIntervalStep.target.paceTarget.slowestSecPerKm,
      )
    : "unavailable";

  useEffect(() => {
    const state = paceStateRef.current;
    if (phase !== "recording" || paceGuidance === "unavailable" || paceGuidance === "on_target") {
      state.guidance = paceGuidance;
      state.sinceSec = elapsedSec;
      return;
    }
    if (state.guidance !== paceGuidance) {
      state.guidance = paceGuidance;
      state.sinceSec = elapsedSec;
      return;
    }
    const sustainedFor = elapsedSec - state.sinceSec;
    if (sustainedFor < 8 || elapsedSec - state.lastSignalSec < 20) return;
    const pattern = vibrationForPace(paceGuidance);
    if (pattern) vibrate(pattern);
    state.lastSignalSec = elapsedSec;
  }, [elapsedSec, paceGuidance, phase]);

  return (
    <section className="soft-card space-y-4 p-4" aria-labelledby="run-tracker-title">
      <div>
        <div className="flex items-center gap-2">
          <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="run-tracker-title" className="text-sm font-semibold">
            {isFieldMasTest ? "Pomiar testu 5-minutowego" : "Bieg z GPS"}
          </h2>
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            prywatny
          </span>
        </div>
        <details className="bw-session-extra">
          <summary>GPS i prywatność</summary>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            GPS włącza się dopiero po Twoim kliknięciu. Mapa trasy i międzyczasy zostają w tym
            telefonie. Na konto trafiają tylko wyniki biegu i odcinków, bez współrzędnych trasy.
          </p>
        </details>
      </div>
      {checkpointBlockedRef.current && ownerId && (
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            if (
              !window.confirm(
                "Zabezpieczyć uszkodzony szkic w osobnym pliku i odblokować nowy bieg? Uszkodzonych danych nie będzie można użyć jako wyniku.",
              )
            )
              return;
            void (
              checkpointSourceRef.current === "native"
                ? nativeRecorder.quarantineCorruptCheckpoint({ confirm: true })
                : Promise.resolve().then(() => quarantineRunCheckpoint(ownerId, sessionId))
            )
              .then(() => {
                checkpointBlockedRef.current = false;
                setGpsError(null);
              })
              .catch((error) => setGpsError(String(error)));
          }}
        >
          Zabezpiecz uszkodzony szkic i odblokuj GPS
        </button>
      )}

      {isFieldMasTest && !activity && !pending && !isTracking && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
          <h3 className="text-sm font-semibold">Najpierw bezpieczeństwo</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
            <li>
              Wybierz płaską, otwartą trasę bez ruchu ulicznego i ostrych nawrotów. Licznik
              poprowadzi 10 minut rozgrzewki.
            </li>
            <li>
              Po rozgrzewce kliknij „Start próby 5 min”. Po odliczaniu biegnij równo przez 300
              sekund bez pauzy. Potem wykonaj 5 minut schłodzenia.
            </li>
            <li>
              Przerwij przy ostrym bólu, zawrotach głowy, bólu w klatce lub innym niepokojącym
              objawie.
            </li>
          </ol>
          <label className="mt-3 flex items-start gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={safetyAcknowledged}
              onChange={(event) => setSafetyAcknowledged(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>Przeczytałem zasady i wiem, że BallWise nie ocenia mojego stanu zdrowia.</span>
          </label>
        </div>
      )}

      {intervalProtocol && !isTracking && !pending && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Prowadzenie biegu
          </div>
          <div className="mt-1.5 text-sm font-semibold">{intervalProtocol.summary}</div>
          <details className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <summary className="cursor-pointer text-primary">Jak działa prowadzenie?</summary>
            <p className="mt-2">
              BallWise automatycznie zmienia odcinek i przerwę, mówi komendę oraz wibruje. Krótkie
              odcinki poniżej 80 m potwierdzasz ręcznie, bo GPS telefonu nie mierzy ich dość
              dokładnie.
            </p>
            {nativeMode && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {timedGuide
                  ? "Przy zablokowanym ekranie GPS mierzy dalej, a zmianę odcinka i przerwy sygnalizuje powiadomienie z dźwiękiem."
                  : "GPS działa przy blokadzie telefonu. Odcinki na dystans prowadzi widoczny ekran; po jego ukryciu uruchom bieżący odcinek ponownie."}
              </p>
            )}
            {intervalProtocol.steps.some((step) => step.target.paceTarget) && (
              <p className="mt-2 rounded-xl bg-background/70 px-3 py-2 text-xs leading-relaxed">
                Tempo widzisz w min/km. <strong>Dwie krótkie wibracje</strong> oznaczają:
                przyspiesz.
                <strong> Jedna długa</strong>: zwolnij. Sygnał pojawia się dopiero po 8 sekundach
                poza zakresem, żeby pojedynczy błąd GPS nie sterował biegiem.
              </p>
            )}
          </details>
        </div>
      )}

      {isFieldMasTest && !pending && !activity && (
        <div className="space-y-3">
          <RunRouteMap route={previewRoute} height={220} />
          {!isTracking && (
            <>
              <div
                className="flex justify-between text-2xl font-semibold tabular-nums"
                aria-label="Gotowość testu"
              >
                <span>05:00</span>
                <span>0 m</span>
              </div>
              <button
                type="button"
                onClick={() => void prepareGps()}
                disabled={gpsPreparing}
                className="w-full rounded-full border px-4 py-3 text-sm font-medium"
              >
                {gpsPreparing
                  ? "Szukam dokładnej pozycji…"
                  : previewRoute.length
                    ? "Odśwież pozycję GPS"
                    : "Włącz lokalizację i przygotuj mapę"}
              </button>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Test daje terenowe oszacowanie tempa MAS, nie pomiar VO₂max. Mapa i współrzędne
            pozostają w telefonie.
          </p>
        </div>
      )}
      {shownActivity && !isTracking && <RunActivitySummary activity={shownActivity} showSplits />}
      {pending && isFieldMasTest && (
        <p role="status" className="rounded-xl bg-muted/40 p-3 text-sm">
          {masProblem
            ? `${masProblem} Bieg zapiszesz w historii; dotychczasowy MAS pozostanie bez zmian.`
            : "Próba spełnia warunki zapisu. MAS obliczymy wyłącznie z dystansu odcinka 5 min."}
        </p>
      )}

      {isTracking && (
        <div className="bw-run-live" data-started="">
          {phase === "paused" ? (
            <>
              <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
                Pauza
              </div>
              <div className="mt-2 text-4xl font-semibold tabular-nums">
                {formatRunDuration(elapsedSec)}
              </div>
            </>
          ) : intervalProtocol && !guideStarted ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                {isFieldMasTest ? "Gotowy do próby 5 min" : "Gotowy do części głównej"}
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {masCountdown !== null
                  ? masCountdown
                  : isFieldMasTest
                    ? "05:00 · 0 m"
                    : "Uruchom prowadzenie biegu"}
              </div>
              <p className="mt-1 text-sm opacity-70">
                Po rozgrzewce rozpocznij część główną. Dalej prowadzą komendy głosowe.
              </p>
              <button
                type="button"
                onClick={isFieldMasTest ? startMasCountdown : startIntervalGuide}
                disabled={masCountdown !== null}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                <Play className="h-4 w-4" />{" "}
                {isFieldMasTest ? "Start próby 5 min" : "Rozpocznij bieg"}
              </button>
            </>
          ) : currentIntervalStep ? (
            <>
              <div className="bw-run-clock-head">
                <span className="bw-run-clock-stage" data-live={phase === "recording" || undefined}>
                  {stageLabel(currentIntervalStep)}
                </span>
                <Volume2 className="h-4 w-4 opacity-60" aria-label="Komendy głosowe włączone" />
              </div>
              {guidePhases(intervalProtocol!, guideWorkCount).length > 1 && (
                <ol className="bw-run-phases" aria-label="Części biegu">
                  {guidePhases(intervalProtocol!, guideWorkCount).map((item) => (
                    <li
                      key={item.id}
                      aria-current={
                        item.id === (currentIntervalStep.phase ?? "main") ? "step" : undefined
                      }
                      data-current={item.id === (currentIntervalStep.phase ?? "main") || undefined}
                    >
                      {item.label}
                    </li>
                  ))}
                </ol>
              )}
              <div className="bw-run-now">
                <p className="bw-run-now-title">{stepTitle(currentIntervalStep)}</p>
                <div className="bw-run-readout" role="timer" aria-live="off">
                  {padClock(
                    intervalRemainingLabel(
                      currentIntervalStep,
                      currentStepElapsed,
                      currentStepDistance,
                    ),
                  )}
                </div>
                <p className="bw-run-now-until">{untilLabel(currentIntervalStep)}</p>
                {isFieldMasTest && currentIntervalStep.phase === "main" && (
                  <p className="text-3xl font-semibold tabular-nums" aria-label="Dystans próby MAS">
                    {Math.round(
                      Math.max(
                        0,
                        distanceAt(
                          samplesRef.current,
                          Math.min(elapsedSec, intervalStepStartedElapsedRef.current + 300),
                        ) - distanceAt(samplesRef.current, intervalStepStartedElapsedRef.current),
                      ),
                    )}{" "}
                    m
                  </p>
                )}
                <div
                  className="bw-run-step-bar"
                  role="progressbar"
                  aria-label={`Postęp: ${currentIntervalStep.label}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(currentStepProgress * 100)}
                >
                  <span style={{ width: `${Math.max(2, currentStepProgress * 100)}%` }} />
                </div>
                {currentIntervalStep.target.paceTarget ? (
                  <div className="bw-run-goal">
                    <span>Cel</span>
                    <strong className="bw-run-clock-target">
                      {currentIntervalStep.target.paceTarget.label}
                    </strong>
                    <span>Teraz</span>
                    <strong className="bw-run-clock-target">{formatPace(currentStepPace)}</strong>
                    <small>
                      {paceGuidance === "speed_up"
                        ? "Przyspiesz spokojnie"
                        : paceGuidance === "slow_down"
                          ? "Zwolnij i wróć do zakresu"
                          : paceGuidance === "on_target"
                            ? "Tempo w zakresie"
                            : "Ustalam tempo z GPS…"}
                    </small>
                  </div>
                ) : (
                  goalOf(currentIntervalStep) && (
                    <div className="bw-run-goal">
                      <span>Cel</span>
                      <strong className="bw-run-clock-target">
                        {goalOf(currentIntervalStep)!.value}
                      </strong>
                      {goalOf(currentIntervalStep)!.note && (
                        <small>{goalOf(currentIntervalStep)!.note}</small>
                      )}
                    </div>
                  )
                )}
              </div>
              <p className="bw-run-next">
                <span>Następnie</span>
                <strong>
                  {nextIntervalStep
                    ? `${nextName(nextIntervalStep)}${
                        nextIntervalStep.target.mode === "time" && nextIntervalStep.target.value
                          ? ` · ${durationLabel(nextIntervalStep.target.value)}`
                          : ` · ${nextIntervalStep.target.label}`
                      }`
                    : "Koniec biegu"}
                </strong>
              </p>
            </>
          ) : intervalProtocol && guideComplete ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                {timedGuide ? "Koniec" : "Część główna ukończona"}
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {timedGuide ? "Bieg ukończony" : "Teraz spokojne schłodzenie"}
              </div>
              <p className="mt-1 text-sm opacity-70">
                {timedGuide ? "Zakończ zapis GPS." : "Po schłodzeniu zakończ zapis GPS."}
              </p>
            </>
          ) : (
            <>
              <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
                Rejestracja GPS
              </div>
              <div className="mt-2 text-5xl font-semibold tabular-nums">
                {formatRunDuration(elapsedSec)}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xl font-semibold tabular-nums">
                    {formatDistance(distanceM)}
                  </div>
                  <div className="text-[11px] opacity-60">Dystans</div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">{formatPace(livePace)}</div>
                  <div className="text-[11px] opacity-60">Tempo</div>
                </div>
                <div>
                  <div className="text-xl font-semibold tabular-nums">
                    {liveKilometer ? formatRunDuration(liveKilometer.durationSec) : "—"}
                  </div>
                  <div className="text-[11px] opacity-60">
                    {liveKilometer ? `${liveKilometer.kilometer}. km` : "Kilometr"}
                  </div>
                </div>
              </div>
            </>
          )}
          <p className="bw-run-live-stats">
            {formatRunDuration(elapsedSec)} · {formatDistance(distanceM)} · {formatPace(livePace)}
            {routePointCount < 2 ? " · szukam sygnału GPS" : ""}
          </p>
          <div className="bw-run-dock">
            {phase === "recording" && isFieldMasTest ? (
              <p className="py-2 text-center text-xs">
                Próba 5 min bez pauzy. Przerwanie zachowa bieg bez kalibracji MAS.
              </p>
            ) : phase === "recording" ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="bw-session-primary bw-run-clock-main"
              >
                <Pause className="h-5 w-5" /> Pauza
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="bw-session-primary bw-run-clock-main"
              >
                <Play className="h-5 w-5" /> Wznów
              </button>
            )}
            <div className="bw-run-dock-links">
              {currentIntervalStep && !isFieldMasTest ? (
                <button type="button" onClick={() => completeCurrentInterval(true)}>
                  <SkipForward className="h-4 w-4" aria-hidden="true" /> Zakończ ten krok
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={finishRecording}>
                {isFieldMasTest && !guideComplete ? "Przerwij i podsumuj bieg" : "Zakończ bieg"}
              </button>
            </div>
          </div>
        </div>
      )}

      {gpsError && (
        <p
          role="alert"
          className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {gpsError}
        </p>
      )}

      {!isTracking && (
        <div className="flex flex-wrap gap-2">
          {!pending && canRecord && (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={
                isFieldMasTest && (!safetyAcknowledged || !previewRoute.length || gpsPreparing)
              }
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <LocateFixed className="h-4 w-4" />{" "}
              {activity
                ? "Nagraj ponownie"
                : isFieldMasTest
                  ? "Rozpocznij rozgrzewkę 10 min"
                  : "Start GPS"}
            </button>
          )}
          {!pending && (
            <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm font-semibold active:scale-95">
              <FileUp className="h-4 w-4" /> Wczytaj GPX
              <input
                type="file"
                accept=".gpx,application/gpx+xml"
                className="sr-only"
                onChange={(event) => {
                  void importGpx(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {pending && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePending()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" />{" "}
                {saving ? "Zapisuję…" : onFinish ? "Dalej · podsumowanie" : "Zapisz bieg"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (!window.confirm("Odrzucić niezapisany wynik biegu?")) return;
                  const discard = async () => {
                    try {
                      if (nativeMode && pending.source === "gps")
                        await nativeRecorder.clear(nativeIdentity);
                      if (ownerId) clearRunCheckpoint(ownerId, sessionId);
                      phaseRef.current = "idle";
                      setPending(null);
                      setPhase("idle");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Nie usunięto szkicu biegu.",
                      );
                    }
                  };
                  void discard();
                }}
                className="rounded-full border border-border px-4 py-3 text-sm font-semibold"
              >
                Odrzuć
              </button>
            </>
          )}
          {activity && !pending && (
            <button
              type="button"
              onClick={() => void removeActivity()}
              aria-label="Usuń wynik biegu"
              className="inline-flex items-center justify-center rounded-full border border-border px-4 py-3 text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {!canRecord && !activity && !pending && (
        <p className="text-xs text-muted-foreground">
          GPS uruchomisz w dniu treningu. Starszy wynik możesz obliczyć lokalnie z pliku GPX.
        </p>
      )}
      {canRecord && !isTracking && !activity && !pending && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {nativeMode
            ? "Pomiar GPS działa także po zablokowaniu ekranu. Trasa zostaje w telefonie. Po wymuszonym zamknięciu aplikacji pomiar zostanie przerwany."
            : "W przeglądarce pomiar wymaga widocznego ekranu. Blokada telefonu lub przejście do innej aplikacji wstrzymuje GPS. Możesz też zaimportować GPX."}
        </p>
      )}
    </section>
  );
}

/** Session identity owns all GPS resources and unsaved state. */
export function EnduranceRunTracker(props: Parameters<typeof RunTracker>[0]) {
  return <RunTracker key={`${props.sessionId}:${props.date}`} {...props} />;
}
