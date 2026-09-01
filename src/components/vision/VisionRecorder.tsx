import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisionLivePoseOverlay } from "./VisionLivePoseOverlay";
import {
  EMPTY_LIVE_POSE_STATUS,
  isLivePoseReadyForTest,
  type LivePoseStatus,
} from "./visionLivePose";
import { closePoseEngine } from "@/features/vision-analysis/poseEngine";
import type { TestType } from "@/features/vision-analysis/types";
import {
  AUTO_RECORDING_SECONDS,
  IDLE_COUNTDOWN,
  START_HOLD_MS,
  cameraErrorMessage,
  classifyCameraError,
  cueForCountdown,
  formatElapsed,
  nextCountdownState,
  type CountdownState,
} from "./recorderCountdown";

type RecorderMode = "idle" | "starting" | "preview" | "recording" | "processing";

interface VisionRecorderProps {
  minimumFps: number;
  testType: TestType;
  buttonLabel?: string;
  onRecorded: (file: File, detectedFps: number | null) => Promise<void>;
}

type RecordingOrientation = "portrait" | "landscape";

const LANDSCAPE_TESTS = new Set<TestType>([
  "sprint_20m",
  "sprint_30m",
  "flying_sprint",
  "five_ten_five",
  "sprint_to_stop",
]);

/** Sprint/COD potrzebuje szerokiego kadru. Skoki i technika korzystają z pionu. */
export function requiredRecordingOrientation(testType: TestType): RecordingOrientation {
  return LANDSCAPE_TESTS.has(testType) ? "landscape" : "portrait";
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

export function VisionRecorder({
  minimumFps,
  testType,
  buttonLabel = "Nagraj test w BallWise",
  onRecorded,
}: VisionRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const detectedFpsRef = useRef<number | null>(null);

  const [mode, setMode] = useState<RecorderMode>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detectedFps, setDetectedFps] = useState<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [poseStatus, setPoseStatus] = useState<LivePoseStatus>(EMPTY_LIVE_POSE_STATUS);
  const [countdown, setCountdown] = useState<CountdownState>(IDLE_COUNTDOWN);
  const [preparationActive, setPreparationActive] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(true);
  const requiredOrientation = requiredRecordingOrientation(testType);
  const orientationReady = requiredOrientation === "landscape" ? isLandscape : !isLandscape;

  useEffect(() => {
    const updateOrientation = () => setIsLandscape(window.innerWidth > window.innerHeight);
    updateOrientation();
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);
    return () => {
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
    };
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
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
    setCountdown(IDLE_COUNTDOWN);
    setPreparationActive(false);
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
    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
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
    if (recorder?.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        // Safari może nie wspierać ręcznego flush; stop() i tak wysyła ostatni chunk.
      }
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!orientationReady) {
      setError(
        requiredOrientation === "landscape"
          ? "Obróć telefon poziomo, aby rozpocząć nagranie."
          : "Ustaw telefon pionowo, aby rozpocząć nagranie.",
      );
      return false;
    }
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
      if (blob.size === 0) {
        closeCamera();
        setError("Nagranie jest puste. Otwórz kamerę i spróbuj ponownie.");
        setMode("idle");
        return;
      }
      const file = new File([blob], `ballwise-${testType}-${Date.now()}.${extension}`, {
        type,
        lastModified: Date.now(),
      });
      closeCamera();
      try {
        // Zwolnienie podglądowego modelu pozy nie może zatrzymać przekazania
        // gotowego pliku. closePoseEngine odłącza sesję od razu, a domyka ją w tle.
        void closePoseEngine();
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
  }, [clearTimers, closeCamera, onRecorded, orientationReady, requiredOrientation, testType]);

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

  const athleteReady = isLivePoseReadyForTest(poseStatus, testType);

  const beginTest = useCallback(() => {
    // Najważniejsza gwarancja przepływu: kliknięcie od razu tworzy aktywny
    // MediaRecorder. Szkielet pomaga ustawić kadr, ale nie może blokować pliku.
    if (!startRecording()) return;
    setPreparationActive(true);
    // Film już się zapisuje, a zawodnik ma czas odejść od telefonu i stanąć
    // w pełnym kadrze. Dopiero potem rozpoczyna się właściwe 3–2–1–START.
    countdownTimerRef.current = window.setTimeout(() => {
      countdownTimerRef.current = null;
      setPreparationActive(false);
      setCountdown({ phase: "digit", value: 3 });
    }, 4_000);
  }, [startRecording]);

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

  const lowFps = detectedFps !== null && detectedFps < minimumFps;
  const liveMessage = !poseStatus.detected
    ? "Ustaw całą sylwetkę w kadrze"
    : !poseStatus.singleAthlete
      ? "W kadrze może być tylko jedna osoba"
      : !poseStatus.fullBody
        ? "Odsuń kamerę — pokaż ciało od głowy do stóp"
        : athleteReady
          ? "Zawodnik wykryty · gotowe"
          : "Dopasuj odległość, aż szkielet będzie cały widoczny";

  if (mode === "idle" || mode === "starting") {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Kamera wykrywa sylwetkę i pozycję stawów, aby policzyć czas oraz opisać technikę ruchu.
          Dźwięk nie jest nagrywany. Film pozostaje na tym urządzeniu; do konta zapisuje się tylko
          wynik i jakość pomiaru.
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
              <Camera className="mr-2 h-5 w-5" /> {buttonLabel}
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
    countdown.phase === "digit"
      ? String(countdown.value)
      : countdown.phase === "start"
        ? "START"
        : null;

  return (
    <div
      className="fixed inset-0 z-[70] h-[100dvh] w-screen max-w-none overflow-hidden overscroll-none bg-[#04142f] text-white"
      role="dialog"
      aria-modal="true"
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
        active={(mode === "preview" || mode === "recording") && previewReady && orientationReady}
        onStatus={setPoseStatus}
      />

      {!previewReady && mode !== "processing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black text-sm">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Łączenie z kamerą…
        </div>
      )}

      {flashActive && <div className="pointer-events-none absolute inset-0 z-40 bg-white/85" />}

      {!orientationReady && mode === "preview" && previewReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#04142f]/95 px-8 text-center">
          <RotateCcw className="h-12 w-12 text-blue-400" />
          <div>
            <p className="text-xl font-bold">
              {requiredOrientation === "landscape" ? "Obróć telefon poziomo" : "Ustaw telefon pionowo"}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {requiredOrientation === "landscape"
                ? "Sprint i testy biegowe nagrywamy w szerokim kadrze."
                : "CMJ i pozostałe skoki nagrywamy w pionowym kadrze całej sylwetki."}
            </p>
          </div>
          <button
            type="button"
            onClick={closeFullscreen}
            className="mt-2 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold"
          >
            Zamknij kamerę
          </button>
        </div>
      )}

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

      {/* Tylko stan wykrywania i sterowanie — bez dekoracyjnych linii i listy technicznej. */}
      <div
        className="absolute inset-x-0 bottom-0 z-40 space-y-2 bg-gradient-to-t from-black/85 to-transparent px-4 pt-8"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
      >
        {mode !== "processing" && (
          <div
            className={`mx-auto w-fit max-w-full rounded-full px-4 py-2 text-center text-xs font-semibold backdrop-blur ${
              athleteReady ? "bg-emerald-500/85 text-white" : "bg-black/65 text-white"
            }`}
          >
            {preparationActive ? "Ustaw się w kadrze · odliczanie za chwilę" : liveMessage}
          </div>
        )}

        {mode === "processing" ? (
          <div className="flex h-11 items-center justify-center text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Przygotowywanie filmu…
          </div>
        ) : mode === "recording" ? (
          <Button variant="destructive" className="w-full" size="lg" onClick={stopRecording}>
            <CircleStop className="mr-2 h-5 w-5" /> Zatrzymaj nagranie
          </Button>
        ) : (
          <Button className="w-full" size="lg" onClick={beginTest} disabled={!previewReady || !orientationReady}>
            <Camera className="mr-2 h-5 w-5" /> Rozpocznij nagranie
          </Button>
        )}

        {error && <p className="px-1 text-[11px] leading-relaxed text-red-200">{error}</p>}
      </div>
    </div>
  );
}
