import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileUp,
  LocateFixed,
  Pause,
  Play,
  Save,
  SkipForward,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { activityDraftFromGpx } from "@/lib/running/gpx";
import {
  buildRunningActivityDraft,
  formatDistance,
  formatPace,
  formatRunDuration,
  routeDistanceM,
  sanitizeRoute,
} from "@/lib/running/metrics";
import {
  buildIntervalResult,
  deriveRunningIntervalProtocol,
  intervalRemainingLabel,
  intervalStepProgress,
} from "@/lib/running/intervals";
import { classifyPace, vibrationForPace, type PaceGuidance } from "@/lib/running/paceGuidance";
import type {
  RoutePoint,
  RunningActivity,
  RunningActivityDraft,
  RunningIntervalResult,
  RunningIntervalStep,
} from "@/lib/running/types";
import type { SessionDay } from "@/lib/loadwise/types";
import { RunActivitySummary } from "./RunActivitySummary";
import { useActivityExitGuard } from "@/components/loadwise/ActivityExitGuard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Disclosure } from "@/components/ui/app-ui";

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

function announceStep(step: RunningIntervalStep | null) {
  if (typeof window === "undefined") return;
  navigator.vibrate?.(step ? [120, 70, 120] : [150, 80, 150, 80, 220]);
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const text = step
    ? `${step.label} ${step.repeatIndex} z ${step.repeatTotal}. ${step.target.label}.`
    : "Interwały zakończone. Wykonaj schłodzenie i zakończ zapis.";
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pl-PL";
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

export function EnduranceRunTracker({
  session,
  sessionId,
  date,
  canRecord,
  activity,
  onSave,
  onDelete,
}: {
  session: SessionDay;
  sessionId: string;
  date: string;
  canRecord: boolean;
  activity: RunningActivity | null;
  onSave: (draft: RunningActivityDraft) => Promise<void>;
  onDelete: (activityId: string) => Promise<void>;
}) {
  const intervalProtocol = useMemo(() => deriveRunningIntervalProtocol(session), [session]);
  const isFieldMasTest = session.classification?.subcategory === "field_mas_test";
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [phase, setPhase] = useState<TrackerPhase>("idle");
  const [pending, setPending] = useState<RunningActivityDraft | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [intervalStepIndex, setIntervalStepIndex] = useState(0);
  const [guideStarted, setGuideStarted] = useState(false);
  const [guideComplete, setGuideComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const resumeAfterExitRef = useRef(false);
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
    const lock = await nav.wakeLock.request("screen").catch(() => null);
    if (!mountedRef.current || phaseRef.current !== "recording") {
      await lock?.release().catch(() => undefined);
      return;
    }
    wakeLockRef.current = lock;
  };

  const stopWatch = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  };

  const pushPosition = (position: GeolocationPosition) => {
    if (!mountedRef.current || phaseRef.current !== "recording") return;
    const point: RoutePoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
      elapsedSec: accumulatedSecRef.current + (Date.now() - segmentStartedMsRef.current) / 1_000,
      accuracyM: position.coords.accuracy,
    };
    routeRef.current = [...routeRef.current, point].slice(-5_200);
    const nextDistance = routeDistanceM(sanitizeRoute(routeRef.current));
    distanceMRef.current = nextDistance;
    setDistanceM(nextDistance);
  };

  const startWatch = () => {
    watchIdRef.current = navigator.geolocation.watchPosition(pushPosition, setPositionError, {
      enableHighAccuracy: true,
      maximumAge: 2_000,
      timeout: 15_000,
    });
  };

  const setPositionError = (error: GeolocationPositionError) => {
    if (!mountedRef.current) return;
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

  const completeCurrentInterval = useCallback(
    (completed = true) => {
      if (!intervalProtocol || !guideStartedRef.current || guideCompleteRef.current) return;
      const step = intervalProtocol.steps[intervalStepIndexRef.current];
      if (!step) return;
      const result = buildIntervalResult({
        step,
        durationSec: currentElapsed() - intervalStepStartedElapsedRef.current,
        distanceM: distanceMRef.current - intervalStepStartedDistanceRef.current,
        completed,
      });
      intervalResultsRef.current = [...intervalResultsRef.current, result];
      const nextIndex = intervalStepIndexRef.current + 1;
      if (nextIndex >= intervalProtocol.steps.length) {
        guideCompleteRef.current = true;
        setGuideComplete(true);
        announceStep(null);
        return;
      }
      intervalStepIndexRef.current = nextIndex;
      intervalStepStartedElapsedRef.current = currentElapsed();
      intervalStepStartedDistanceRef.current = distanceMRef.current;
      setIntervalStepIndex(nextIndex);
      announceStep(intervalProtocol.steps[nextIndex]);
    },
    [currentElapsed, intervalProtocol],
  );

  useEffect(() => {
    if (phase !== "recording" || !intervalProtocol || !guideStarted || guideComplete) return;
    const step = intervalProtocol.steps[intervalStepIndex];
    if (!step?.target.autoAdvance) return;
    const progress = intervalStepProgress(
      step,
      elapsedSec - intervalStepStartedElapsedRef.current,
      distanceM - intervalStepStartedDistanceRef.current,
    );
    if (progress >= 1) completeCurrentInterval(true);
  }, [
    completeCurrentInterval,
    distanceM,
    elapsedSec,
    guideComplete,
    guideStarted,
    intervalProtocol,
    intervalStepIndex,
    phase,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopWatch();
      void releaseWakeLock();
      window.speechSynthesis?.cancel();
      navigator.vibrate?.(0);
    };
  }, []);

  async function startRecording() {
    setGpsError(null);
    if (isFieldMasTest && !safetyAcknowledged) {
      setGpsError("Przed startem potwierdź, że przeczytałeś zasady bezpieczeństwa testu.");
      return;
    }
    if (!navigator.geolocation) {
      setGpsError("Ta przeglądarka nie obsługuje lokalizacji GPS.");
      return;
    }
    try {
      const first = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        }),
      );
      if (!mountedRef.current) return;
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
      };
      routeRef.current = [firstPoint];
      distanceMRef.current = 0;
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
      startWatch();
      void requestWakeLock();
    } catch (error) {
      if (!mountedRef.current) return;
      if (error && typeof error === "object" && "code" in error) {
        setGpsError(positionErrorMessage(error as GeolocationPositionError));
      } else {
        setGpsError("Nie udało się uruchomić GPS.");
      }
    }
  }

  function pauseRecording() {
    accumulatedSecRef.current = currentElapsed();
    phaseRef.current = "paused";
    setElapsedSec(Math.round(accumulatedSecRef.current));
    stopWatch();
    void releaseWakeLock();
    setPhase("paused");
  }

  function resumeRecording() {
    segmentStartedMsRef.current = Date.now();
    setGpsError(null);
    phaseRef.current = "recording";
    setPhase("recording");
    startWatch();
    void requestWakeLock();
  }

  function startIntervalGuide() {
    if (!intervalProtocol?.steps[0] || phaseRef.current !== "recording") return;
    intervalStepStartedElapsedRef.current = currentElapsed();
    intervalStepStartedDistanceRef.current = distanceMRef.current;
    guideStartedRef.current = true;
    setGuideStarted(true);
    announceStep(intervalProtocol.steps[0]);
  }

  function finishRecording() {
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
        });
        if (partial.durationSec >= 1 || partial.distanceM >= 2) {
          intervalResults = [...intervalResults, partial];
        }
      }
    }
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
    if (draft.route.length < 2 || draft.distanceM < 50) {
      setGpsError(
        "Za mało wiarygodnych punktów GPS. Poczekaj na sygnał i przebiegnij co najmniej 50 m.",
      );
      setPhase("paused");
      return;
    }
    setPending(draft);
    setPhase("review");
  }

  async function importGpx(file: File | undefined) {
    if (!file) return;
    setGpsError(null);
    try {
      const draft = activityDraftFromGpx({ xml: await file.text(), date, sessionId });
      if (!mountedRef.current) return;
      setPending(draft);
      setPhase("review");
    } catch (error) {
      setGpsError(error instanceof Error ? error.message : "Nie udało się odczytać GPX.");
    }
  }

  async function savePending() {
    if (!pending) return;
    setSaving(true);
    try {
      await onSave(pending);
      setPending(null);
      setPhase("idle");
      toast.success("Zapisano dystans, czas i średnie tempo biegu.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać biegu. Dane zostały na ekranie — spróbuj ponownie.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeActivity() {
    if (!activity || deleting) return;
    setDeleting(true);
    try {
      await onDelete(activity.id);
      toast.success("Wynik biegu został usunięty.");
      setDeleteOpen(false);
    } catch {
      toast.error("Nie udało się usunąć wyniku.");
    } finally {
      setDeleting(false);
    }
  }

  const shownActivity = pending ?? activity;
  const isTracking = phase === "recording" || phase === "paused";
  const currentIntervalStep =
    intervalProtocol && guideStarted && !guideComplete
      ? intervalProtocol.steps[intervalStepIndex]
      : null;
  const currentStepElapsed = Math.max(0, elapsedSec - intervalStepStartedElapsedRef.current);
  const currentStepDistance = Math.max(0, distanceM - intervalStepStartedDistanceRef.current);
  const currentStepProgress = currentIntervalStep
    ? intervalStepProgress(currentIntervalStep, currentStepElapsed, currentStepDistance)
    : 0;
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
    if (pattern) navigator.vibrate?.(pattern);
    state.lastSignalSec = elapsedSec;
  }, [elapsedSec, paceGuidance, phase]);

  useActivityExitGuard({
    dirty: phase === "recording" || phase === "paused" || Boolean(pending),
    busy: saving || deleting,
    description: "Wynik biegu nie został zapisany.",
    pause: () => {
      resumeAfterExitRef.current = phaseRef.current === "recording";
      if (resumeAfterExitRef.current) pauseRecording();
      window.speechSynthesis?.cancel();
    },
    resume: () => {
      if (resumeAfterExitRef.current) {
        resumeAfterExitRef.current = false;
        resumeRecording();
      }
    },
    dispose: () => {
      stopWatch();
      void releaseWakeLock();
      window.speechSynthesis?.cancel();
      navigator.vibrate?.(0);
    },
  });

  return (
    <section className="bw-section bw-stack" aria-labelledby="run-tracker-title">
      <div>
        <div className="flex items-center gap-2">
          <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="run-tracker-title" className="text-sm font-semibold">
            {isFieldMasTest ? "Pomiar testu 5-minutowego" : "Bieg z GPS"}
          </h2>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          GPS uruchamiasz przyciskiem. Trasa pozostaje w pamięci urządzenia; zapisujemy dystans,
          czas i średnie tempo.
        </p>
      </div>

      {isFieldMasTest && !activity && !pending && !isTracking && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Najpierw bezpieczeństwo</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Wykonaj 10–12 minut spokojnej rozgrzewki na płaskiej, bezpiecznej trasie.</li>
            <li>
              Po kliknięciu „Start testu” uruchom odcinek i biegnij równo przez pełne 5 minut.
            </li>
            <li>
              Przerwij przy ostrym bólu, zawrotach głowy, bólu w klatce lub innym niepokojącym
              objawie.
            </li>
          </ol>
          <label className="mt-3 flex items-start gap-2 text-sm font-medium">
            <Checkbox
              checked={safetyAcknowledged}
              onCheckedChange={(checked) => setSafetyAcknowledged(checked === true)}
              className="mt-0.5"
            />
            <span>Przeczytałem zasady i wiem, że BallWise nie ocenia mojego stanu zdrowia.</span>
          </label>
        </div>
      )}

      {intervalProtocol && !isTracking && !pending && (
        <Disclosure title="Prowadzenie interwałowe">
          <div className="text-sm font-semibold">{intervalProtocol.summary}</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            BallWise automatycznie zmienia odcinek i przerwę, mówi komendę oraz wibruje. Krótkie
            odcinki poniżej 80 m potwierdzasz ręcznie, bo GPS telefonu nie mierzy ich dość
            dokładnie.
          </p>
          {intervalProtocol.steps.some((step) => step.target.paceTarget) && (
            <p className="mt-3 text-sm leading-relaxed">
              Tempo widzisz w min/km. <strong>Dwie krótkie wibracje</strong> oznaczają: przyspiesz.
              <strong> Jedna długa</strong>: zwolnij. Sygnał pojawia się dopiero po 8 sekundach poza
              zakresem, żeby pojedynczy błąd GPS nie sterował biegiem.
            </p>
          )}
        </Disclosure>
      )}

      {shownActivity && !isTracking && <RunActivitySummary activity={shownActivity} showSplits />}

      {isTracking && (
        <div className="bg-foreground p-5 text-background">
          {phase === "paused" ? (
            <>
              <div className="text-sm font-medium  opacity-70">Pauza</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums">
                {formatRunDuration(elapsedSec)}
              </div>
            </>
          ) : intervalProtocol && !guideStarted ? (
            <>
              <div className="text-sm font-semibold  text-primary">GPS rejestruje rozgrzewkę</div>
              <div className="mt-2 text-2xl font-semibold">Najpierw przygotuj ciało</div>
              <p className="mt-1 text-sm opacity-70">
                Po rozgrzewce uruchom pierwszy odcinek. Dalej BallWise poprowadzi Cię głosem.
              </p>
              <Button
                type="button"
                onClick={startIntervalGuide}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-primary text-primary-foreground"
              >
                <Play className="h-4 w-4" /> Start interwałów
              </Button>
            </>
          ) : currentIntervalStep ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div
                  className={`text-sm font-semibold  ${
                    currentIntervalStep.kind === "work" ? "text-primary" : "opacity-70"
                  }`}
                >
                  {currentIntervalStep.label} {currentIntervalStep.repeatIndex}/
                  {currentIntervalStep.repeatTotal}
                </div>
                <Volume2 className="h-4 w-4 opacity-60" aria-label="Komendy głosowe włączone" />
              </div>
              <div className="mt-2 text-5xl font-semibold tabular-nums">
                {intervalRemainingLabel(
                  currentIntervalStep,
                  currentStepElapsed,
                  currentStepDistance,
                )}
              </div>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/15"
                role="progressbar"
                aria-label={`Postęp: ${currentIntervalStep.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(currentStepProgress * 100)}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${Math.max(2, currentStepProgress * 100)}%` }}
                />
              </div>
              <p className="mt-3 text-sm font-medium">{currentIntervalStep.instruction}</p>
              {currentIntervalStep.target.paceTarget && (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="opacity-60">Cel</div>
                    <div className="mt-0.5 font-semibold">
                      {currentIntervalStep.target.paceTarget.label}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">Teraz</div>
                    <div className="mt-0.5 font-semibold">{formatPace(currentStepPace)}</div>
                  </div>
                  <div className="col-span-2 font-medium">
                    {paceGuidance === "speed_up"
                      ? "Przyspiesz spokojnie"
                      : paceGuidance === "slow_down"
                        ? "Zwolnij i wróć do zakresu"
                        : paceGuidance === "on_target"
                          ? "Tempo w zakresie"
                          : "Ustalam tempo z GPS…"}
                  </div>
                </div>
              )}
              <Button
                type="button"
                onClick={() => completeCurrentInterval(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold opacity-75"
              >
                <SkipForward className="h-3.5 w-3.5" /> Zakończ ten krok teraz
              </Button>
            </>
          ) : intervalProtocol && guideComplete ? (
            <>
              <div className="text-sm font-semibold  text-primary">Interwały ukończone</div>
              <div className="mt-2 text-2xl font-semibold">Teraz spokojne schłodzenie</div>
              <p className="mt-1 text-sm opacity-70">Po schłodzeniu zakończ zapis GPS.</p>
            </>
          ) : (
            <>
              <div className="text-sm font-medium  opacity-70">Rejestracja GPS</div>
              <div className="mt-2 text-4xl font-semibold tabular-nums">
                {formatRunDuration(elapsedSec)}
              </div>
            </>
          )}
          <div className="mt-3 text-sm opacity-70">{formatDistance(distanceM)}</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {phase === "recording" ? (
              <Button
                type="button"
                onClick={pauseRecording}
                className="inline-flex items-center justify-center gap-2 bg-background/15"
              >
                <Pause className="h-4 w-4" /> Pauza
              </Button>
            ) : (
              <Button
                type="button"
                onClick={resumeRecording}
                className="inline-flex items-center justify-center gap-2 bg-background/15"
              >
                <Play className="h-4 w-4" /> Wznów
              </Button>
            )}
            <Button
              type="button"
              onClick={finishRecording}
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground"
            >
              <Square className="h-4 w-4" /> Zakończ
            </Button>
          </div>
        </div>
      )}

      {gpsError && (
        <p role="alert" className="text-sm text-destructive">
          {gpsError}
        </p>
      )}

      {!isTracking && (
        <div className="flex flex-wrap gap-2">
          {!pending && canRecord && (
            <Button
              type="button"
              onClick={() => void startRecording()}
              disabled={isFieldMasTest && !safetyAcknowledged}
              className="inline-flex flex-1 items-center justify-center gap-2 bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
            >
              <LocateFixed className="h-4 w-4" />{" "}
              {activity ? "Nagraj ponownie" : isFieldMasTest ? "Start testu 5 min" : "Start GPS"}
            </Button>
          )}
          {!pending && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => gpxInputRef.current?.click()}
                className="flex-1"
              >
                <FileUp className="h-4 w-4" /> Wczytaj GPX
              </Button>
              <input
                ref={gpxInputRef}
                type="file"
                accept=".gpx,application/gpx+xml"
                className="sr-only"
                onChange={(event) => {
                  void importGpx(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </>
          )}
          {pending && (
            <>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void savePending()}
                className="inline-flex flex-1 items-center justify-center gap-2 bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? "Zapisuję…" : "Zapisz bieg"}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPending(null);
                  setPhase("idle");
                }}
                className=""
              >
                Odrzuć
              </Button>
            </>
          )}
          {activity && !pending && (
            <Button
              type="button"
              onClick={() => setDeleteOpen(true)}
              aria-label="Usuń wynik biegu"
              variant="ghost"
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      {!canRecord && !activity && !pending && (
        <p className="text-sm text-muted-foreground">
          GPS uruchomisz w dniu treningu. Starszy wynik możesz obliczyć lokalnie z pliku GPX.
        </p>
      )}
      {canRecord && !isTracking && !activity && !pending && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Dla pewniejszego zapisu zostaw BallWise otwarte podczas biegu. Po starcie schowaj telefon
          do kieszeni — nie trzeba go trzymać w dłoni.
        </p>
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Usunąć wynik biegu?"
        description="Zapis dystansu, czasu i tempa zostanie usunięty."
        onConfirm={() => void removeActivity()}
        confirmLabel="Usuń wynik"
        busy={deleting}
        destructive
      />
    </section>
  );
}
