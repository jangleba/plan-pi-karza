import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, Loader2, ScanLine, Video, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisionLivePoseOverlay } from "./VisionLivePoseOverlay";
import { EMPTY_LIVE_POSE_STATUS, type LivePoseStatus } from "./visionLivePose";
import { closePoseEngine } from "@/features/vision-analysis/poseEngine";
import {
  AUTO_RECORDING_SECONDS,
  IDLE_COUNTDOWN,
  START_HOLD_MS,
  STABLE_POSE_MS,
  cameraErrorMessage,
  classifyCameraError,
  cueForCountdown,
  formatElapsed,
  isAthleteReady,
  nextCountdownState,
  type CountdownState,
} from "./recorderCountdown";

type RecorderMode = "idle" | "starting" | "preview" | "recording" | "processing";

interface VisionRecorderProps {
  minimumFps: number;
  onRecorded: (file: File, detectedFps: number | null) => Promise<void>;
}

function supportedMimeType(): string | undefined {
  const candidates = ["video/mp4;codecs=h264", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function speak(message: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "pl-PL";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

export function VisionRecorder({ minimumFps, onRecorded }: VisionRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const stablePoseRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const detectedFpsRef = useRef<number | null>(null);

  const [mode, setMode] = useState<RecorderMode>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detectedFps, setDetectedFps] = useState<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [poseStatus, setPoseStatus] = useState<LivePoseStatus>(EMPTY_LIVE_POSE_STATUS);
  const [autoArmed, setAutoArmed] = useState(false);
  const [countdown, setCountdown] = useState<CountdownState>(IDLE_COUNTDOWN);
  const [flashActive, setFlashActive] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
    if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
    stablePoseRef.current = null;
    countdownTimerRef.current = null;
    flashTimerRef.current = null;
  }, []);

  const closeCamera = useCallback(() => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Recorder mógł zostać już zatrzymany przez przeglądarkę.
      }
    }
    recorderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setPreviewReady(false);
    setPoseStatus(EMPTY_LIVE_POSE_STATUS);
    setAutoArmed(false);
    setCountdown(IDLE_COUNTDOWN);
    setFlashActive(false);
  }, [clearTimers]);

  // Pełne sprzątanie przy unmount / zmianie trasy: kamera, timery, audio, pose engine.
  useEffect(() => {
    return () => {
      closeCamera();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      void context?.close().catch(() => undefined);
      void closePoseEngine();
    };
  }, [closeCamera]);

  const cameraActive = mode === "preview" || mode === "recording" || mode === "processing";

  // Blokada przewijania body na czas pełnoekranowego trybu kamery.
  useEffect(() => {
    if (!cameraActive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cameraActive]);

  useEffect(() => {
    if (mode !== "preview" && mode !== "recording") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) setPreviewReady(true);
    };
    const attachPreview = async () => {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (video.srcObject !== stream) video.srcObject = stream;
      try {
        await video.play();
        markReady();
      } catch {
        if (!cancelled) setError(cameraErrorMessage("PREVIEW_BLOCKED"));
      }
    };

    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    void attachPreview();
    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
    };
  }, [mode]);

  // Przerwany stream (np. odebranie kamery przez system) ma dać czytelny komunikat.
  useEffect(() => {
    if (!cameraActive) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const onEnded = () => {
      setError(cameraErrorMessage("STREAM_INTERRUPTED"));
      closeCamera();
      setMode("idle");
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [cameraActive, closeCamera]);

  const pulseTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.getCapabilities) return;
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    if (!capabilities.torch) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      window.setTimeout(() => {
        void track
          .applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })
          .catch(() => undefined);
      }, 140);
    } catch {
      // Latarka nie jest gwarantowana w przeglądarkach mobilnych; błysk ekranu jest fallbackiem.
    }
  }, []);

  const signalCue = useCallback(
    (frequency: number, durationMs: number) => {
      setFlashActive(true);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        flashTimerRef.current = null;
        setFlashActive(false);
      }, durationMs);
      if (navigator.vibrate) navigator.vibrate(durationMs);
      void pulseTorch();

      const context = audioContextRef.current;
      if (!context || context.state === "closed") return;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.3, context.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + durationMs / 1000 + 0.02);
      } catch {
        setAudioAvailable(false);
      }
    },
    [pulseTorch],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") return true;
    if (typeof MediaRecorder === "undefined") {
      setError(cameraErrorMessage("RECORDER_UNSUPPORTED"));
      return false;
    }

    setError(null);
    chunksRef.current = [];
    const mimeType = supportedMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError(cameraErrorMessage("RECORDER_UNSUPPORTED"));
      return false;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setError(cameraErrorMessage("STREAM_INTERRUPTED"));
    };
    recorder.onstop = async () => {
      clearTimers();
      setMode("processing");
      const type = recorder.mimeType || mimeType || "video/webm";
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `ballwise-sprint-${Date.now()}.${extension}`, {
        type,
        lastModified: Date.now(),
      });
      closeCamera();
      try {
        await closePoseEngine();
        await onRecorded(file, detectedFpsRef.current);
        setMode("idle");
        setElapsedSeconds(0);
      } catch {
        setError("Film został nagrany, ale nie udało się go przygotować. Spróbuj ponownie.");
        setMode("idle");
      }
    };
    recorder.start(250);
    setElapsedSeconds(0);
    setMode("recording");
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return true;
  }, [clearTimers, closeCamera, onRecorded]);

  // Jedno odliczanie: 3 → 2 → 1 → START, każdy krok z beepem i własnym czasem trwania.
  useEffect(() => {
    if (countdown.phase === "idle") return;
    const cue = cueForCountdown(countdown);
    if (!cue) return;
    signalCue(cue.frequency, cue.durationMs);
    if (countdown.phase === "start") speak("Start");

    if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
    countdownTimerRef.current = window.setTimeout(() => {
      countdownTimerRef.current = null;
      const next = nextCountdownState(countdown);
      if (next) {
        setCountdown(next);
        return;
      }
      setCountdown(IDLE_COUNTDOWN);
    }, cue.holdMs);

    // Auto-stop liczony dokładnie od sygnału START.
    if (countdown.phase === "start") {
      if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
      autoStopRef.current = window.setTimeout(() => {
        autoStopRef.current = null;
        stopRecording();
      }, AUTO_RECORDING_SECONDS * 1000);
    }

    return () => {
      if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    };
  }, [countdown, signalCue, stopRecording]);

  const athleteReady = isAthleteReady(poseStatus);

  useEffect(() => {
    if (!autoArmed || mode !== "preview" || !previewReady || !athleteReady) {
      if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
      stablePoseRef.current = null;
      return;
    }
    if (stablePoseRef.current !== null) return;
    stablePoseRef.current = window.setTimeout(() => {
      stablePoseRef.current = null;
      setAutoArmed(false);
      // Nagrywanie rusza przed odliczaniem, żeby zachować materiał sprzed sygnału START.
      if (!startRecording()) return;
      setCountdown({ phase: "digit", value: 3 });
    }, STABLE_POSE_MS);
    return () => {
      if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
      stablePoseRef.current = null;
    };
  }, [athleteReady, autoArmed, mode, previewReady, startRecording]);

  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(cameraErrorMessage("NO_CAMERA"));
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError(cameraErrorMessage("RECORDER_UNSUPPORTED"));
      return;
    }

    // AudioContext tworzony w geście użytkownika — inaczej iOS zablokuje dźwięk.
    try {
      audioContextRef.current ??= new AudioContext();
      await audioContextRef.current.resume();
      setAudioAvailable(audioContextRef.current.state === "running");
    } catch {
      setAudioAvailable(false);
    }

    setMode("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 120, max: 240 },
        },
      });
      streamRef.current = stream;
      const fps = stream.getVideoTracks()[0]?.getSettings().frameRate;
      const rounded = typeof fps === "number" ? Math.round(fps) : null;
      detectedFpsRef.current = rounded;
      setDetectedFps(rounded);
      setPreviewReady(false);
      setMode("preview");
      // Jeden świadomy gest: kamera startuje i tryb solo jest od razu uzbrojony.
      setAutoArmed(true);
    } catch (cameraError) {
      closeCamera();
      setMode("idle");
      setError(cameraErrorMessage(classifyCameraError(cameraError)));
    }
  }

  function closeFullscreen() {
    closeCamera();
    setMode("idle");
    setElapsedSeconds(0);
  }

  function cancelAutomaticRecording() {
    setAutoArmed(false);
    setCountdown(IDLE_COUNTDOWN);
    if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
    stablePoseRef.current = null;
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
  }

  const lowFps = detectedFps !== null && detectedFps < minimumFps;

  if (mode === "idle" || mode === "starting") {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Kamera służy do pomiaru czasu i informacji technicznej. Dźwięk nie jest nagrywany. Film
          jest analizowany na tym urządzeniu i nie jest wysyłany bez osobnej decyzji.
        </p>
        <Button
          className="h-14 w-full rounded-2xl"
          size="lg"
          onClick={openCamera}
          disabled={mode === "starting"}
        >
          {mode === "starting" ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Uruchamianie kamery…
            </>
          ) : (
            <>
              <Camera className="mr-2 h-5 w-5" /> Nagraj test w BallWise
            </>
          )}
        </Button>
        {!audioAvailable && (
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">
            Dźwięk jest niedostępny na tym urządzeniu — zostanie błysk ekranu i odliczanie wizualne.
          </p>
        )}
        {error && <p className="px-2 text-xs leading-relaxed text-destructive">{error}</p>}
      </div>
    );
  }

  const countdownLabel =
    countdown.phase === "digit" ? String(countdown.value) : countdown.phase === "start" ? "START" : null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black text-white"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-label="Kamera BallWise"
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-contain"
      />
      <VisionLivePoseOverlay
        videoRef={videoRef}
        active={(mode === "preview" || mode === "recording") && previewReady}
        onStatus={setPoseStatus}
      />

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute inset-y-0 left-[12%] border-l border-dashed border-white/55" />
        <div className="absolute inset-y-0 right-[12%] border-r border-dashed border-white/55" />
        <div className="absolute inset-x-[12%] top-1/2 border-t border-white/25" />
      </div>

      {!previewReady && mode !== "processing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black text-sm">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Łączenie z kamerą…
        </div>
      )}

      {flashActive && <div className="pointer-events-none absolute inset-0 z-40 bg-white/85" />}

      {countdownLabel && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/35">
          <span
            className={`flex items-center justify-center rounded-full bg-blue-600 font-black shadow-2xl ${
              countdown.phase === "start"
                ? "px-8 py-5 text-3xl tracking-widest"
                : "h-28 w-28 text-6xl"
            }`}
          >
            {countdownLabel}
          </span>
        </div>
      )}

      {/* Górny pasek: stan nagrywania, FPS, zamknięcie. */}
      <div
        className="absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          {mode === "recording" ? (
            <span className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              NAGRYWANIE · {formatElapsed(elapsedSeconds)}
            </span>
          ) : (
            <span className="rounded-full bg-white/15 px-3 py-1.5">PODGLĄD</span>
          )}
          <span
            className={`rounded-full px-3 py-1.5 ${lowFps ? "bg-amber-500/90" : "bg-emerald-500/90"}`}
          >
            {detectedFps ? `${detectedFps} FPS` : "FPS: wykrywanie"}
          </span>
        </div>
        <button
          type="button"
          onClick={closeFullscreen}
          aria-label="Zamknij kamerę"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/60"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Dolny kompaktowy overlay sterowania. */}
      <div
        className="absolute inset-x-0 bottom-0 z-40 space-y-3 bg-gradient-to-t from-black/85 to-transparent px-4 pt-8"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
      >
        <div className="grid grid-cols-3 gap-2">
          <PreflightChip label="1 zawodnik" ready={poseStatus.singleAthlete} />
          <PreflightChip label="Cała sylwetka" ready={poseStatus.fullBody} />
          <PreflightChip label="Kadr sprintu" ready={poseStatus.timingReady} />
        </div>

        {lowFps && (
          <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-[11px] text-amber-100">
            Kamera udostępniła {detectedFps} FPS. Wynik będzie estymacją techniczną.
          </p>
        )}

        {autoArmed && (
          <p className="rounded-xl bg-blue-400/15 px-3 py-2 text-center text-[11px] text-blue-100">
            Tryb solo aktywny. Ustaw się na START — po 1,5 s stabilnej pozycji ruszy odliczanie.
          </p>
        )}

        {mode === "processing" ? (
          <div className="flex h-11 items-center justify-center text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Przygotowywanie filmu…
          </div>
        ) : mode === "recording" ? (
          <Button variant="destructive" className="w-full" size="lg" onClick={stopRecording}>
            <CircleStop className="mr-2 h-5 w-5" /> Zatrzymaj nagranie
          </Button>
        ) : autoArmed ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button variant="secondary" className="w-full" size="lg" onClick={cancelAutomaticRecording}>
              Anuluj tryb automatyczny
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11"
              onClick={startRecording}
              aria-label="Rozpocznij nagranie ręcznie"
            >
              <Video className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button className="w-full" size="lg" onClick={() => setAutoArmed(true)}>
              <ScanLine className="mr-2 h-5 w-5" /> Uzbrój tryb solo
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11"
              onClick={startRecording}
              aria-label="Rozpocznij nagranie ręcznie"
            >
              <Video className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!audioAvailable && (
          <p className="text-center text-[11px] text-white/70">
            Dźwięk niedostępny — zostaje błysk ekranu i odliczanie wizualne.
          </p>
        )}
        {error && <p className="px-1 text-[11px] leading-relaxed text-red-200">{error}</p>}
      </div>
    </div>
  );
}

function PreflightChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${
        ready ? "bg-emerald-500/25 text-emerald-100" : "bg-white/10 text-white/60"
      }`}
    >
      {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ScanLine className="h-3.5 w-3.5" />}
      <span className="truncate">{label}</span>
    </div>
  );
}
