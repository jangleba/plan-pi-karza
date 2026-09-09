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
  const [phase, setPhase] = useState<TrackerPhase>("idle");
  const [route, setRoute] = useState<RoutePoint[]>([]);
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
    };
    routeRef.current = [...routeRef.current, point].slice(-5_200);
    setRoute(routeRef.current);
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

  useEffect(
    () => () => {
      stopWatch();
      void releaseWakeLock();
    },
    [],
  );

  async function startRecording() {
    setGpsError(null);
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
      setRoute([firstPoint]);
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
    } catch {
      toast.error("Nie udało się zapisać biegu. Dane zostały na ekranie — spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }

  async function removeActivity() {
    if (!activity || !window.confirm("Usunąć zapis wyniku biegu?")) return;
    try {
      await onDelete(activity.id);
      toast.success("Trasa biegu została usunięta.");
    } catch {
      toast.error("Nie udało się usunąć trasy.");
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

  return (
    <section className="soft-card space-y-4 p-4" aria-labelledby="run-tracker-title">
      <div>
        <div className="flex items-center gap-2">
          <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="run-tracker-title" className="text-sm font-semibold">
            Bieg z GPS
          </h2>
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            prywatny
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          GPS włącza się dopiero po Twoim kliknięciu. Trasa służy tylko do obliczenia wyniku w
          pamięci telefonu. Do bazy trafiają wyłącznie dystans, czas i średnie tempo.
        </p>
      </div>

      {intervalProtocol && !isTracking && !pending && (
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Prowadzenie interwałowe
          </div>
          <div className="mt-1.5 text-sm font-semibold">{intervalProtocol.summary}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            BallWise automatycznie zmienia odcinek i przerwę, mówi komendę oraz wibruje. Krótkie
            odcinki poniżej 80 m potwierdzasz ręcznie, bo GPS telefonu nie mierzy ich dość
            dokładnie.
          </p>
          {intervalProtocol.steps.some((step) => step.target.paceTarget) && (
            <p className="mt-2 rounded-xl bg-background/70 px-3 py-2 text-xs leading-relaxed">
              Tempo widzisz w min/km. <strong>Dwie krótkie wibracje</strong> oznaczają: przyspiesz.
              <strong> Jedna długa</strong>: zwolnij. Sygnał pojawia się dopiero po 8 sekundach poza
              zakresem, żeby pojedynczy błąd GPS nie sterował biegiem.
            </p>
          )}
        </div>
      )}

      {shownActivity && !isTracking && <RunActivitySummary activity={shownActivity} showSplits />}

      {isTracking && (
        <div className="rounded-2xl bg-foreground p-5 text-background">
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
                GPS rejestruje rozgrzewkę
              </div>
              <div className="mt-2 text-2xl font-semibold">Najpierw przygotuj ciało</div>
              <p className="mt-1 text-sm opacity-70">
                Po rozgrzewce uruchom pierwszy odcinek. Dalej BallWise poprowadzi Cię głosem.
              </p>
              <button
                type="button"
                onClick={startIntervalGuide}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                <Play className="h-4 w-4" /> Start interwałów
              </button>
            </>
          ) : currentIntervalStep ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div
                  className={`text-xs font-semibold uppercase tracking-[0.18em] ${
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
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-background/10 p-3 text-xs">
                  <div>
                    <div className="opacity-60">Cel</div>
                    <div className="mt-0.5 font-semibold">{currentIntervalStep.target.paceTarget.label}</div>
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
              <button
                type="button"
                onClick={() => completeCurrentInterval(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold opacity-75"
              >
                <SkipForward className="h-3.5 w-3.5" /> Zakończ ten krok teraz
              </button>
            </>
          ) : intervalProtocol && guideComplete ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Interwały ukończone
              </div>
              <div className="mt-2 text-2xl font-semibold">Teraz spokojne schłodzenie</div>
              <p className="mt-1 text-sm opacity-70">Po schłodzeniu zakończ zapis GPS.</p>
            </>
          ) : (
            <>
              <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
                Rejestracja GPS
              </div>
              <div className="mt-2 text-4xl font-semibold tabular-nums">
                {formatRunDuration(elapsedSec)}
              </div>
            </>
          )}
          <div className="mt-3 text-xs opacity-70">
            {formatRunDuration(elapsedSec)} · {formatDistance(distanceM)} · {route.length} punktów
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {phase === "recording" ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-background/15 px-4 py-3 text-sm font-semibold"
              >
                <Pause className="h-4 w-4" /> Pauza
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-background/15 px-4 py-3 text-sm font-semibold"
              >
                <Play className="h-4 w-4" /> Wznów
              </button>
            )}
            <button
              type="button"
              onClick={finishRecording}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              <Square className="h-4 w-4" /> Zakończ
            </button>
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
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground active:scale-95"
            >
              <LocateFixed className="h-4 w-4" /> {activity ? "Nagraj ponownie" : "Start GPS"}
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
                <Save className="h-4 w-4" /> {saving ? "Zapisuję…" : "Zapisz bieg"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPending(null);
                  setPhase("idle");
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
          Dla pewniejszego zapisu zostaw BallWise otwarte podczas biegu. Po starcie schowaj telefon
          do kieszeni — nie trzeba go trzymać w dłoni.
        </p>
      )}
    </section>
  );
}
